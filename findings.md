# 发现与决策

更新日期：2026-10-23（Asia/Shanghai）

## 需求

- 2026-10-23 用户进一步授权存档功能分支、提交推送、PR 和检查通过后合并，继续 `[skip netlify]`，生产迁移与发布不在本批范围。

- 2026-10-23 用户明确要求直接实现长期报告存档。沿用现有报告渲染、导出、认证、事务锁和恢复日志，不新增依赖或自动化测试；默认数量、容量、正文和重复保存规则见任务阶段 7。存档不与临时报告、会话、Key 建外键，账号删除级联清理。

- 2026-10-23 本轮按用户要求接续一个完整步骤：配置 GitHub 备份 Environment，手动备份/status 验证成功后开启每日调度；创建新分支、提交推送、PR 检查通过后合并。保留上一轮未提交的生产恢复记录，应用发布继续使用 `[skip netlify]`。

- 2026-10-23 本轮用户明确授权生产日志启用、基线备份、隔离恢复及必要生产部署；需要控制台使用已登录 Chrome，其他功能暂不启用。

- 2026-10-23 用户要求继续准备生产日志、基线备份与隔离恢复，先完成无需生产部署的部分；控制台使用已登录 Chrome，授权新分支、提交推送、PR 与检查后合并，继续 `[skip netlify]`。
- 2026-10-22 本轮用户明确授权完成生产恢复存储配置与真实回读，需要控制台时使用已登录 Chrome；创建分支、提交推送、PR 检查通过后合并，继续 `[skip netlify]`。范围包括专用私有 bucket、仓库规则、独立对象凭据与保管；应用发布、冻结写入、日志启用与基线备份留待后续批次。
- 2026-10-22 本轮在 `codex/c5-recovery-preflight` 接续生产存储准备；用户授权分支、提交、推送、PR 和检查通过后合并，继续使用 `[skip netlify]`。本轮补齐只读核对入口，不部署生产、不新增或修改测试。
- 本轮创建 `codex/c5-recovery-integrity`，继续 C5 备份与恢复准备，修复连接目标解析分歧；不新增或修改测试代码。改动只涉及运维脚本，无需浏览器验收。
- C5 开发完成后，用户授权提交、推送、创建 PR 和检查通过后合并；使用 `[skip netlify]` 跳过生产部署，生产资源配置与功能启用仍不在本批范围。
- 上一批 C5 分支通过现有 SSH 凭据推送并合并 [PR #40](https://github.com/sunpm/yuewen/pull/40)；HTTPS OAuth 凭据不具备修改工作流的权限。当前分支不改工作流，可沿用普通 Git 推送。
- 将项目原总计划迁为 planning-with-files 规范；后续本项目文件规划默认使用 `planning-with-files-zh`，无需每次再次指定技能。
- 使用 `task_plan.md` 记录目标、下一步和阶段，`findings.md` 记录需求、发现与决策，`progress.md` 记录会话和验证。
- 文件规划迁移保留原项目阶段、专题、后续范围及未验证项；迁移本身仅改文档。

## 研究发现

- 长期存档已新增独立 `report_archive` 表和 0006 迁移，快照只存 `buildReport` 的报告契约，不保存采集原始回包或凭据；不勾选正文时同时移除笔记、回顾和精选。游客来源采用账号→游客→报告锁顺序，可登录存档而不保存 Key。新增 `archive.delete` 日志，恢复保留未删除存档并重放删除意图。
- PC 复用原报告内容和下载，增加 `/archives` 与 `/archives/:id`；历史查看不调用采集、续期或上游书籍详情。类型/lint、已有基础测试 24/24、后台隔离集成 10/10、PC 构建通过。
- Chrome 合成账号保存含正文报告；清除临时来源与 Key、退出并重新登录后，存档深链接和笔记仍可读，JSON 下载含 1 条合成笔记。本人删除 API 返回 204，随后读取 404。未扩大跨账号、配额并发或 R2 恢复日志动态专项。

- 手动备份运行 39922887328 成功（51 秒）；16:11:59 开始的 36,764 字节档案与 status 回读摘要/revision 一致，healthy=true/status=ok。随后开启仓库调度变量，移除临时开发分支策略，回读为仅 main、工作流 active；首次定时触发仍未发生。详细证据见[自动备份记录](docs/quality-log.md#scheduled-backup-2026-10-23)。

- 专用环境五个 secrets、四个 vars 已完成键名回读；仓库调度开关仍不存在。手动运行 [39922887328](https://github.com/sunpm/yuewen/actions/runs/39922887328) 已启动，head 为 `ac40e28`；PR #45 同一 head 的 Netlify 预览、Header、Redirect 均通过，Pages changed 为中性。

- 用户已明确批准五项备份凭据传输到 `database-backup` Environment；后续获准执行成功。只放行 main 与本次精确分支，敏感值由 gh 在本地加密后写入，未输出或新增明文文件。

- 本地两份生产恢复配置均为 0600 且 Git 忽略。向 GitHub 专用环境传输五项凭据的命令被自动审批拒绝，尚未执行分支规则或凭据写入；已请求用户明确授权具体秘密项与目的地。环境本身创建成功，不等于已配置或备份成功。
- 本机未安装 actionlint；本轮只改工作流调用顺序，先使用已有 Prettier 和 diff 检查，实际 GitHub 手动执行作为运行验收，不为此新增检查脚本。

- 授权联网后 gh/API 正常，仓库有管理权限，main 与 origin/main 一致；已创建 `codex/c5-scheduled-backup`。GitHub 原先没有 Environment 或仓库变量，最近 3 次 schedule 均为 skipped；现已创建 `database-backup` 并开启精确分支策略，尚未写入凭据。
- 工作流已有 PostgreSQL 18 容器、Node 22、只读 contents 权限与串行并发，但上传后没有调用现有 status；本轮直接在同一步增加 status，复用原有环境和失败退出机制，不新增脚本或测试。
- 按 [GitHub Environment API](https://docs.github.com/en/rest/deployments/environments) 与[分支策略 API](https://docs.github.com/en/rest/deployments/branch-policies)核对，专用环境可限定允许分支；本轮手动验收临时允许精确开发分支，收尾只保留 main。使用 [gh secret set](https://cli.github.com/manual/gh_secret_set) 的标准输入传入秘密值，不将值放进命令参数或输出。

- 本轮恢复使用根目录三文件，PLAN_ID/PWF_PLAN_ROOT 均为空；初始 main 有 8 份上一轮生产恢复文档改动，无应用代码改动。下一项以 release.md 的接续顺序为准，先完成自动备份，再处理生产迁移与功能启用。
- 首次沙箱内 gh auth status 报 token invalid，须通过获准联网核对，不能直接认定凭据失效；规划读取输出过长，后续按短段独立读取。

- 2026-10-23 生产日志、基线备份和隔离恢复已完成，最终生产部署 `6adb0f0177813577800bc7f1`、代码 `959e21a`；健康 HTTP 200、Chrome 管理员登录成功且已退出。完整证据见[恢复窗口记录](docs/quality-log.md#recovery-activation-window-2026-10-23)。
- 真实冻结由维护门禁、生产原角色密码轮换、旧 direct/pooler 的 28P01 拒绝和连接排空共同完成；安全期 195 秒后客户端及 prepared transactions 均为 0。原部署无法再用旧密码写入，最终仅更新 Production 连接。
- 生产基线开始于上海时间 15:30:44，原始档案 36,616 字节，status=ok；恢复返回 restored/isolated=true、events=1。源库仍为 4 条迁移（0003），目标补为 6 条迁移（0005），后台密码从源库 1 条在目标失效为 0，临时状态和对象任务均空。
- 生产当时无前台账号、Key 或报告，实际日志只有 checkpoint；没有新增/删除生产用户充当样本。真实撤销与 Key 解密样本沿用开发证据，不把本轮空数据或 checkpoint 重放说成真实样本通过。
- 最终同一 epoch 保留 1 个加密档案和 1 个 checkpoint；日志保持开启。备份调度仍关闭，本次没有迁移生产 0004/0005 或启用反馈、数据管理、统计。
- 用户确认密钥保管包已离机保管可取回；本地保管交付文件和完整运维记录为 0600/Git 忽略，备份解密密钥不进入 Netlify。生产与备份本地连接已同步轮换值。
- 用户明确允许 Netlify 当前套餐的 Production Builds/Functions/Runtime 秘密值范围；新增八项日志/维护变量均只供 Production，排除预览和开发，Post processing 排除。普通 scope/bucket 的秘密标记不可撤销，首次扫描仅命中这两项；仅配置 `SECRETS_SCAN_OMIT_KEYS=RECOVERY_SCOPE,RECOVERY_R2_BUCKET`，真实凭据扫描保持开启。[Netlify 官方说明](https://docs.netlify.com/build/environment-variables/secrets-controller/)。
- 原生产角色轮换采用 Neon 官方支持的 SQL，权限未扩大，平台角色未修改；后续连接拒绝旧密码由实际 direct/pooler 调用确认。[Neon 角色说明](https://neon.com/docs/manage/roles)。
- 本次恢复数据库、目标覆盖/新旧轮换连接及重复输出文件已清理，临时档案目录为 0；密钥保管交付文件和受限运维记录保留。没有应用/测试代码改动、Git 提交或推送。

- 本轮最终 diff 仅 5 行应用/清理门禁逻辑、环境样例及相关文档；无测试改动、未跟踪受限配置。受影响代码/Markdown Prettier 与 git diff --check 通过，远端允许 squash 合并；继续按最终 PR head 检查后交付。
- 本轮最小检查已通过：vue-tsc、受影响 ESLint、既有 security/input 共 14/14；本机 HTTP 认证读取返回 503 MAINTENANCE/no-store/Retry-After 300，cleanup 生产上下文返回 204，使用不可连接的占位数据库配置且未访问生产。
- 既有 status CLI 在生产预备 epoch 返回 missing/退出 1，符合尚未建立备份的实际状态；配置核对确认 keyBytes=32、两文件 0600，应用配置不含数据库或备份密钥，日志/维护/冻结声明均为 false。未写 R2、未创建隔离库；不用这些结果替代正式基线或生产撤销重放证据。
- 2026-10-23 生产 direct 连接只读事务核对：PostgreSQL 18.6，数据库约 10.25 MB，4 条迁移 hash/时间与仓库 0000–0003 完全一致，feedback/console_audit 表不存在；没有读取业务内容或执行迁移。本机 pg_dump/pg_restore 均 18.6。
- 已在 .env.recovery.production 预留新 UUID epoch，日志与维护保持 false；独立 32 字节备份密钥、direct URL/库名及客户端目录写入新建的 .env.recovery.backup.production。两个文件 0600/Git 忽略，不写入 Netlify/GitHub；未创建档案、checkpoint 或目标库。
- Neon 官方[连接说明](https://neon.com/blog/postgres-support-case-recap)确认 pooler 后缀区分池化和 direct endpoint。本轮仅在运维配置移除对应后缀，应用原配置保持原样；真实 direct 查询成功。
- 本地生产应用 DATABASE_URL 为 pooler，不能直接用于 pg_dump；运维配置必须采用同一 Neon endpoint 的 direct 连接并验证来源。应用日志配置不含备份密钥；本轮保留预备开关关闭，不提前写入 Netlify/GitHub，避免任意后续部署意外启用日志或维护。
- 当前 Netlify API 与每 15 分钟清理入口没有维护开关；仅关闭反馈/管理功能不能拦截其他写入。本轮补默认关闭的 APP_MAINTENANCE_MODE，统一在 API 路由之前阻断请求并跳过定时清理；真实冻结仍需部署生效及排空在途操作，运维脚本仍须单独停止。
- Netlify 官方[环境变量说明](https://docs.netlify.com/build/functions/environment-variables/)确认 Functions 环境变量变更须新部署生效，不能只在控制台保存后声明停写。发布阶段需先使维护版本生效、排空旧调用，再建立日志 epoch 基线；本轮不执行这一步。
- 2026-10-23 根目录计划解析为空选择器，沿用三文件；初始 main 干净，PR #43 的生产存储配置已在本地 main。正式基线依赖真实冻结与日志代码上线，不能把离线准备或冻结声明当作启用完成。
- 现有手册只描述平台停写，`RECOVERY_WRITES_FROZEN=true` 仅为恢复操作者声明，尚需核对可实际执行的冻结机制；生产受限文件当前仅为对象存储准备配置。
- 本轮配置及文档提交 `1cf899b` 已推送并创建 [PR #43](https://github.com/sunpm/yuewen/pull/43)，已附加到当前任务；预览和规则检查已启动。最终文档补记后按最终 head 检查通过再合并，保留 `[skip netlify]`。

- 本轮已在独立生产恢复 bucket 应用仓库两条生命周期及两条保留锁，备份 7 天、日志 30 天，公开访问关闭；真实 CLI 四项全部 ok/退出 0。详细配置与证据见[质量记录](docs/quality-log.md#production-recovery-storage-2026-10-22)。
- 新空桶默认带有 `Default Multipart Abort Rule`，最初回读仅生命周期 mismatch/退出 1；经用户明确批准移除后与仓库完全一致，无需修改脚本或规则 JSON。
- 长期 Account 对象凭据仅限恢复 bucket，受限保存在 Git 忽略的 `.env.recovery.production`（0600），与开发凭据不同。一次实际 ListObjectsV2 返回 HTTP 200/空桶；未写入对象或访问其他 bucket。
- 控制面回读需与对象权限分离；官方 [R2 认证说明](https://developers.cloudflare.com/r2/api/tokens/)及创建界面均说明管理员只读同时包含账户内对象读取。用户明确批准创建 24 小时只读 token，仅用于四项配置 GET，完成后撤销；旧 token 四项 HTTP 401/退出 1，本地临时文件已删除。
- 长期配置保持日志关闭，不含控制面 token、数据库连接、epoch 或备份加密密钥，未写入 Netlify/GitHub 环境。下一批在获准发布后安排冻结、新 epoch/独立加密密钥、日志及 0003 基线备份与隔离恢复；本次配置回读不证明这些环节已启用。
- 根目录计划解析无命名选择器或歧义；从干净 main 同步并建立本轮分支，PR #42 已合并。只读配置键检查确认原先仅有开发 R2 凭据，控制台账户与开发 account 标识匹配。
- Chrome 会话过期后正常登录；跳过双重验证引导两次被自动审批拒绝，用户随后明确允许“暂不设置”，页面已进入账户主页。新权限、凭据本地保管及默认规则移除另经一次明确确认。其他 UI 输入错误与处理留在[会话日志](progress.md)及质量记录，未造成错误配置落地。

- PR #42 在补记提交 `492adf7` 上已取得预览、Header 与 Redirect 成功，Pages changed 为中性；最初短暂无检查是状态回传延迟，没有重新触发部署。Chrome 原生窗口只读查看首次预览成功日志，未操作发布或重跑，临时标签页已关闭。最终文档补记后按同样方式核对 head，再合并。
- Netlify 官方说明仍区分 PR 标题与分支提交中的跳过标记，PR 标题未带标记；生产 squash 消息继续保留标记。来源：[部署跳过规则](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy)。
- 本批实现已提交为 `c00c62b` 并推送，创建并附加 [PR #42](https://github.com/sunpm/yuewen/pull/42)。预览与规则检查已启动；交付补记只改规划文件，沿用已通过的本地代码验收，最终按远端 head 检查通过后合并。
- 本批代码及本地验收完成：服务端/脚本类型、受影响 ESLint/Prettier、现有安全测试 13/13 通过；真实 CLI 在缺配置时输出 unavailable 和四个变量名并退出 1。尚无远端成功/不符/权限/超时实测，证据边界见[质量记录](docs/quality-log.md#recovery-storage-2026-10-22)。
- 本轮工程检查的 pnpm 启动器尚未进入检查就因版本解析请求遭 DNS 限制；改用 node_modules 中已安装的 Prettier、ESLint、vue-tsc、Vitest 与 Node 的 tsx loader，避免下载或改依赖。
- 已按 Cloudflare 官方 API 核对四个 GET：生命周期 `lifecycle`、保留锁 `lock`（单数）、托管域 `domains/managed`、自定义域 `domains/custom`。规则数组可省略，代表没有规则，必须判为不符；公开访问依据 enabled，不能把域名存在或 SSL 状态当作开放判据。来源：[生命周期](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/methods/get/)、[保留锁](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/get/)、[托管域](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/)、[自定义域](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/custom/methods/list/)。
- 本地 .env 与进程中均未配置恢复 bucket/account 或控制面 API token（仅核对存在性，未输出凭据）。因此本批能完成代码、已有工程检查与缺配置命令核验，实际 Cloudflare 配置回读仍留待生产准备；不临时创建权限或把未检查的远端状态写成通过。
- 实现选择直接导入仓库两份规则，按 id 排序后完整比较；新增/缺失/禁用/缩短/延长规则都报告 mismatch，避免漏掉全桶规则或延长保留造成的偏离。固定 production scope，控制面 token 只供运维进程，四项 GET 各 15 秒超时、不跟随重定向、不输出远端错误正文。
- 本轮已确认 PR #41 合并到 main，远端同步后创建新分支。根目录计划是当前唯一选定计划，初始工作区干净。
- 下一项生产准备要求应用并回读生命周期/保留锁、确认私有 bucket。现有仓库只有两份规则 JSON 和人工手册，备份 status 只检查档案与 checkpoint，不能说明存储保留及公开访问配置是否符合上线条件。本轮增加独立只读 CLI，直接以仓库规则为判据，不触发规则写入、数据库访问或生产部署。
- 首次 git fetch 被沙箱拒绝写入 FETCH_HEAD，授权后成功；批量读取三文件出现截断，已分文件补读。环境选择器未设置，解析器空结果为正常根目录回退。
- 本轮实现已提交推送，并创建 [PR #41](https://github.com/sunpm/yuewen/pull/41)。PR 标题保留预览检查，提交与最终合并消息保留 `[skip netlify]`；代码未修改生产功能开关，检查与合并结果由 PR 留存。
- 本轮开发验收完成：编码库名的正常恢复成功（2 条事件），目标保留账号 1、撤销账号 0、非空密码 0、迁移 6 条；来源仍为 2 个账号及 1 条合成密码。两个临时库及三个随机 scope 对象已删除，回查为 0。完整结果见[目标一致性记录](docs/quality-log.md#recovery-target-2026-10-22)。
- 开发原生备份成功（52,921 字节），状态 CLI 返回 ok；带 database 覆盖参数的恢复命令退出 1。目标库使用含空格的编码库名，恢复前仍无业务表；接下来在继承 PGPORT=1 的进程执行正常恢复，验证显式默认端口不会被环境覆盖。
- 实现已限定 URL 为显式凭据的单主机 PostgreSQL direct 连接，仅接受无重复且值合法的 TLS 参数；保留当前开发/生产 URL 使用的 sslmode 与 channel_binding。原生工具接收 channel_binding，未给 URL 增添原本没有的该参数，避免引入额外数据库启动参数。
- 恢复现在把解码库名显式传给 postgres-js，空库检查、迁移及重放使用同一局部 Drizzle 连接；不再调用应用 getDb。连接关闭有 5 秒上限，关闭失败仍执行明文目录清理。已有类型/lint 与安全测试通过，针对性开发恢复尚在进行。
- 已定位连接目标分歧：databaseConfig 仅拒绝 options，但 postgres-js 把其余 DATABASE_URL 查询参数传入启动消息，database/user 可覆盖 URL 主体；原生 pg_dump/pg_restore 只取主体。postgres-js 还保留百分号编码的库名，而原生工具使用解码后的名称。恢复的空库检查、迁移和重放因此可能与原生恢复目标不同；修复应从统一解析和连接构造入手。
- 原生恢复完成后，迁移使用局部连接而重放使用应用 getDb 单例；本轮将重放接入同一隔离连接，消除额外的 URL 解析与缓存目标。上一批 PR #40 已核实合并，预览及规则检查通过。
- 日志写入覆盖账号删除、Key 撤销/替换/失效及反馈/附件撤销；恢复按既有约定保守重放整个 epoch。另发现原生 libpq 工具和 postgres-js 分别解析同一个 DATABASE_URL，正在核对查询参数与继承环境变量是否会造成目标分歧。
- 本轮已同步远端并创建 `codex/c5-recovery-integrity`。恢复工具现有链路为认证解密及 checkpoint 校验、全 epoch 日志读取、空库原生恢复、补迁移、事务重放与临时状态失效；当前继续核对日志记录与读取是否保持同一完整性约束。
- 2026-10-22 本轮接续：宿主 PLAN_ID/PWF_PLAN_ROOT 为空，解析器及歧义检查均未选择命名计划，使用根目录三文件；初始 main 干净，上一批手动备份与状态命令已进入本地 main。当前剩余事项主要为生产启用，先沿 C5 恢复链路核对真实代码缺口，保持跳过部署。
- 首次同步远端被沙箱拒绝写入 FETCH_HEAD；将通过已授权的 Git 升权操作同步并创建分支，不更改仓库权限。
- 2026-10-22 本轮恢复：解析器没有选择命名计划，宿主未设置计划选择器，沿用根目录三文件；初始 `main` 工作区干净，已创建 `codex/c5-recovery-readiness`。本轮用户要求继续无需浏览器验收的开发，接续阶段 6 的备份与恢复准备。
- 现有待办以生产配置、启用与运行证据为主；先追踪备份、日志和恢复脚本的真实链路，选择实际缺口实施，不扩展 UI 或后续产品能力。
- 已确认两个 C5 运维缺口：工作流的作业级开关同时拦截手动与定时执行，无法按计划先手动备份、再开启调度；恢复手册要求核对最近成功备份并在超过 30 小时时报故障，当前 CLI 只有 backup/restore，没有只读检查入口。
- 现有备份上传发生在 pg_dump 与加密完成后，R2 列表按 scope/epoch 隔离；可复用现有读取、解密和摘要校验实现只读状态检查，不引入存储或依赖。生产存储规则仍未接入，本轮不以本地检查代替真实运行证据。
- 状态检查将校验最新上传档案的来源标识、加密内容、摘要和绑定 checkpoint，并以档案开始时间判断 30 小时窗口；列表时间只用于选择档案，不能用重新上传时间掩盖旧快照。此检查不替代全量撤销重放与隔离恢复。
- 当前已有测试没有覆盖恢复 CLI；本轮遵守不新增测试的要求，使用现有类型/lint 和实际命令检查。默认 PATH 没有 pg_dump，若需运行备份须使用已安装客户端的显式目录。
- 已实现手动执行独立于调度开关、只读 status 以及备份/恢复共用的解密与 checkpoint 内容校验。服务端/脚本类型检查、脚本 ESLint、已有安全测试 13/13 通过；无配置 status 返回 `unavailable` 且退出 1。本机 libpq 18.6 已找到，开发与生产数据库 endpoint 不同、开发 R2 凭据齐备；只在临时开发库和随机存储 scope 进行实际命令核对。
- 沙箱内开发数据库 DNS 失败后，通过工具联网审批连接成功；已建立两个临时开发空库。随机 scope 尚无备份时，实际 status 返回 `missing` 并退出 1，未访问生产数据库或写入环境文件。
- 临时来源库应用现有迁移后，以现有 CLI 成功生成 52,755 字节原生加密备份；新 status 返回 `ok`、退出 0，时间、字节数、摘要和工具版本与备份输出一致。首次恢复被外层 60 秒时限中断；换新空库并延长执行时限后返回 `restored:true / isolated:true`。3 个临时库和 2 个 R2 对象均已清理，强制中断留下的明文目录按档案摘要确认后移除；详见[本轮质量记录](docs/quality-log.md#backup-status-2026-10-22)。
- 迁移前总入口为 PLAN.md，混合了路线图、执行历史和专题索引。详细方案已在 `docs/plans/`，质量记录有大量被其他文档引用的稳定证据锚点。
- 技能目录解析器未选出命名计划，项目初始没有三文件，`git status --short` 和 `git diff --stat` 均无改动。根目录三文件是技能支持的回退模式，本项目继续使用这一单计划入口。
- 原计划与质量记录表明 PC0–PC4 已完成本批交付，后台 C0–C1 生产登录已启用，C5 正在准备；C2/C3/C4 的生产启用和剩余验收仍未完成。本次仅迁移已有记录，没有重新核验生产。
- README 的 C0–C1 状态落后于 2026-10-13 的发布记录，本次同步为已启用管理登录，保留后续功能的生产验收边界。
- 文件规范不等于宿主钩子已经启用。本次不改全局技能或宿主配置；会话依靠项目协作入口读取和更新三文件。
- 技能的完成检查已识别六个项目阶段：3 个 complete、1 个 in_progress、2 个 pending；迁移完成后仍保留项目真实未完成状态。旧入口引用已更新，PLAN.md 字样仅保留在迁移说明和历史命令中。
- 后续交付授权已包含建分支、提交、推送、PR 和合并；同步后本地与远端 main 一致，仓库允许 squash 合并。纯文档交付沿用 `[skip netlify]`，产品接续点仍为 C5。

## 项目约束与已确认决策

| 决策                                                    | 理由与详细入口                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 前端后续默认面向 PC，H5 冻结并保留入口                  | 设备自动分流、手动覆盖及新增映射随 H5 重构恢复，见[冻结规则](docs/plans/pc-refresh.md#h5-freeze)。                             |
| PC 与 console 共用 React/Vite/TypeScript 及约定的数据流 | UI 分别使用 shadcn/ui/Radix 与 antd/ProComponents，唯一详细入口为[共用技术栈](docs/plans/pc-refresh.md#stack)。                |
| PC 采用已确认的 AIHOT 布局和信息精简规则                | 保留必要表单标签和控件名称，见[布局规则](docs/plans/design.md#pc-layout)。                                                     |
| 验收按改动风险执行最小必要检查                          | 需要浏览器时只用 Chrome 检查关键流程；不默认扩展完整矩阵，不把未检查写为通过，见[验收规则](AGENTS.md#验收范围与效率)。         |
| 第二个真实 Key 和邮箱实测已取消                         | 2026-10-08 已确认按代码逻辑核对，不再索要配置或作为推进前置；历史 503 根因仍无证据。                                           |
| 验证码发信邮箱已在环境变量配置，区别于反馈邮箱          | 不重复要求提供；已有配置不代表生产完整流程已验收。                                                                             |
| 后台按 C0–C5 分批启用                                   | 生产迁移、存储及功能开关仍按[上线计划](docs/plans/release.md#batch-release)推进，PC4 不等待未启用功能，原 P4/P5 缺项继续保留。 |
| 长期存档、跨设备恢复及超预算续采属于后续                | 不因后台工作扩入首期；设备切换恢复时只恢复仍有效的临时报告，见[交付边界](docs/plans/guest-access.md#delivery)。                |

## 文件规划决策

| 决策                                                     | 理由                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| 根目录 task_plan.md 为唯一项目路线图，移除旧 PLAN.md     | 沿用技能支持的三文件结构，避免两个总入口漂移。                     |
| 专题详情留在 docs/plans/，由资源索引连接                 | 保留目标、代码落点、步骤、验收与依赖，无需将所有详情塞入三文件。   |
| progress.md 保存会话摘要和验证索引，质量记录保留详细证据 | 维持已有锚点和历史结果，新会话可直接定位证据，不复制完整测试日志。 |
| 规划文件与 AGENTS.md 纳入版本管理和格式检查              | 后续会话从仓库恢复，不依赖聊天记忆或本机会话重放。                 |

## 遇到的问题

| 问题                              | 处理                                                     |
| --------------------------------- | -------------------------------------------------------- |
| 批量文档输出过长而截断            | 按章节限制输出，迁移时直接读取源文件保留完整内容。       |
| rg 直接查询不存在的可选目录返回 2 | 使用解析器确认的根目录，无需创建命名计划或搜索缺失目录。 |

<a id="resources"></a>

## 资源与专题索引

- [任务计划与下一步](task_plan.md)
- [会话与验证索引](progress.md)
- [协作及维护规则](AGENTS.md)

| 要回答或执行的事                                     | 读取位置                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 产品是什么、首版做哪些功能、27 模块与统计口径        | [产品目标与范围](docs/plans/product.md)                                                   |
| PC 页面精简、AIHOT layout、主题、字体与组件          | [设计目标](docs/plans/design.md)；实际样式与组件基线见[设计规范](docs/design-system.md)   |
| 后台、超管、截图反馈、用户与表管理、统计             | [后台管理专题](docs/plans/console.md)                                                     |
| React 迁移、指定技术栈、H5 冻结与后续重构            | [PC 专题](docs/plans/pc-refresh.md)                                                       |
| 后续设备分流、手动选择、深链接（已推迟）             | [设备入口](docs/plans/design.md#device-entry)                                             |
| 自动主题、意见反馈入口、接收方式与验收               | [自动主题与反馈入口](docs/plans/design.md#theme-and-feedback)                             |
| API、账号和 Key 生命周期、采集预算、临时报告、导出   | [架构方案](docs/plans/architecture.md)；实际字段和接口见[数据契约](docs/data-contract.md) |
| 图表、词云、作者偏好、范围参数、书架分类、笔记与回顶 | [报告体验计划](docs/plans/report-experience.md)                                           |
| 游客是否登录、如何保存连接、冲突与重试、后续长期存档 | [游客接入计划](docs/plans/guest-access.md)                                                |
| 部署到哪里、资源怎么命名、需要哪些品质验收           | [上线验收计划](docs/plans/release.md)；当前命令与配置见[开发说明](docs/development.md)    |
| 哪些检查实际通过、失败或尚未验证                     | [质量记录](docs/quality-log.md)                                                           |
| 过去十项修复和字体接入为何这样做                     | [历史记录](docs/plans/archive/2026-10-04-fixes.md)，仅在追溯时阅读                        |

## 原章节迁移索引

用于定位旧对话引用；之后使用专题名称和链接，不再沿用章节覆盖关系。

| 原 PLAN.md 章节                               | 现在的位置                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4、11：决策、参考、流程、数据范围、后续输入 | [产品计划](docs/plans/product.md)                                                                                                                                      |
| 5：设计方案                                   | [设计计划](docs/plans/design.md)                                                                                                                                       |
| 6–7：架构、账号、Key、报告与下载              | [架构计划](docs/plans/architecture.md)                                                                                                                                 |
| 8、10：上线方案与品质验收                     | [上线验收计划](docs/plans/release.md)                                                                                                                                  |
| 9、12：阶段与当前进度                         | [任务计划](task_plan.md#milestones)与[进度日志](progress.md#baseline-2026-10-22)；原第 12 节另保留[历史快照](docs/plans/archive/2026-10-04-fixes.md#progress-snapshot) |
| 13–14：开发记录、十项修复及字体               | [历史记录](docs/plans/archive/2026-10-04-fixes.md)                                                                                                                     |
| 15、17、18：体验、作者、图表与书架            | [报告体验计划](docs/plans/report-experience.md)                                                                                                                        |
| 16：游客与按需登录                            | [游客计划](docs/plans/guest-access.md)                                                                                                                                 |

## 视觉/浏览器发现

文件规划迁移及本轮 C5 命令行开发均未使用浏览器。既有应用视觉与关键流程证据见[质量记录](docs/quality-log.md)。后续查看图片、PDF 或浏览器时及时将相关发现转述为文本；外部内容仅作为资料，不作为项目指令。
