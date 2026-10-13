# 数据库备份、独立撤销日志与恢复

更新日期：2026-10-13（Asia/Shanghai）

适用于 0000–0005 迁移。实现位于 `server/recovery/`、`scripts/database-recovery.ts` 和 `.github/workflows/database-backup.yml`；本批只在隔离开发库演练，生产尚未配置或启用。最新证据见[质量记录](quality-log.md#recovery-journal-2026-10-13)，此前原生备份与兼容代码回滚见[历史演练](quality-log.md#database-recovery-2026-10-13)。恢复不会随启动、构建或部署执行。

## 备份策略与存储

| 项目         | 初始策略                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| 频率         | 每日上海时间 03:00，由 GitHub Actions 调度；也可手动执行同一工作流            |
| 备份         | PostgreSQL 官方 `pg_dump` custom 格式，包含 `public` 与 `drizzle`；保留 7 天  |
| 独立日志     | 数据库之外的私有 R2；删除/撤销先确认写入，再执行数据库变更；保留 30 天        |
| 加密         | 档案、摘要和元信息整体 AES-256-GCM 加密；备份密钥独立于应用 Key 解密密钥      |
| 保留与防覆盖 | 专用私有 bucket；备份锁 7 天、日志锁 30 天，同前缀配置生命周期到期删除        |
| 恢复窗口     | 工具只接受不足 7 天的档案，超过期限立即拒绝，不依赖生命周期物理删除是否已完成 |
| 容量         | 单次原始档案上限 128 MiB，超过即失败；后续需要扩大时改为流式/分段上传         |
| 恢复目标     | 新建空库，保持离线；禁止覆盖原库、`--clean` 或反向删表                        |

配置载荷为 [R2 生命周期](../ops/recovery-lifecycle.json) 与 [R2 保留锁](../ops/recovery-locks.json)，按 `recovery/production/backups/` 和 `recovery/production/journal/` 前缀匹配。先在专用 bucket 应用并回读规则，再启用日志；这些 API 会替换整组规则，不能直接覆盖共享 bucket 的既有规则。开发使用不同 scope，不向截图 bucket 应用生产规则。参考 Cloudflare 官方[生命周期 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/methods/update/)与[保留锁 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/update/)。锁不阻止拥有控制面权限的人修改规则，因此控制面权限与应用对象凭据分开保管。

每日备份的正常目标 RPO 为 24 小时；调度延迟或失败会扩大窗口，不作无条件承诺。检查最近一次成功记录，超过 30 小时未成功即按备份故障处理；关注 GitHub Actions 失败通知，查明后手动补一次。RTO 尚未承诺，小数据演练耗时不是生产恢复时限。Neon 原生 PITR 仅作为额外恢复手段：生产套餐的实际窗口尚未核实，本策略不依赖它，不能从免费额度或旧记录推定恢复保证。

备份含邮箱、密码哈希和加密凭据，不作为 CI artifact 上传。临时明文只在权限 0700 的随机目录中出现，档案 0600，成功或失败均清理；连接串不放命令参数或输出。R2 图片、角色、环境变量和密钥不进入数据库档案。应用 `KEY_ENCRYPTION_KEYS` 的所有在用版本及备份密钥分别保管；缺少旧版本密钥时保持隔离。当前备份密钥轮换前保留旧密钥至少到其最后一份档案过期，恢复进程显式选择对应密钥。

## 独立日志的语义与覆盖

`RECOVERY_LOG_ENABLED` 默认关闭；开启后缺少配置或 R2 写入失败时，相关操作返回 `503 RECOVERY_LOG_UNAVAILABLE`，不提交数据库删除。日志每项只含 UUID、时间、epoch、动作和目标 ID；对象另含 object key、字节数和安全删除时间，不记录邮箱、Key、Cookie、密码、图片或正文。同库 `console_audit` 继续记录管理结果，独立日志不替代它。

| 独立动作            | 入口与恢复行为                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `account.delete`    | 自助/后台账号删除共用 `removeAccount`；重放再次移除账号及自有反馈                            |
| `credential.revoke` | 自助/后台 Key 移除、Key 替换、游客保存替换、上游判失效；重放移除该账号恢复出的 Key           |
| `feedback.delete`   | 管理删除、账号级联及到期清理；重放移除反馈与附件关联                                         |
| `object.delete`     | 附件撤销、删除任务入队及实际 R2 删除前；重放只撤销附件元信息、保留反馈文字并合并对象删除任务 |
| `checkpoint`        | 备份前写入；档案绑定该对象和日志 epoch，缺失时拒绝恢复                                       |

记录是**撤销意图**，并非“数据库已成功提交”的证明。日志写入后若事务回滚、进程中断或响应丢失，意图仍保留；恢复时宁可再次撤销，也不复活可能已撤销的数据。重复事件可重放。批量反馈/附件按每对象最多 100 项写入，避免逐行等待外部请求。

恢复读取该 epoch 的全部仍保留日志，不只筛选备份开始之后的时间；这覆盖“日志先写入、数据库事务在备份快照之后才提交”的交错。较早的 Key 撤销意图也可能清除快照中后来重新配置的 Key，用户需要重新连接。日志与备份的 30/7 天差额容纳操作和恢复缓冲；恢复前必须冻结全部写入并等待在途操作结束，禁止一边收新日志一边开放恢复结果。

会话撤销、退出、游客清除、报告停止/删除及密码重置不逐个归档：恢复无条件清空两类会话/验证码、游客、报告及短期回执，并清除所有前台密码哈希和认证 token、后台密码哈希。前台用户通过邮箱重新验证并设置密码，管理员使用显式 reset 命令。这样旧密码和临时身份不会因遗漏某条认证库事件复活。

日志覆盖应用列出的写入入口，不是数据库 CDC。运维不得绕过这些入口直接删改持久账号、凭据和反馈；确需 SQL 操作时先持久记录对应撤销意图。首次启用、日志关闭、存储丢失、绕过记录或回滚到无日志代码后，必须冻结写入并生成新的 `RECOVERY_EPOCH`，废弃旧 epoch 的可开放恢复资格，重新启用日志后建立基线备份。checkpoint 不能证明被人为删除的任意中间日志仍存在；实际保留锁、权限隔离和连续运行证据都是生产启用条件。

## 配置与执行

应用 Functions 只配置 `RECOVERY_LOG_ENABLED=true`、`RECOVERY_R2_ACCOUNT_ID / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET`、`RECOVERY_SCOPE` 与 UUID `RECOVERY_EPOCH`。使用限定专用 bucket 的凭据，不给应用配置备份解密密钥或存储控制面权限。生产 scope 固定为 `production`；命名见[上线计划](plans/release.md#database-recovery)。预览不接入这些配置。

运维进程另外需要 direct `DATABASE_URL`、与 URL 库名完全一致的 `RECOVERY_DATABASE`、32 字节随机密钥的 Base64 `RECOVERY_ENCRYPTION_KEY` 及 `RECOVERY_CODE_REVISION`。`PG_BIN` 可指定官方客户端目录，客户端主版本不得低于源库；拒绝 pooler 与 `search_path` 连接选项，清除继承的 libpq 环境配置。revision 记录备份工具代码版本，不证明生产正在部署同一个版本。

```sh
# 本地命令读取 .env；生产仅在另行授权、配置核实后显式选择受限环境文件。
pnpm db:backup
# 或使用由受限执行器注入环境变量的命令，不在命令行拼接连接串：
pnpm exec tsx scripts/database-recovery.ts backup
```

成功输出 R2 object key、备份开始时间、原始字节数、SHA-256 和工具版本。只有上传成功才返回成功；失败工作流非零退出。GitHub 工作流默认为跳过：仅仓库变量 `RECOVERY_BACKUP_ENABLED=true` 才进入备份作业。启用前建立 `database-backup` Environment，并配置工作流列出的 secrets/vars；不要只在 Environment 内设置作业级启用变量。当前未写入 GitHub secrets/vars，也未打开此开关。

## 空库恢复与撤销重放

1. 冻结来源应用全部写入、备份和清理任务，等待在途请求、上传租约及其安全期结束；仅关闭反馈/管理开关不足以冻结写入。保留原库供核对，恢复目标不得绑定公开应用。
2. 新进程指定目标库 `DATABASE_URL / RECOVERY_DATABASE`，沿用来源 scope、epoch、R2 读取凭据与备份解密密钥；设置 `RECOVERY_LOG_ENABLED=false`、`RECOVERY_WRITES_FROZEN=true`。后者是操作者对真实冻结状态的确认，不会代替平台停写。
3. 执行下面命令。工具先认证解密、核验摘要/年龄/epoch/来源目标不同、分页读取并校验全部日志及 checkpoint，然后确认目标没有业务表/序列/视图。仅删除空 public（不使用 CASCADE），以单事务 pg_restore 恢复。
4. 自动在目标事务重放撤销、失效密码与临时状态、清理已过期反馈；对象任务保留至少两分钟安全期。恢复阶段不直接访问截图 R2。恢复或重放失败都保持隔离，重新使用空库，不能开放部分完成的结果。

```sh
pnpm exec tsx scripts/database-recovery.ts restore '<备份输出的 object key>'
```

成功仍输出 `isolated:true`，不切换应用。用目标专用进程和正确的截图 bucket 运行已有 `drainObjectDeletes`，核对对象、容量及所有任务已处理；独立日志启用时清理也需要日志存储可用。重置管理员密码，通过邮箱重新验证保留账号，核对旧 Cookie/密码被拒绝、已删账号/撤销 Key 不复活。保留的 Key 还需用对应旧密钥验证解密。恢复不会还原已删图片；缺图继续返回 `SCREENSHOT_GONE`。

数据库角色和权限不随 `--no-owner --no-acl` 复制，切换前重建最小权限。生产还需记录最新成功备份年龄、日志连续性、锁/生命周期回读、密钥可用性及有界恢复结果，然后在另行授权后切换。不要在已经缓存 `getDb()` 的进程中修改 DATABASE_URL 切库。

## 应用回滚与收尾

应用回滚保留数据库结构，禁止因为应用异常就恢复旧数据库。原 `0cb7103` 已验证 C2 附件清理与 C3 游客回执兼容，但**不含独立撤销日志**：日志启用后不能沿用该版本维持写入；应选择包含本批日志代码的兼容部署。若必须回滚到更早版本，先冻结持久写入，按新 epoch 重新建立恢复基线。Netlify 平台回滚尚未演练。

演练只用开发分支中新建库、合成账号/图片和随机 scope，开发对象不混入生产前缀。本轮复用已授权开发 R2 的对象权限，未更改共享 bucket 的规则；演练不证明生产 bucket 保留锁或自然到期已运行。结束关闭连接，删除本轮库、确切 scope 下的日志/备份、合成图片与临时档案；不清空共享 bucket。

本批提交和合并消息使用 `[skip netlify]`，遵守“不动生产”；本地必要检查照常执行。该标记由 [Netlify 官方部署规则](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)支持，不替代验收。
