# 数据库备份、恢复与应用回滚

更新日期：2026-10-13（Asia/Shanghai）

本文是运维步骤，适用于当前 0000–0005 迁移。开发隔离演练结果见[质量记录](quality-log.md#database-recovery-2026-10-13)，发布门槛见[上线计划](plans/release.md#database-recovery)。不在应用启动、构建或发布时自动执行恢复。

## 环境与备份边界

使用 PostgreSQL 官方 `pg_dump`、`pg_restore` 和 `psql`，客户端主版本不得低于源数据库。Neon 使用 direct endpoint；先核对平台分支、endpoint 和数据库名，不能靠 `NODE_ENV` 或文件名判断环境。演练只在开发分支新建源库和恢复库，用现有迁移初始化源库、写入合成数据；不复制生产数据，也不覆盖默认开发库。

使用受限的 PostgreSQL service/pass 文件提供连接配置；文件放在仓库外，目录 `0700`、文件 `0600`。下文 `recovery-source`、`recovery-target` 是运维者已核实的 service 名称，不是数据库默认值。连接串和密码不放入命令参数、终端输出、PR 或质量记录。

备份至少包括 `public` 和 `drizzle` 两个 schema；后者保存迁移历史。R2 图片、环境变量、数据库角色和解密密钥不在这份逻辑备份中。`KEY_ENCRYPTION_KEYS` 的所有在用版本单独保管；只保留当前 `KEY_ENCRYPTION_VERSION` 对应密钥会使旧凭据无法恢复。真实备份还包含邮箱、密码哈希和阅读数据，应保存到加密、受限的存储，不能提交到 Git。

演练文件仅在本次操作期间保留，结束删除。本轮没有配置生产自动备份：生产启用前须记录实际服务商恢复窗口、备份频率、保留期限、加密存储与到期删除方式，并实测对应恢复点；本次小数据逻辑恢复耗时不能作为生产 RPO/RTO 承诺。

## 备份与空库恢复

```sh
umask 077
# BACKUP_DIR 为仓库外、本轮新建的私有目录；不得覆盖已有备份。
PGSERVICE=recovery-source pg_dump --format=custom --no-owner --no-acl \
  --schema=public --schema=drizzle --strict-names \
  --file="$BACKUP_DIR/database.dump"
shasum -a 256 "$BACKUP_DIR/database.dump" > "$BACKUP_DIR/database.dump.sha256"
pg_restore --list "$BACKUP_DIR/database.dump"
```

记录备份开始/结束时间、代码提交、源 PostgreSQL/客户端版本、迁移数量与哈希、各表行数，以及档案 SHA-256；不记录业务正文。演练暂停源库写入后额外逐表比较内容摘要。生产在线 `pg_dump` 自身提供一致快照，但备份前后另行查询的行数可能变化，不能把这种差异误判为备份损坏。

恢复目标必须是新建空库，且尚未绑定应用、清理任务或公开路由。先核对目标 endpoint 和库名，并查询非系统表，确认没有业务表。不要把 `--clean`、`--create` 或原库覆盖恢复当作默认操作。迁移历史也随备份恢复，不能先迁移空目标再往里面导入同一份结构。

```sh
shasum -a 256 -c "$BACKUP_DIR/database.dump.sha256"
# 新库默认 public 已存在；本次按 schema 导出的档案会重新创建它。
# 不使用 CASCADE；如果 public 并非空 schema，此命令必须失败并停止恢复。
PGSERVICE=recovery-target psql -X -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public;'
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  --dbname='service=recovery-target' "$BACKUP_DIR/database.dump"
```

这里 `--dbname` 使用 libpq 的 service 连接参数，实际库名来自已核实的 service 配置，不把 service 名当作数据库名。

`--no-owner --no-acl` 不还原源角色的所有权与授权；使用目标运维角色恢复后，按目标环境重新核对应用角色的表/序列权限。不能把源库角色或连接配置默认复制到恢复环境。

恢复命令必须成功退出；失败时保留隔离，检查原因后重新使用空目标库。`--single-transaction` 避免一部分表成功、一部分失败的半恢复状态。随后核对迁移历史、表/索引/外键、行数及合成数据摘要，并用独立保管的旧/新密钥版本核对凭据解密。密钥缺失或认证标签错误时停止开放服务，不以重生成密钥处理。

## 恢复点之后的删除与撤销

数据库恢复也会恢复当时仍存在的账号、密码、Key、会话和附件元信息。操作前冻结原服务写入与定时任务，保留原库用于核对；仅关闭反馈/管理开关不能阻止其他写入。收集从备份开始到冻结完成的删除/撤销记录，保存在恢复库和备份之外。记录至少含事件编号、时间、动作、目标 ID；对象删除另含 object key 与字节数，不保存 Key、Cookie 或正文。

当前同库 `console_audit` 和 `feedback_object_delete` 不能保证灾难后获得恢复点之后的全部事件，自助 Key 撤销等也没有独立持久日志。本次演练使用单独保存的合成操作清单；这不代表生产已有可靠的删除日志。若无法证明记录完整，恢复环境保持隔离，不能重新开放旧账号、凭据或附件。

在恢复库重放已核实的操作，先处理持久对象，再清除所有临时状态：

1. 账号删除复用 `server/feedback/lifecycle.ts` 的 `removeAccount(tx, userId)`，事务内先锁用户；反馈删除复用 `removeFeedback(tx, 条件)`。它们先将附件转为独立删除任务，再移除元信息并更新提交回执，不直接绕过保护性外键删除账号。
2. 撤销账号 Key 时删除对应 `weread_credential`。密码重置、认证凭据撤销必须重放，或停用受影响账号的旧密码认证并安排重新验证，不能只清会话后允许旧密码重新登录。
3. 恢复点后的对象删除任务合并至 `feedback_object_delete`，以 object key 去重、保留字节数与较晚的安全执行时间；仍有关联的附件同时撤销元信息。R2 已删除的图片不从旧备份补回，缺图按 `SCREENSHOT_GONE` 处理。
4. 停止所有写入与旧采集请求，等待旧上传请求的执行上限及上传租约安全期结束后，在恢复库执行下面事务。全部旧会话、验证码、游客连接、报告及短期回执失效，用户重新登录、游客重新接入。

```sql
BEGIN;
DELETE FROM public.reading_report;
DELETE FROM public.report_replacement;
DELETE FROM public.connection_save;
DELETE FROM public.auth_session;
DELETE FROM public.auth_verification;
DELETE FROM public.console_auth_session;
DELETE FROM public.console_auth_verification;
DELETE FROM public.guest_connection;
DELETE FROM public.feedback_submission;
DELETE FROM public.feedback_context;
-- 限流继续保留；反馈、审计、管理员、未撤销的账号/Key 和对象删除任务也保留。
COMMIT;
```

重放过程只使用目标恢复库的专用进程；现有 `getDb()` 会缓存连接，不能在已导入应用的同一进程里改 `DATABASE_URL` 来切库。恢复库仍不开放反馈写入，再用 `drainObjectDeletes` 处理到期任务，确认容量与对象状态。不能提前删除租约，导致迟到上传在清理后重新产生孤儿对象。

手工 API 核对旧前台/后台/游客 Cookie 被拒绝、撤销账号与 Key 不复活、保留账号可以重新登录、缺图返回 410，且反馈关闭时删除任务仍能处理。检查通过也不自动代表生产可切换；生产还须完成上述独立事件记录、备份存储、写入冻结和恢复配置的实际接入。

## 应用回滚

应用回滚与数据库恢复分开执行。只因新应用发布异常时，保留数据库现状，先关闭本批新增入口并停止新写入，选择与当前结构兼容的旧静态/Functions 部署；不要恢复旧数据库或反向删表。

在当前 0000–0005 结构下，本次演练候选为 `0cb7103`（C3 管理写操作完成）：具备 C2 账号删除/附件清理和 C3 游客清除回执。更早版本需要单独证明这两项兼容能力；不能直接回到反馈或游客回执实现之前。后续迁移或权限行为变化后需重新选择候选，不能无限沿用本次证据。实际平台回滚应选择包含兼容代码的已成功部署 ID，并记录当时环境变量；旧产物与当前平台配置是否匹配须另行核对。

开发演练从该提交取出原始代码，在恢复库上启动独立进程，关闭 `FEEDBACK_ENABLED` 与 `CONSOLE_DATA_ENABLED`，核对保留账号登录、旧会话失效、新功能拒绝、新增字段及迁移历史不变，并处理恢复的对象删除任务。演练完成后运行当前提交的迁移命令，确认无重复迁移、数据和回执保留，再恢复当前代码。此过程不切换 Netlify 生产部署，也不证明平台回滚已实测。

结束后关闭本轮进程及连接，只删除本轮创建的数据库、合成 R2 对象、备份、独立密钥和事件清单；回查临时库与对象均已清理。不能使用无前缀筛选的批量删库或清桶命令。

参考 PostgreSQL 官方 [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) 与 [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)。
