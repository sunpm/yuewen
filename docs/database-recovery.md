# 数据库备份、独立撤销日志与恢复

更新日期：2026-10-23（Asia/Shanghai）

适用于 0000–0005 迁移，包括尚未应用 0004/0005 的升级前备份。实现位于 `server/recovery/`、`scripts/database-recovery.ts` 和 `.github/workflows/database-backup.yml`；生产存储配置、独立日志启用、0003 基线备份与隔离恢复已完成，备份调度仍关闭；本轮生产证据见[启用窗口记录](quality-log.md#recovery-activation-window-2026-10-23)。生产存储证据见[配置记录](quality-log.md#production-recovery-storage-2026-10-22)；状态命令及共用档案校验见[命令记录](quality-log.md#backup-status-2026-10-22)，升级前兼容见[恢复记录](quality-log.md#pre-upgrade-recovery-2026-10-22)，完整独立日志与原生备份演练见[独立日志记录](quality-log.md#recovery-journal-2026-10-13)和[历史演练](quality-log.md#database-recovery-2026-10-13)。恢复不会随启动、构建或部署执行。

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

配置载荷为 [R2 生命周期](../ops/recovery-lifecycle.json) 与 [R2 保留锁](../ops/recovery-locks.json)，按 `recovery/production/backups/` 和 `recovery/production/journal/` 前缀匹配。先在专用 bucket 应用规则，并运行[只读存储核对](#storage-status)，再启用日志；这些 API 会替换整组规则，不能直接覆盖共享 bucket 的既有规则。开发使用不同 scope，不向截图 bucket 应用生产规则。参考 Cloudflare 官方[生命周期 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/methods/update/)与[保留锁 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/update/)。锁不阻止拥有控制面权限的人修改规则，因此控制面权限与应用对象凭据分开保管。

每日备份的正常目标 RPO 为 24 小时；调度延迟或失败会扩大窗口，不作无条件承诺。使用下方只读状态命令核对最近备份，超过 30 小时即按备份故障处理；关注 GitHub Actions 失败通知，查明后手动补一次。RTO 尚未承诺，小数据演练耗时不是生产恢复时限。Neon 原生 PITR 仅作为额外恢复手段：生产套餐的实际窗口尚未核实，本策略不依赖它，不能从免费额度或旧记录推定恢复保证。

备份含邮箱、密码哈希和加密凭据，不作为 CI artifact 上传。临时明文只在权限 0700 的随机目录中出现，档案 0600，正常完成或抛错时自动清理；进程被强制终止后，按本次执行时间和档案摘要确认并清理残留目录。连接串不放命令参数或输出。R2 图片、角色、环境变量和密钥不进入数据库档案。应用 `KEY_ENCRYPTION_KEYS` 的所有在用版本及备份密钥分别保管；缺少旧版本密钥时保持隔离。当前备份密钥轮换前保留旧密钥至少到其最后一份档案过期，恢复进程显式选择对应密钥。

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

2026-10-23 已完成首次启用。本地分层文件仍为 Git 忽略、权限 `0600`；本地日志/维护默认开关保持 false，生产部署中的日志为 true、维护为 false。GitHub 备份环境及调度尚未配置：

| 文件                              | 内容与用途                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.recovery.production`        | 仅限生产恢复 bucket 的 Account 对象凭据、account/bucket/scope、当前已启用的 UUID epoch；本地日志和维护开关均为 false。不含数据库连接、备份密钥或控制面 token。  |
| `.env.recovery.backup.production` | 运维专用 direct `DATABASE_URL`、明确库名、独立随机 32 字节 Base64 备份密钥及 `PG_BIN`；`RECOVERY_WRITES_FROZEN=false`。与上一文件叠加加载，禁止导入应用或预览。 |

生产 `.env.production` 及备份 direct URL 已同步轮换后的数据库密码；旧 direct/pooler 密码已失效。相同 epoch 下首份基线 status=ok，隔离恢复成功且副本已清理。`.env.recovery.window.production.json` 保存不含密钥的完整运维证据；`.env.recovery.key-custody.production` 仅含备份密钥及全部应用 Key 解密版本，用户已确认离机保管可取回，作为保管交付文件保留，不导入应用。

当前 Netlify 套餐不能将新增变量只限 Functions，用户已批准仅 Production 的 Builds/Functions/Runtime 秘密值范围；预览/开发及 Post processing 排除。普通 scope/bucket 被秘密标记后不可撤销，Production 仅以 `SECRETS_SCAN_OMIT_KEYS=RECOVERY_SCOPE,RECOVERY_R2_BUCKET` 排除这两个非敏感值，真实凭据扫描保持开启。不要把此规则扩展到数据库或对象访问密钥。

备份密钥与全部在用应用 Key 解密版本须继续在独立受限位置可取回。现有 epoch 已正式启用，不能重新当作未使用 epoch；只有实际日志中断或未记录写入后，才按新的冻结窗口建立新 epoch 与基线。

运维进程另外需要 direct `DATABASE_URL`、与 URL 解码后库名完全一致的 `RECOVERY_DATABASE`、32 字节随机密钥的 Base64 `RECOVERY_ENCRYPTION_KEY` 及 `RECOVERY_CODE_REVISION`。URL 必须为带显式账号和密码的单主机 `postgres://` 或 `postgresql://` 连接；查询参数仅允许各出现一次的 `sslmode` 和 `channel_binding`，拒绝 `database`、`user`、`options`、`search_path` 等覆盖项、pooler、多主机及可被 libpq 当成连接串的库名。未指定 sslmode 时统一为 require；原生工具同时接收 channel_binding，清除继承的 libpq 环境配置。`PG_BIN` 可指定官方客户端目录，客户端主版本不得低于源库。revision 记录备份工具代码版本，不证明生产正在部署同一个版本。

```sh
# 本地命令读取 .env；生产仅在另行授权、配置核实后显式选择受限环境文件。
pnpm db:backup
# 或使用由受限执行器注入环境变量的命令，不在命令行拼接连接串：
pnpm exec tsx scripts/database-recovery.ts backup
```

成功输出 R2 object key、备份开始时间、原始字节数、SHA-256 和工具版本。备份 CLI 只有上传成功才返回成功；GitHub 工作流随后调用同一 CLI 的 `status`，回读校验当前 scope/epoch 的最新档案，解密、摘要、来源、checkpoint 或时效校验失败均使工作流失败。CLI 不把上传成功当作恢复演练通过。

GitHub 定时备份默认跳过，仅仓库变量 `RECOVERY_BACKUP_ENABLED=true` 时运行；`workflow_dispatch` 手动执行不受此开关限制。先建立 `database-backup` Environment 并配置工作流列出的 secrets/vars，手动备份和状态核对成功后再开启定时开关；不要只在 Environment 内设置作业级启用变量。环境仅允许 main，受控分支验收时临时加入该精确分支，验收后移除。当前未写入 GitHub secrets/vars，也未打开此开关。

<a id="activation-window"></a>

## 首次启用窗口

2026-10-23 首次启用窗口已完成，实际部署、冻结、备份、恢复与解除维护见[质量记录](quality-log.md#recovery-activation-window-2026-10-23)。以下保留操作顺序；后续重新建立基线时重新核对实际状态，不复用旧冻结声明。其他功能及生产 0004/0005 迁移未在本次执行。

`APP_MAINTENANCE_MODE=true` 在应用 API 最前面的 middleware 返回 `503 MAINTENANCE`、`Retry-After: 300` 和 `no-store`，包括认证、读取、写入、health 和 demo；读取可能续期或触发清理，不能只拦 POST。定时 cleanup 在取得数据库连接前返回 204。开关默认 false，不影响静态页面或独立运维 CLI。`RECOVERY_WRITES_FROZEN` 仍只是恢复命令的操作者确认，两者不可互相替代。

Netlify Functions 环境变量变更需要[新部署才生效](https://docs.netlify.com/build/functions/environment-variables/)。首次维护版本不能让已有实例或旧部署立即停写；冻结完成必须有实际平台与数据库证据。

1. 确认备份密钥及全部应用 Key 密钥可取回、生产仍为预期结构。准备独立空库的目标连接，但不绑定应用、不启动清理 CLI。目标必须与来源 identity 不同，且无业务表/序列/视图；不要把 `.env.production` 整体导入目标进程。
2. 在 Production Functions 配置日志变量、选定 epoch、`RECOVERY_LOG_ENABLED=true` 和 `APP_MAINTENANCE_MODE=true`，部署含维护门禁与日志的版本；不提供备份加密密钥或控制面 token。普通预览仍保持隔离，关闭手动/定时备份、清理脚本及其他直连写入者。
3. 确认正式 API 返回 MAINTENANCE、定时 cleanup 不写库，核对旧部署 URL/旧调用与其他数据库客户端不能继续写入；维护变量只约束采用它的部署，无法证明历史部署或直连 SQL 已冻结。如仍存在写入入口，先在平台/数据库侧切断，再继续。等待实际在途调用、数据库事务结束，并超过上传租约 60 秒及额外 60 秒安全期；固定等待不能替代在途核对。记录冻结完成时间、部署 revision 和 epoch。
4. 只在上述条件满足后，在专用备份进程临时启用日志写入并建立 0003 基线。日志配置与运维配置显式叠加，工具 revision 使用经检查的提交；不把本地默认开关改成长期 true：

   ```sh
   RECOVERY_LOG_ENABLED=true RECOVERY_CODE_REVISION="$(git rev-parse HEAD)" \
     node --env-file=.env.recovery.production --env-file=.env.recovery.backup.production \
     --import tsx scripts/database-recovery.ts backup
   node --env-file=.env.recovery.production --env-file=.env.recovery.backup.production \
     --import tsx scripts/database-recovery.ts status
   ```

5. 将返回的 object key、开始时间、摘要及工具 revision 记入受限操作记录。status 必须为 ok；然后按[空库恢复](#空库恢复与撤销重放)执行。目标覆盖文件只放目标 `DATABASE_URL / RECOVERY_DATABASE`，使用 0600 的 `.env.recovery.restore.production`；最后加载以覆盖来源连接，命令行不含连接串：

   ```sh
   RECOVERY_LOG_ENABLED=false RECOVERY_WRITES_FROZEN=true \
     node --env-file=.env.recovery.production --env-file=.env.recovery.backup.production \
     --env-file=.env.recovery.restore.production --import tsx \
     scripts/database-recovery.ts restore '<本轮备份 object key>'
   ```

   Node 中宿主已有环境变量优先于文件；在干净的专用进程执行，避免继承 DATABASE_URL 或其他同名配置。执行前核对实际目标，不能只看文件名。目标覆盖文件只在恢复窗口创建并在副本清理后删除；禁止先设置冻结声明再寻找真实停写证据。

6. 恢复必须返回 `restored:true / isolated:true`；核对 0004/0005 只应用在目标、旧密码/会话/报告失效及撤销事件重放。0003 来源没有反馈表；目标如出现对象任务，先调查来源，不直接以生产图片 bucket 清理来验证隔离副本。合成账号/撤销验证沿用开发演练，不在生产创建或删除用户充当测试。没有真实撤销事件时如实记录，不能声称已验证生产删除样本。
7. 通过后仅将 Production Functions 的维护开关改为 false 并新部署，保持日志及同一 epoch；确认新请求的日志链路与连续性，再解除其他停写措施。配置 GitHub 备份 Environment、手动执行及 status 成功后才开启调度。隔离副本不切换为生产，按受限证据保留要求清理目标库、覆盖文件及临时明文。

任一步失败均保持隔离与停写，记录失败点。若放弃窗口并关闭日志、回到无日志代码或重新允许未记录写入，该 epoch 的备份不再具备开放恢复资格；下次使用新 epoch 重建基线。恢复失败用新的空目标重试，不覆盖部分恢复库。生产源库的 0004/0005 迁移属于后续启用批次，本窗口不顺手执行。

<a id="storage-status"></a>

## 只读存储核对

```sh
pnpm db:recovery:storage:status
# 受限执行器已注入对应环境时：
pnpm exec tsx scripts/recovery-storage-status.ts
```

配置 `RECOVERY_R2_ACCOUNT_ID`、`RECOVERY_R2_BUCKET`、`RECOVERY_SCOPE=production` 及 `RECOVERY_R2_API_TOKEN`。token 只供本命令使用，需要读取 bucket 配置的 Cloudflare 控制面权限，不是 S3 Access Key/Secret；不要提供给应用 Functions 或备份工作流。命令不需要数据库、epoch、备份密钥或日志开关。当前支持既定默认 jurisdiction 的生产专用 bucket，不会将生产规则改写成开发 scope。

命令仅执行四个 GET：读取生命周期、保留锁、r2.dev 开关和所有自定义域开关。规则按 id 排序后与仓库 JSON 完整比较，字段顺序不影响结果；缺失、额外规则、禁用或时长不同均不通过，包括全桶规则。r2.dev 和全部自定义域必须禁用，即使域名尚未激活，也不允许 enabled 为 true。每项请求最多 15 秒，拒绝重定向；不会创建 bucket、修改规则或读取对象内容。

标准输出为 JSON，包含 `healthy`、`status` 及已验证配置中的 account/bucket/scope，四个 `checks` 分别为 `lifecycle`、`locks`、`managedDomain`、`customDomains`；配置不合法时仅列 `invalidConfiguration` 变量名。全部通过返回 `ok`/退出 0，规则或公开访问不符返回 `mismatch`/退出 1，配置、网络、权限或响应解析失败返回 `unavailable`/退出 1；任一读取失败优先汇总为 unavailable，其余检查结果仍保留。HTTP 失败仅带状态码，不输出 token、远端响应正文或异常详情。

核对通过仅说明当时四项配置符合仓库规则，不证明对象凭据权限隔离、日志连续性、自然到期、备份可解密或恢复成功，也不代替 Workers 等其他访问路径的权限核对。2026-10-22 生产回读已四项通过，见[实际结果](quality-log.md#production-recovery-storage-2026-10-22)；继续完成下一节备份状态及隔离恢复。

本次配置使用 Chrome 应用规则。新 bucket 自动带有 `Default Multipart Abort Rule`，已在空桶上移除以与仓库两条生命周期规则一致；不能将此操作照搬到有既有对象或上传任务的共享桶。核对使用独立的 24 小时管理员只读 token，平台该权限也能读取账户内 R2 对象；完成后已撤销，旧 token 回读四项均 HTTP 401，本地临时配置已删除。下次核对重新获取短期控制面读取凭据，限定用途并在结束后清理，不将其加入长期对象配置。

## 只读备份状态

```sh
pnpm db:backup:status
# 受限执行器已注入对应环境时：
pnpm exec tsx scripts/database-recovery.ts status
```

命令只读取当前 scope/epoch 下最新上传的备份和其 checkpoint；核验 AES-GCM、SHA-256、来源数据库及 checkpoint 的 epoch、时间和工具版本。`DATABASE_URL / RECOVERY_DATABASE` 必须指向备份来源；连接串只用于计算来源标识，不连接数据库。需要 R2 读取/列表权限和备份解密密钥，不需要 `pg_dump`、`RECOVERY_CODE_REVISION` 或启用日志。

| status        | 含义                                               | 退出码 |
| ------------- | -------------------------------------------------- | ------ |
| `ok`          | 最新档案校验通过，距快照开始时间不超过 30 小时     | 0      |
| `missing`     | 当前 scope/epoch 下没有备份                        | 1      |
| `stale`       | 最新档案校验通过，但距快照开始时间超过 30 小时     | 1      |
| `unavailable` | 配置、读取、解密、摘要、来源或 checkpoint 校验失败 | 1      |

标准输出始终提供 JSON 状态；`ok` 和 `stale` 另含 object key、开始时间、年龄小时数、原始字节数、摘要和版本。使用档案内的开始时间计算年龄，重新上传旧档案不会刷新恢复点；最新档案损坏时直接报错，不回退旧档案掩盖故障。状态检查不会写入日志、修改数据或恢复数据库，也不证明全量撤销日志连续、存储保留规则有效或恢复成功；完整恢复仍按下一节执行。

## 空库恢复与撤销重放

1. 冻结来源应用全部写入、备份和清理任务，等待在途请求、上传租约及其安全期结束；仅关闭反馈/管理开关不足以冻结写入。保留原库供核对，恢复目标不得绑定公开应用。
2. 新进程指定目标库 `DATABASE_URL / RECOVERY_DATABASE`，沿用来源 scope、epoch、R2 读取凭据与备份解密密钥；设置 `RECOVERY_LOG_ENABLED=false`、`RECOVERY_WRITES_FROZEN=true`。后者是操作者对真实冻结状态的确认，不会代替平台停写。
3. 执行下面命令。工具先认证解密、核验摘要/年龄/epoch/来源目标不同，校验 checkpoint 的动作、epoch、时间和工具版本与档案一致，再分页读取并校验全部日志，然后确认目标没有业务表/序列/视图。仅删除空 public（不使用 CASCADE），以单事务 pg_restore 恢复。
4. 在隔离目标应用当前恢复工具随附的缺失迁移，再重放撤销。迁移目录按工具文件位置解析，不依赖执行目录；升级前档案会补齐反馈表及对象删除队列，已升级档案沿用迁移历史，不重复建表。恢复目标使用当前结构，不再与旧快照逐表完全相同；来源库不执行迁移。
5. 空库检查、迁移与撤销重放共用同一隔离目标连接，显式传入与原生恢复一致的解码库名，不使用应用的 getDb 缓存。自动在目标事务重放撤销、失效密码与临时状态、清理已过期反馈；对象任务保留至少两分钟安全期。恢复阶段不直接访问截图 R2。恢复、迁移或重放任一步失败都保持隔离，重新使用空库，不能开放部分完成的结果；连接释放异常也会执行临时明文清理。

```sh
pnpm exec tsx scripts/database-recovery.ts restore '<备份输出的 object key>'
```

成功仍输出 `isolated:true`，不切换应用。用目标专用进程和正确的截图 bucket 运行已有 `drainObjectDeletes`，核对对象、容量及所有任务已处理；独立日志启用时清理也需要日志存储可用。重置管理员密码，通过邮箱重新验证保留账号，核对旧 Cookie/密码被拒绝、已删账号/撤销 Key 不复活。保留的 Key 还需用对应旧密钥验证解密。恢复不会还原已删图片；缺图继续返回 `SCREENSHOT_GONE`。

数据库角色和权限不随 `--no-owner --no-acl` 复制，切换前重建最小权限。生产还需记录最新成功备份年龄、日志连续性、锁/生命周期回读、密钥可用性及有界恢复结果，然后在另行授权后切换。恢复后的对象清理等应用操作仍使用目标专用的新进程，不能在已经缓存 `getDb()` 的应用进程中修改 DATABASE_URL 切库。

## 应用回滚与收尾

应用回滚保留数据库结构，禁止因为应用异常就恢复旧数据库。原 `0cb7103` 已验证 C2 附件清理与 C3 游客回执兼容，但**不含独立撤销日志**：日志启用后不能沿用该版本维持写入；应选择包含本批日志代码的兼容部署。若必须回滚到更早版本，先冻结持久写入，按新 epoch 重新建立恢复基线。Netlify 平台回滚尚未演练。

演练只用开发分支中新建库、合成账号/图片和随机 scope，开发对象不混入生产前缀。本轮复用已授权开发 R2 的对象权限，未更改共享 bucket 的规则；演练不证明生产 bucket 保留锁或自然到期已运行。结束关闭连接，删除本轮库、确切 scope 下的日志/备份、合成图片与临时档案；不清空共享 bucket。

需要保留生产部署关闭时，合并到生产分支的提交消息使用 `[skip netlify]`。需要 PR 预览 CI 时，PR 标题不带跳过标记，并推送新提交触发检查；标题中的 `[skip netlify]` 会直接跳过预览，不能把无检查结果视为通过。本地必要检查照常执行，预览构建不替代功能验收。规则见 [Netlify 官方部署说明](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)。
