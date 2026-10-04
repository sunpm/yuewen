# 开发与部署

本文记录当前工程与配置方式。游客接入及按需登录仍按[游客计划](plans/guest-access.md)实施；目标部署、资源命名和上线验收见[上线验收计划](plans/release.md)，当前进度见[总计划](../PLAN.md)。

## 工程约定

两个 Vue SPA 与 Hono 同仓库。桌面端 `web/`，独立 Vant 移动端 `web-mobile/`，共用 `client/` 交互逻辑与 `shared/` 数据契约。Vitesse 的文件路由、自动导入、布局目录和 TypeScript 能力保留；去除 I18n、UnoCSS、Iconify、SSG、PWA、示例 store 和 Cypress。原布局插件的 peer 版本不支持当前组合，因此使用一个 Vue 布局组件。基础按钮采用 shadcn/vue 的 Primitive + CVA 方式，Select、Dialog、Table 使用 shadcn/vue 官方组件源码，底层由 Reka UI 管理焦点和键盘操作。

`pnpm dev` 同时启动桌面 Vite、移动 Vite 与本地 Hono；桌面 Vite 将 `/m/` 代理到移动 Vite、`/api` 代理到 Hono。浏览器统一从 5173 端口访问，两端保持同源认证；5180 是内部移动构建服务。两个 Vite 使用独立依赖缓存，并预构建 `d3-cloud`。词云的浏览器与 Node HTML 导出共用布局；仅 Node 导出加载 `@napi-rs/canvas` 和本地阅读字体，两端 Vite 明确排除该原生模块的浏览器预构建，生产浏览器包不包含原生绘图依赖。正式入口使用标准 Request/Response 的 Netlify Node.js Function。迁移文件由 Drizzle 生成，并纳入版本管理。

## 登录与数据库联调顺序

1. 准备独立开发 PostgreSQL 数据库及受验证的 Resend 发信域，填写服务端环境变量。
2. 生成独立的认证密钥和 32 字节加密密钥；确认旧版本加密密钥的独立保管方式。
3. `pnpm db:migrate`，验证迁移与空数据库启动。
4. 真实邮箱验证码登录，再通过邮件验证设置可选密码；验证两种方式属于同一用户、密码重置撤销旧会话。
5. 使用两个测试账号检查 Key、报告、笔记和详情隔离；检查多标签页替换 Key、取消和旧请求迟到。
6. 验证退出、删除 Key、删除账号、闲置及绝对到期、数据库实例切换和清理任务。

不要在生产环境配置本地联调 `WEREAD_API_KEY`。个人 Key 经认证后由账号设置提交。公开服务在认证未配置时只开放模拟示例。本地开发入口通过独立路由使用开发 Key，不依赖数据库，不改变正式账号接口的会话保护。

## 本地与生产环境配置

数据库由 `DATABASE_URL` 实际指向的 Neon 分支决定，`NODE_ENV`、文件名和数据库名不会自动切换数据库。正式环境使用 `production` 分支，本地开发与测试使用独立的 `development` 分支；两个分支可以都叫 `yuewen` 数据库，但连接串必须来自各自分支。

- `.env` 供 `pnpm dev`、本地探针和 `pnpm db:migrate` 读取，填写开发分支连接串及开发邮件 Key，`APP_URL=http://127.0.0.1:5173`。
- `.env.production` 保存正式配置，导入 Netlify 时仅用于 Production context，`APP_URL=https://read.sunpm.me`。本地文件不会自动同步到 Netlify，修改平台环境变量后需要重新部署。
- 开发和生产分别生成 `BETTER_AUTH_SECRET` 与 `KEY_ENCRYPTION_KEYS`。加密密钥需要独立保管，日常部署不要重新生成。

上述私有环境文件已由 `.gitignore` 忽略。生产运行使用 Neon pooled 连接；执行生产迁移时，临时在 `.env.migrate` 中填写生产 direct 连接作为 `DATABASE_URL`，从项目根目录执行 `pnpm exec tsx --env-file=.env.migrate server/db/migrate.ts`，完成后删除该临时文件。不要把生产连接放入默认开发 `.env`。

公开 Deploy Preview 默认只开放模拟示例，不注入生产数据库或邮件凭据。需要联调预览登录时，再配置开发分支数据库、开发密钥和与该预览地址完全一致的 `APP_URL`。

## Netlify 准备

构建命令 `pnpm build` 顺序构建桌面和移动入口，产物分别为 `dist` 与 `dist/m`，Functions 位于 `netlify/functions`。`api.ts` 服务 `/api/*`，移动路由 `/m/*` 回退到 `/m/index.html`，桌面路由最后回退到 `/index.html`。`cleanup.ts` 每 15 分钟分批删除过期报告、替换回执、会话、验证码与业务限流计数。

API 路由统一使用 `netlify.toml` 的重写规则，入口保留默认 `/.netlify/functions/api` 地址，不再声明函数 `config.path`。Netlify 设置自定义路径后会关闭默认函数地址，两者同时使用会使重写目标失效，产生平台 404。`GET /api/health` 返回的 `auth` 只检查登录环境变量是否非空，不验证数据库连接、邮件投递或加密密钥。

上线前还需验证 Netlify 实际路径重写、函数打包、冷启动、数据库连接与函数区域、可信来源、HTTPS Cookie、发信域、DNS、备份恢复和资源消耗。当前仓库配置不代表已完成平台部署。

回滚时先恢复上一版静态和函数部署。数据库迁移采用兼容变更；涉及删除字段/数据前单独规划备份及回滚，不自动通过应用回滚恢复已删除凭证。备份与解密密钥分开保管，生产保留期限尚待服务接入时确定。

## 当前限制

- 当前配置 PostgreSQL 迁移已于 2026-10-04 成功执行，新增 `report_replacement` 短期回执表；普通报告替换要求先应用 `0001_slim_ultimatum.sql`。真实邮件、跨账号/跨登录会话并发、生产迁移与跨函数实例集成仍未验收。
- 上游只有明确 HTTP 401 自动标记失效，其他业务错误码尚待真实案例补充。
- 默认逐月采集以补充日明细；尚未优化为完整年汇总加边界月的混合策略。
- 报告内容预算触顶可下载部分结果，但尚无分卷采集机制；失败重试由用户触发，没有自动退避重试。
- 笔记词频是轻量中文分词；没有收费模型、历史报告库、公开分享或独立 PDF 生成。
- 视觉首版已实现，200% 缩放、Lighthouse 与生产质量评分尚未完成。

这些项目保留在后续里程碑，不能将示例通过作为生产账号闭环通过。

<a id="development-source"></a>

## 本地真实数据与模拟回归

`pnpm dev` 下 `/demo` 与 `/m/demo` 默认读取服务端 `WEREAD_API_KEY`。启动器为三个开发服务固定设置 `NODE_ENV=development`，避免继承外部的生产环境变量后隐藏开发数据入口。`server/dev.ts` 才挂载 `/api/dev/*`，服务仅绑定回环地址；请求必须携带本地页面发出的专用请求头，写请求核对来源。缺失或失效 Key 显示错误，可手动切换模拟示例，不静默回退。开发数据仅在进程内存存活两小时，每范围复用缓存；刷新才重采，沿用 600 请求、1.5 MB、10,000 条正文预算。

显式模拟入口为 `?source=mock`，包含 12 本公开书目与一本原创导入示例。`pnpm probe --shelf` 只读取书架及各一本普通/无分类书籍的详情与进度，最多 5 次请求，观察分类字符串与字段类型，不输出书名、正文或凭据；任一请求失败返回非零退出码。

运行已有 E2E 前先停止现有 `pnpm dev`，使用 `WEREAD_DEMO_MODE=mock pnpm dev` 启动服务，再从另一个终端运行 `pnpm test:e2e --workers=3`；已有配置会复用开发服务，仅给测试命令设置变量不能改变正在运行的服务器。检查结束后重新启动普通 `pnpm dev` 恢复真实开发模式。

生产构建和公开预览的示例固定为模拟，查询参数不能启用本地真实来源。Netlify Functions 仅导入 `server/app.ts`，不导入 `server/dev.ts`。

字体固定为霞鹜文楷轻便版 v1.522，Regular 400、Medium 500，压缩为 WOFF2 后放入 `web/public/fonts/`；双端与离线导出均从同一份 `/fonts/` 资源读取。移动构建引用根目录公共资源，不再复制一套字体。HTML 每份字体仅嵌入一次，并附 OFL 许可。
