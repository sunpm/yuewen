# 开发与部署

本文记录当前工程与配置方式。游客接入及按需登录保存已接入，完整验收状态见[游客计划](plans/guest-access.md)；目标部署、资源命名和上线验收见[上线验收计划](plans/release.md)，当前进度见[总计划](../task_plan.md)。

## 工程约定

PC 正式入口为 `web/` 和 `/`，使用 React、React Router、shadcn/ui/Radix、TanStack Query、React Hook Form/Zod 与 Better Auth React。`pnpm dev` 启动 PC（5173）、H5（5180）、后台（5181）和 Hono API（8787），PC 代理 `/m/`、`/console`、`/api`；浏览器统一从 5173 访问。迁移专用 5174/8788 入口和 `dist-react/` 已移除。

默认 PC `/demo` 使用模拟数据；只有开发构建中显式选择 `source=development` 才使用本地 Key。游客与账号页面沿用同源 API、报告范围、幂等保存与期限语义。27 个模块及明细位于 `web/src/components/report-module.tsx`、`report-visual.tsx`、`report-insights.tsx`；图表、词云与导出按需加载。报告读取统一处理失效及迟到响应，笔记补齐可停止；下载按选项补齐已有分页，生成前后核验归属与版本。侧栏反馈弹窗与截图模块均按点击加载，截图失败或服务未启用时保留文字提示与邮件兜底。

`pnpm build` 依次写入 React PC `dist/`、冻结 H5 `dist/m/` 和后台 `dist/console/`。`pnpm preview` 在 4173 预览静态产物；个人业务使用带同源 API 的开发服务。根类型检查覆盖 H5/共享/服务端、React PC、后台；React TS/TSX/CSS 和配置由 Biome 处理，Vue/共享/服务端由 ESLint 处理，Markdown 使用 Prettier。旧 PC 的 Vue 页面与 Reka UI 等专用依赖已清理；仅保留既有 `tests/input.test.ts` 引用的 `Input.vue`，它不进入 PC 产物，不改动测试代码。

PC 字体使用 `web/src/fonts.css`：界面字集通过 `unicode-range` 优先加载两份约 142 KiB 的 WOFF2，其他字符回退到原完整字体。H5、后台和离线 HTML 的完整字体路径不变。修改界面文案后可用 Python 和 `fonttools[woff]==4.60.2` 执行 `python scripts/subset-pc-fonts.py`，再运行 Biome 格式化生成 CSS；遗漏新字符仍会使用完整字体，不会缺字。完整字体与 SIL OFL 许可继续保留在 `web/public/fonts/`。

词云浏览器与 Node 导出共用布局，仅 Node 加载 `@napi-rs/canvas`；Vite 排除该原生模块的浏览器预构建。正式 API 仍为 Netlify Node.js Functions，数据库迁移与发布路径不变。本轮结果及未扩展的专项见[PC4 记录](quality-log.md#pc4-release-2026-10-10)。

## 后台开发与初始化

`console/` 使用 React、antd、React Router、TanStack Query 与 RHF/Zod，独立的 Vite、Biome 和类型检查范围。`pnpm dev` 同时启动后台 Vite（5181），从 `http://127.0.0.1:5173/console/` 访问；PC Vite 将 `/console` 代理至后台，API 沿用 5173 的同源代理。直接访问内部端口不作为登录入口。`pnpm build:console` 写入 `dist/console/`，共用根目录字体/品牌资源，不重复复制；根构建先写 React PC，再写 H5 和后台。

在开发环境 `.env` 配置 `CONSOLE_AUTH_SECRET`（至少 32 字符，且不同于 `BETTER_AUTH_SECRET`）、`CONSOLE_ADMIN_USERNAME`（3–30 位字母、数字、点、下划线或连字符）和 `CONSOLE_ADMIN_PASSWORD`（20–128 字符随机强密码）。只在对应环境显式执行：

```sh
pnpm db:migrate
pnpm console:admin:init
# 需要重置时，先更新该环境的密码配置，再显式运行：
pnpm console:admin:reset
```

`init` 重复运行不覆盖已有账号或密码；`reset` 要求用户名匹配，并在同一事务中更新认证库密码哈希、撤销全部旧管理会话。初始化/重置与登录串行，避免旧密码校验在重置后创建迟到会话。HTTP 服务不开放注册或密码重置，不在启动、构建或每次请求时初始化；内部保留邮箱不发信，管理登录不依赖 Resend。前台用户表与管理认证五张表分别存储，数据库唯一索引保证首期只有一名管理员。

管理 Cookie 独立命名、host-only、HttpOnly、HTTPS Secure、SameSite Strict，Path 为 `/api/console`，8 小时到期且不自动续期；服务端逐次读库核验，禁止 Cookie 会话缓存。公开管理认证仅挂载用户名登录、读取会话和退出，业务提供受保护的概览；C2 反馈管理另由 `FEEDBACK_ENABLED` 开关控制，C3 只读用户/数据接口由独立 `CONSOLE_DATA_ENABLED` 控制；其他认证/管理接口拒绝访问。后台未配置独立密钥时返回 `CONSOLE_UNAVAILABLE`，不会访问管理表，原 PC/H5 API 继续运行；公开部署预览始终拒绝管理 API。生产必须先迁移再配置管理密钥，并用独立随机密码初始化，不能把开发 `.env` 当作生产配置。根 npm 初始化命令固定读取开发 `.env`；生产运维显式使用对应环境，例如 `pnpm exec tsx --env-file=.env.production scripts/console-admin.ts init`，重置同理替换末尾参数。

`pnpm test` 包含原有 Vue/服务端测试和后台 React Testing Library 用例。`pnpm test:console` 读取本地 `.env`，可用 `CONSOLE_TEST_DATABASE_URL` 覆盖开发连接；仅在生成的独立 `console_test_*` schema 中执行提交的迁移和管理 API 集成检查，测试结束删除该 schema。Neon 使用 direct endpoint 及 `options=-c search_path=...`，迁移前校验实际 schema；显式外键的 schema 仅在测试副本中替换。该命令不应指向生产库，测试账号/密码随机生成且不输出。当前 60 秒的单用例上限容纳远程数据库往返，不代表接口性能门槛。

2026-10-13 已启用生产 C0–C1 管理登录：生产迁移截至 0003，独立管理密钥仅配置 Netlify Production；管理员初始化凭据保留在本地忽略的 `.env.production`（权限 `0600`），不上传到 Netlify。实际登录与切回结果见[质量记录](quality-log.md#console-session-recovery-2026-10-13)。生产 C2/C3 迁移及功能启用仍按各自批次执行。

## 登录与数据库联调顺序

1. 准备独立开发 PostgreSQL 数据库及受验证的 Resend 发信域，填写服务端环境变量。
2. 生成独立的认证密钥和 32 字节加密密钥；确认旧版本加密密钥的独立保管方式。
3. `pnpm db:migrate`，验证迁移与空数据库启动。
4. 真实邮箱验证码登录，再通过邮件验证设置可选密码；验证两种方式属于同一用户、密码重置撤销旧会话。
5. 使用两个测试账号检查 Key、报告、笔记和详情隔离；检查多标签页替换 Key、取消和旧请求迟到。
6. 验证退出、删除 Key、删除账号、闲置及绝对到期、数据库实例切换和清理任务。

不要在生产环境配置本地联调 `WEREAD_API_KEY`。个人 Key 可由游客临时接入或登录后的账号设置提交。公开服务只需数据库、应用地址和加密密钥即可提供游客连接；邮箱配置仅影响登录保存。本地开发入口通过独立路由使用开发 Key，不依赖数据库，不改变正式账号接口的会话保护。

## 本地与生产环境配置

数据库由 `DATABASE_URL` 实际指向的 Neon 分支决定，`NODE_ENV`、文件名和数据库名不会自动切换数据库。正式环境使用 `production` 分支，本地开发与测试使用独立的 `development` 分支；两个分支可以都叫 `yuewen` 数据库，但连接串必须来自各自分支。

- `.env` 供 `pnpm dev`、本地探针和 `pnpm db:migrate` 读取，填写开发分支连接串及开发邮件 Key，`APP_URL=http://127.0.0.1:5173`。
- `.env.production` 保存正式配置，导入 Netlify 时仅用于 Production context，`APP_URL=https://read.sunpm.me`。本地文件不会自动同步到 Netlify，修改平台环境变量后需要重新部署。
- 开发和生产分别生成 `BETTER_AUTH_SECRET` 与 `KEY_ENCRYPTION_KEYS`。加密密钥需要独立保管，日常部署不要重新生成。

上述私有环境文件已由 `.gitignore` 忽略。生产运行使用 Neon pooled 连接；执行生产迁移时，临时在 `.env.migrate` 中填写生产 direct 连接作为 `DATABASE_URL`，从项目根目录执行 `pnpm exec tsx --env-file=.env.migrate server/db/migrate.ts`，完成后删除该临时文件。不要把生产连接放入默认开发 `.env`。

公开 Deploy Preview 只开放模拟示例。Functions 按可信 `context.deploy.context` 在非生产／本地环境拒绝个人接口，清理仅允许生产；即使平台误继承凭据也不访问数据库或发信。环境变量仍应在 Netlify 管理端隔离为 Production context；本轮没有改动控制台权限或变量作用域。后续需要联调预览登录时，应先明确独立开发库及可信域名，再调整这项限制。

## Netlify 准备

构建命令 `pnpm build` 顺序构建 React PC、移动与后台入口，产物分别为 `dist`、`dist/m` 与 `dist/console`，Functions 位于 `netlify/functions`。`api.ts` 服务 `/api/*`，`/console` 与 `/console/*` 回退到 `/console/index.html`，移动路由 `/m/*` 回退到 `/m/index.html`，桌面路由最后回退到 `/index.html`。`cleanup.ts` 每 15 分钟分批删除过期游客连接及其凭据、报告、保存回执、替换回执、认证会话、验证码与业务限流计数。启用管理认证后同轮清理过期管理会话、验证码与一天以前的管理限流记录。每张表每轮最多选取 500 条过期记录，先用 `FOR UPDATE SKIP LOCKED` 锁定候选行，再在同一语句中删除；正在被续期或其他事务操作的候选行留待下一轮，避免等待续期提交后仍按旧期限误删。外键级联删除不受该候选条数限制；请求到期仍立即拒绝，不等待清理调度。

API 路由统一使用 `netlify.toml` 的重写规则，入口保留默认 `/.netlify/functions/api` 地址，不再声明函数 `config.path`。Netlify 设置自定义路径后会关闭默认函数地址，两者同时使用会使重写目标失效，产生平台 404。`GET /api/health` 返回的 `auth` 只检查登录环境变量是否非空，不验证数据库连接、邮件投递或加密密钥。

上线前还需验证 Netlify 实际路径重写、函数打包、冷启动、数据库连接与函数区域、可信来源、HTTPS Cookie、发信域、DNS、备份恢复和资源消耗。正式健康接口已返回 `200 / auth:true`，生产空库已完成 0000–0002 初始化；PR 的 Netlify 预览成功，合并主分支自动发布。完整线上场景和资源预算仍按质量记录验收。

数据库备份、恢复和应用回滚按[恢复手册](database-recovery.md)执行。`pnpm db:backup` 使用官方 `pg_dump`、AES-256-GCM 和独立 R2；`pnpm db:restore <object-key>` 仅接受已确认冻结来源后的隔离空库，先补齐当前工具随附的缺失迁移，再重放独立撤销意图、失效全部密码/会话/游客与报告。升级前备份也能恢复到当前结构；原生工具与 Node 使用一致的解码库名，目标检查、迁移和重放共用隔离连接，连接串不能通过查询参数覆盖目标。任一步失败均不开放服务。命令读取开发 `.env`，连接串限制、完整变量及运维入口见手册；`RECOVERY_LOG_ENABLED` 默认关闭，开启后日志不可用会阻止持久删除/撤销。

`pnpm db:backup:status` 只读核验当前 scope/epoch 的最新档案及 checkpoint，超过 30 小时、缺失或校验失败时非零退出，详细状态见[恢复手册](database-recovery.md#只读备份状态)。该检查不连接数据库、不替代隔离恢复或日志连续性验收。

备份 7 天、日志 30 天的规则及每日调度已入库；2026-10-22 生产专用存储规则与公开访问四项真实回读通过，独立对象凭据空桶列举成功，见[生产存储证据](quality-log.md#production-recovery-storage-2026-10-22)。本地受限配置及短期控制面凭据清理见[恢复手册](database-recovery.md#配置与执行)；`pnpm db:recovery:storage:status` 的变量与结果边界见[存储核对](database-recovery.md#storage-status)。手动工作流可在调度关闭时执行，先验证手动备份再启用仓库变量 `RECOVERY_BACKUP_ENABLED`。该开关仍未开启，Netlify/GitHub 生产恢复环境尚未配置，日志及基线备份仍待启用。日志启用后回滚版本也须保留日志能力，不能仅凭旧 C2/C3 兼容证据回滚；实际恢复窗口及平台回滚仍待接入。

## 故障定位

正式 API 与本地开发入口共用错误处理。未知异常返回通用 `SERVICE_ERROR`，服务端输出 `yuewen.request_failed`，记录响应中的请求标识、HTTP 方法、注册路由模板，以及最多三层异常类型、错误码和项目内调用位置。日志不输出错误原文、SQL 参数、Cookie、Key、邮箱或阅读正文；用请求标识关联一次失败，避免仅凭 HTTP 503 推断业务根因。已知业务错误仍返回原错误码与重试提示，不自动重放写操作。

## 当前限制

- 当前配置 PostgreSQL 迁移已于 2026-10-04 成功执行，包含 `report_replacement` 和游客连接、保存回执迁移；游客版本要求应用 `0002_nasty_black_knight.sql`。真实验证码收码、登录和游客保存 API 已核验；生产空库初始化也已成功；跨账号/跨登录会话并发与跨函数实例集成仍待验收。
- 上游只有明确 HTTP 401 自动标记失效，其他业务错误码尚待真实案例补充。
- 默认逐月采集以补充日明细；尚未优化为完整年汇总加边界月的混合策略。
- 报告内容预算触顶可下载部分结果，但尚无分卷采集机制；失败重试由用户触发，没有自动退避重试。
- 笔记词频是轻量中文分词；没有收费模型、历史报告库、公开分享或独立 PDF 生成。
- PC4 已完成本批 Chrome 关键流程、缩放和 Lighthouse 检查；完整生产闭环仍待后续上线阶段验收。

这些项目保留在后续里程碑，不能将示例通过作为生产账号闭环通过。

<a id="development-source"></a>

## 本地真实数据与模拟回归

PC `/demo` 默认模拟，显式 `source=development` 才读取服务端 `WEREAD_API_KEY`；冻结 H5 `/m/demo` 保留原默认开发来源。启动器为四个开发服务固定设置 `NODE_ENV=development`，避免继承外部的生产环境变量后隐藏开发数据入口。`server/dev.ts` 才挂载 `/api/dev/*`，服务仅绑定回环地址；请求必须携带本地页面发出的专用请求头，写请求核对来源。缺失或失效 Key 显示错误，可手动切换模拟示例，不静默回退。开发数据仅在进程内存存活两小时，每范围复用缓存；刷新才重采，沿用 600 请求、1.5 MB、10,000 条正文预算。

显式模拟入口为 `?source=mock`，包含 12 本公开书目与一本原创导入示例。`pnpm probe --shelf` 只读取书架及各一本普通/无分类书籍的详情与进度，最多 5 次请求，观察分类字符串与字段类型，不输出书名、正文或凭据；任一请求失败返回非零退出码。

运行已有 E2E 前先停止现有 `pnpm dev`，使用 `WEREAD_DEMO_MODE=mock pnpm dev` 启动服务，再从另一个终端运行 `pnpm test:e2e --workers=3`；已有配置会复用开发服务，仅给测试命令设置变量不能改变正在运行的服务器。检查结束后重新启动普通 `pnpm dev` 恢复真实开发模式。

生产构建和公开预览的示例固定为模拟，查询参数不能启用本地真实来源。Netlify Functions 仅导入 `server/app.ts`，不导入 `server/dev.ts`。

字体固定为霞鹜文楷轻便版 v1.522，Regular 400、Medium 500，压缩为 WOFF2 后放入 `web/public/fonts/`；双端与离线导出均从同一份 `/fonts/` 资源读取。移动构建引用根目录公共资源，不再复制一套字体。HTML 每份字体仅嵌入一次，并附 OFL 许可。

构建遇到宿主文件监听 `EMFILE` 时，可使用 `CHOKIDAR_USEPOLLING=true pnpm build`；这只改变本次构建监听方式，不修改运行时功能。

## C2 后端配置与清理

C2 后端位于 `server/feedback/`，迁移 `0004_c2_feedback.sql` 新增反馈、附件、提交上下文、幂等回执、对象删除任务、对账游标和最小审计表。开发库已迁移；生产本批不迁移、不启用。`FEEDBACK_ENABLED` 默认关闭，未配置时反馈返回 `FEEDBACK_UNAVAILABLE`，不查询新表；生产公开预览继续由 Functions 适配器整体隔离。PC 与 `/console/feedback` 页面已接入，载荷见[数据契约](data-contract.md#feedback-api)。

PC 反馈入口先建立提交上下文，截图仅在内存预览，点击提交才上传。`shared/feedback.ts` 共用字段校验；`client/api.ts` 对 FormData 由浏览器设置 multipart boundary，其他请求沿用 JSON。截图使用 html-to-image 1.11.13，离屏副本遮蔽所有表单输入，十秒超时，最多 400 万像素、1 MiB；过长页面提示改截可见区域或文字反馈。取消/离开页面会清理草稿和对象 URL；重试复用首次 FormData，修改文字或图片才生成新请求标识，身份失效须显式重新确认。

后台反馈列表以 Query 驱动受控分页与筛选，RHF/Zod 维护处理表单；列表只用脱敏归属，详情按需读取正文和图片。修改及删除携带版本，冲突保留草稿并提供刷新；管理请求鉴权失败、离线或会话核验会清理缓存/图片。开发 R2 关键 API 已取得实际证据；截图效果、界面运行及生产闭环仍待验收。

先迁移，配置对应环境私有 R2 bucket、仅限该 bucket 的凭据与 30 天对象生命周期，再完成真实写/读/删及失败恢复验收，最后设置 `FEEDBACK_ENABLED=true`。服务端变量为 `R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET`；缺少 R2 配置仍允许已启用环境的文字反馈，截图明确拒绝。2026-10-13 已配置独立开发 bucket 和本地忽略的 `.env`，限定开发 bucket 的对象读写凭据有效至 2026-11-12，到期需更新本地凭据。生产变量未写入，持久 `FEEDBACK_ENABLED` 保持关闭；本次只在隔离联调进程临时开启。资源命名见[上线计划](plans/release.md#r2-deployment)，实际 API 结果见[质量记录](quality-log.md#c2-development-r2-2026-10-13)。

R2 采用 AWS S3 SDK，region 为 `auto`，endpoint 按账号构造；不配置公共 URL、不签发浏览器直传链接。图片用 `sharp` 有界完整解码，Netlify 将该原生模块列为 `external_node_modules`；部署时需确认 Linux 原生包实际打包/启动。普通前端构建不等于 Functions 已验证。

`pnpm feedback:cleanup` 从开发 `.env` 读取配置，显式执行当前数据库的反馈清理；等价入口为 `scripts/cleanup-feedback.ts --run`。生产维护需要运维者显式选择该环境文件。Netlify 原有每 15 分钟任务先清理阅读/认证数据，再处理反馈；R2 故障不会阻塞前一部分。没有迁移时探测后跳过新增表，已迁移时即使关闭反馈开关仍执行清理。

每轮数据库过期反馈/附件各最多 100 条、上下文/回执/审计各最多 500 条；R2 阶段按 20 秒总预算、最多 20 个对象/20 MiB 和每次最多 5 秒约束。删除失败按指数退避、最多间隔一天继续保留任务，不能静默丢弃；容量直到对象删除成功才释放。删除接口提交事务后最多尝试一个到期对象，剩余由定时任务处理。正在上传的对象等到租约结束后至少一分钟再删，迟到完成会再次确保删除任务存在。

孤儿回收每轮列出 `feedback/` 下最多 100 个对象，持久化分页游标，只处理 24 小时以上且无附件关联的对象，不会一直扫描同一批有效图片。业务删除先持久化独立 outbox，再删除反馈和账号，外键禁止绕过此顺序；双会话的游客反馈只解除辅助账号关联。回滚前关闭反馈入口；一旦存在反馈数据，回滚版本仍须保留 C2 账号删除与清理能力，旧版直接删除账号会被保护性外键拒绝。不要回滚删表或恢复旧数据库后直接开放附件，恢复要求见[上线计划](plans/release.md)。

## C3 用户与数据管理

`server/console/read.ts` 提供 `/api/console/users`、用户详情以及 `/api/console/data/*` 固定资源查询，见[数据契约](data-contract.md#console-read-api)。先应用 0000–0005 迁移并初始化对应环境的管理身份，再显式设置 `CONSOLE_DATA_ENABLED=true`；默认关闭，缺少 C3 审计原因或游客回执字段时返回 `CONSOLE_DATA_UNAVAILABLE`。该开关不依赖 `FEEDBACK_ENABLED` 或 R2 凭据，关闭反馈提交后仍可查看有效自有反馈的数量。生产开关本批未启用；本轮新增 `0005_c3_management.sql`，已应用于独立开发环境。

查询使用独立管理 Cookie、每管理员每分钟 120 次的共享限流、`no-store` 和返回前会话复核。前台/游客 Cookie 不替代管理身份。列表只选择声明字段，报告只在 SQL 中提取范围及数量，不读取完整采集状态到应用；认证账号、验证码与管理认证表不提供通用查询。查询页面已接入 `/console/users` 与 `/console/data/:resource?`；资源固定为 `credentials / guests / reports / sessions / audit / cleanup-stats`，未知资源显示 404，页面按需加载。用户详情可读取必要邮箱与关联运行记录；筛选值仅保留在内存，关闭详情/切换资源会取消旧查询，离线/会话失效沿用后台缓存清理。昵称编辑、删除账号、撤销账号/游客连接和前台会话、报告停止/清除已接入 `server/console/write.ts` 与页面确认弹窗，具体请求见[写操作契约](data-contract.md#console-write-api)。API 证据见[C3 查询记录](quality-log.md#c3-read-api-2026-10-10)，界面检查见[C3 页面记录](quality-log.md#c3-data-ui-2026-10-12)。

C3 危险操作每次输入管理员当前密码并选择结构化原因；事务内复用认证库校验，不增加公开改密或通用表编辑接口。前端不把密码放入 Query mutation 变量，提交后清空密码；错误保留目标版本，刷新后再操作，离开弹窗取消请求且不自动重放。审计按 180 天清理。

0005 增加审计原因和游客报告清除回执；新管理接口要求迁移完成，前台账号替换回执、游客读取和 C2 审计保留迁移前兼容路径，生产未启用 C3 时无需抢先开放后台。回滚时先关闭 `CONSOLE_DATA_ENABLED`，保留新增字段、回执和附件删除任务；一旦实际使用游客清除，回滚代码也须保留游客回执拒绝重试的逻辑，不能通过反向删列恢复旧报告。生产迁移/管理启用仍在 C5 对应批次执行。本轮未使用生产数据库，检查见[C3 写操作记录](quality-log.md#c3-write-2026-10-12)。

<a id="pc-analytics"></a>

## C4 PC 公开页基础统计

基础统计代码已完成，默认关闭；用户确认生产站点开通与实际接收留到 C5。没有新增数据库表、接口或 npm 依赖。后台概览通过固定外链打开 Cloudflare Web Analytics，不读取或缓存服务商统计数据；H5 与后台产物不加载 beacon。

仅在 Netlify Production 的构建环境设置 `PC_ANALYTICS_ENABLED=true`、`CF_WEB_ANALYTICS_TOKEN` 与正式 HTTPS origin `APP_URL`。token 是 Cloudflare 管理站点提供的 32 位十六进制公开站点标识，不能填写账号 API token。`vite.config.ts` 要求宿主进程的 `CONTEXT=production`，不会从 `.env` 冒充部署 context；非生产、开发及预览构建不嵌入配置。开启但 origin/token 无效时构建失败，避免发布误配置；正常未配置时完全关闭。浏览器再核对实际 origin，复制生产产物到其他域名或本地不会启用。

运行时入口为 `web/src/lib/analytics.ts`，在 React Router 启动前安装文档边界，再独立加载一次 `https://static.cloudflareinsights.com/beacon.min.js`，使用 `{ token, spa: false }`。不主动发送自定义事件、不重试或等待统计成功。站点必须选 **Enable with JS Snippet installation**，禁止 Cloudflare、Netlify 插件或其他平台整站自动注入。

计数口径为首页 `/` 和模拟示例 `/demo`（兼容尾斜杠）；示例只接受唯一的 `range`、`view` 与 `source=mock` 白名单值。公开路径/视图改变使用新文档，产生新的页面访问；范围变化仍在当前文档，不补发 PV。私有路径、`analytics=off`、单书/月明细、未知或重复参数、片段均不加载；不安全的 referrer 也使该文档保持关闭。回到公开页面时只有新文档才可安装 beacon，不向已经承载私有数据的文档追加第三方脚本。公开文档内只存在白名单 History 条目，前进/后退不会把私有路由作为同文档页面恢复。

反馈和示例搜索先完整导航至带 `analytics=off` 的原路由；搜索在统计文档中只读，聚焦后进入可输入的文档。最长一分钟的 sessionStorage 回执只包含原公开 URL、滚动位置及有界示例视图字段，读取即清除，不保存输入、正文、图片或凭据。页面/图表就绪后恢复滚动并打开反馈或聚焦搜索；图表等待最多十秒。存储不可用时仍可在原路由打开控件，局部视图和滚动可能使用默认值。刷新后继续保持无统计状态。全站使用 `Referrer-Policy: no-referrer`，PC HTML 同时设置相应 meta。

C5 开通顺序：在 Cloudflare 为正式 hostname 创建/核对手动接入站点，确认关闭自动注入；只在 Production 配置以上公开变量并重新部署；确认服务商收到公开页 PV/性能、没有重复导航 PV、私有页面和控件文档没有统计请求。禁用或被拦截时主流程照常工作。回滚设置 `PC_ANALYTICS_ENABLED=false` 并重新部署，或恢复原关闭统计的部署；已打开的旧文档需重新加载才应用新配置。统计可见性与国内可达性必须在开通后记录，构建成功不等于数据已接收。
