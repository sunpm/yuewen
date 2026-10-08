# 开发与部署

本文记录当前工程与配置方式。游客接入及按需登录保存已接入，完整验收状态见[游客计划](plans/guest-access.md)；目标部署、资源命名和上线验收见[上线验收计划](plans/release.md)，当前进度见[总计划](../PLAN.md)。

## 工程约定

PC0–PC1 已在 `web/react/` 接入 React 外壳与五页布局预览，正式 PC 仍使用下述 Vue 实现。`pnpm dev:react` 在 5174 独立运行，可预览首页、概览、四章报告摘要、书架筛选/详情和笔记全文/分页；复用既有模拟数据并固定样例日期为 2026-10-09，不连接业务 API。`/demo?view=notes&range=2025` 等示例路径可直达；个人页面同样只显示明确标注的模拟预览，登录/设置不接收凭据，下载只显示说明且按钮禁用；`pnpm dev` 同时启动该入口。`pnpm build:react` 输出 `dist-react/`，`pnpm preview:react` 在 4174 预览该构建。根 `build` 构建 Vue PC、H5 和 React，但 Netlify 仍只发布 `dist/`，React 外壳不进入线上入口。正式 React 完成并验收后直接替换 Vue PC，临时目录与脚本届时合并清理，见[迁移边界](plans/pc-refresh.md#migration)。

根 `typecheck` 分别运行 `vue-tsc` 和 React `tsc`；根 `lint` 分别运行 ESLint 和 Biome。`web/react/`、`vite.react.config.ts`、`tsconfig.react.json` 与 `biome.json` 由 Biome 负责，Vue/共享/服务端保留 ESLint，Markdown 保留 Prettier；同一源码不重复格式化。两个 PC 的 Tailwind 扫描范围显式分开，React 共用根字体和品牌资源；H5 构建与已有 Vitest 用例发现范围保持不变。

两个 Vue SPA 与 Hono 同仓库。桌面端 `web/`，独立 Vant 移动端 `web-mobile/`，共用 `client/` 交互逻辑与 `shared/` 数据契约。Vitesse 的文件路由、自动导入、布局目录和 TypeScript 能力保留；去除 I18n、UnoCSS、Iconify、SSG、PWA、示例 store 和 Cypress。原布局插件的 peer 版本不支持当前组合，因此使用一个 Vue 布局组件。基础按钮采用 shadcn/vue 的 Primitive + CVA 方式，Select、Dialog、Table 使用 shadcn/vue 官方组件源码，底层由 Reka UI 管理焦点和键盘操作。

`pnpm dev` 同时启动桌面 Vite、移动 Vite 与本地 Hono；桌面 Vite 将 `/m/` 代理到移动 Vite、`/api` 代理到 Hono。浏览器统一从 5173 端口访问，两端保持同源认证；5180 是内部移动构建服务。`PORT=8788 pnpm exec tsx --env-file=.env server/dev.ts` 可单独启动另一端口的 API，默认仍为 8787。两个 Vite 使用独立依赖缓存，并预构建 `d3-cloud`。词云的浏览器与 Node HTML 导出共用布局；仅 Node 导出加载 `@napi-rs/canvas` 和本地阅读字体，两端 Vite 明确排除该原生模块的浏览器预构建，生产浏览器包不包含原生绘图依赖。正式入口使用标准 Request/Response 的 Netlify Node.js Function。迁移文件由 Drizzle 生成，并纳入版本管理。

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

构建命令 `pnpm build` 顺序构建 Vue 桌面、移动与 React 预览入口，产物分别为 `dist`、`dist/m` 与 `dist-react`；只发布前两个入口，Functions 位于 `netlify/functions`。`api.ts` 服务 `/api/*`，移动路由 `/m/*` 回退到 `/m/index.html`，桌面路由最后回退到 `/index.html`。`cleanup.ts` 每 15 分钟分批删除过期游客连接及其凭据、报告、保存回执、替换回执、认证会话、验证码与业务限流计数。每张表每轮最多选取 500 条过期记录，先用 `FOR UPDATE SKIP LOCKED` 锁定候选行，再在同一语句中删除；正在被续期或其他事务操作的候选行留待下一轮，避免等待续期提交后仍按旧期限误删。外键级联删除不受该候选条数限制；请求到期仍立即拒绝，不等待清理调度。

API 路由统一使用 `netlify.toml` 的重写规则，入口保留默认 `/.netlify/functions/api` 地址，不再声明函数 `config.path`。Netlify 设置自定义路径后会关闭默认函数地址，两者同时使用会使重写目标失效，产生平台 404。`GET /api/health` 返回的 `auth` 只检查登录环境变量是否非空，不验证数据库连接、邮件投递或加密密钥。

上线前还需验证 Netlify 实际路径重写、函数打包、冷启动、数据库连接与函数区域、可信来源、HTTPS Cookie、发信域、DNS、备份恢复和资源消耗。正式健康接口已返回 `200 / auth:true`，生产空库已完成 0000–0002 初始化；PR 的 Netlify 预览成功，合并主分支自动发布。完整线上场景和资源预算仍按质量记录验收。

回滚时先恢复上一版静态和函数部署。游客迁移是兼容新增，不自动执行反向删表；回滚后的旧版本不提供游客功能，临时游客数据继续按原期限清理。数据库迁移采用兼容变更；涉及删除字段/数据前单独规划备份及回滚，不自动通过应用回滚恢复已删除凭证。备份与解密密钥分开保管，生产保留期限尚待服务接入时确定。

## 故障定位

正式 API 与本地开发入口共用错误处理。未知异常返回通用 `SERVICE_ERROR`，服务端输出 `yuewen.request_failed`，记录响应中的请求标识、HTTP 方法、注册路由模板，以及最多三层异常类型、错误码和项目内调用位置。日志不输出错误原文、SQL 参数、Cookie、Key、邮箱或阅读正文；用请求标识关联一次失败，避免仅凭 HTTP 503 推断业务根因。已知业务错误仍返回原错误码与重试提示，不自动重放写操作。

## 当前限制

- 当前配置 PostgreSQL 迁移已于 2026-10-04 成功执行，包含 `report_replacement` 和游客连接、保存回执迁移；游客版本要求应用 `0002_nasty_black_knight.sql`。真实验证码收码、登录和游客保存 API 已核验；生产空库初始化也已成功；跨账号/跨登录会话并发与跨函数实例集成仍待验收。
- 上游只有明确 HTTP 401 自动标记失效，其他业务错误码尚待真实案例补充。
- 默认逐月采集以补充日明细；尚未优化为完整年汇总加边界月的混合策略。
- 报告内容预算触顶可下载部分结果，但尚无分卷采集机制；失败重试由用户触发，没有自动退避重试。
- 笔记词频是轻量中文分词；没有收费模型、历史报告库、公开分享或独立 PDF 生成。
- 视觉首版已实现，200% 缩放、Lighthouse 与生产质量评分尚未完成。

这些项目保留在后续里程碑，不能将示例通过作为生产账号闭环通过。

<a id="development-source"></a>

## 本地真实数据与模拟回归

`pnpm dev` 下 `/demo` 与 `/m/demo` 默认读取服务端 `WEREAD_API_KEY`。启动器为四个开发服务固定设置 `NODE_ENV=development`，避免继承外部的生产环境变量后隐藏开发数据入口。`server/dev.ts` 才挂载 `/api/dev/*`，服务仅绑定回环地址；请求必须携带本地页面发出的专用请求头，写请求核对来源。缺失或失效 Key 显示错误，可手动切换模拟示例，不静默回退。开发数据仅在进程内存存活两小时，每范围复用缓存；刷新才重采，沿用 600 请求、1.5 MB、10,000 条正文预算。

显式模拟入口为 `?source=mock`，包含 12 本公开书目与一本原创导入示例。`pnpm probe --shelf` 只读取书架及各一本普通/无分类书籍的详情与进度，最多 5 次请求，观察分类字符串与字段类型，不输出书名、正文或凭据；任一请求失败返回非零退出码。

运行已有 E2E 前先停止现有 `pnpm dev`，使用 `WEREAD_DEMO_MODE=mock pnpm dev` 启动服务，再从另一个终端运行 `pnpm test:e2e --workers=3`；已有配置会复用开发服务，仅给测试命令设置变量不能改变正在运行的服务器。检查结束后重新启动普通 `pnpm dev` 恢复真实开发模式。

生产构建和公开预览的示例固定为模拟，查询参数不能启用本地真实来源。Netlify Functions 仅导入 `server/app.ts`，不导入 `server/dev.ts`。

字体固定为霞鹜文楷轻便版 v1.522，Regular 400、Medium 500，压缩为 WOFF2 后放入 `web/public/fonts/`；双端与离线导出均从同一份 `/fonts/` 资源读取。移动构建引用根目录公共资源，不再复制一套字体。HTML 每份字体仅嵌入一次，并附 OFL 许可。

构建遇到宿主文件监听 `EMFILE` 时，可使用 `CHOKIDAR_USEPOLLING=true pnpm build`；这只改变本次构建监听方式，不修改运行时功能。
