# 阅纹

**看见你的阅读轨迹。**

面向微信读书的个人阅读可视化工具，将阅读统计、书架、划线和想法整理成可探索的阅读档案。

## 当前状态

桌面端与独立 Vant 移动端已进入开发，提供可运行的首页和完整模拟示例：阅读概览、27 个分析模块、书架搜索与详情、笔记检索、自动／浅色／深色主题，以及离线 HTML / JSON 下载。

游客临时接入、按需登录保存连接、报告冲突确认与保存回执已实现。支持扩展阅读指标、月度联动、完整报告下载及邮件反馈入口。Hono API、Better Auth 邮箱验证码和可选密码、PostgreSQL 数据模型、Key 加密、分批采集与过期清理共用一套实现。该功能版本已合并并发布，首版完整验收仍待完成，不能以健康检查或已有构建代替生产闭环验收。

PC 已切换为 React + Vite 正式入口，包含游客采集、登录保存、恢复、27 个完整图表与明细、月份联动及 HTML/JSON 下载。PC4 按关键流程与已有工程检查验收，首屏字体加载及图表读屏描述已优化。后台 C0–C1 已启用独立管理员登录与 `/console`，登录、刷新及切回关键流程已验收；截图反馈的数据库、API、R2 适配和附件清理已实现且默认关闭，PC 截图提交与后台处理界面已接入，开发环境真实存储的关键 API 联调已完成，界面运行及生产存储验收仍待完成；用户及连接、报告、会话、审计和清理统计的查询页面及昵称编辑、账号删除、连接/会话撤销和报告停止/清除已接入，包含密码确认、版本校验与事务审计；PC 公开页访问统计、私有文档隔离和后台统计外链已实现且默认关闭，生产数据管理与统计开通继续按计划实施。H5 保留既有入口，暂停更新，设备自动切换随未来重构推进。执行顺序见[总计划](task_plan.md)。

每日加密备份、独立删除/撤销日志及空库恢复重放已实现；生产存储、日志、基线与隔离恢复已完成。专用备份环境的手动备份和回读校验通过，每日调度已开启；首次定时运行及平台回滚仍待核实。步骤与证据见[恢复手册](docs/database-recovery.md)。

长期报告存档和 PC 超预算分段续采已实现，生产待发布。续采保留原报告期限、已有正文及分页游标，各段结果合并去重后可查看与下载；具体上限见[数据契约](docs/data-contract.md#segmented-collection)。

## 本地开发

需要 Node.js 20.19+（部署建议 Node.js 22）与 pnpm 10。

```sh
pnpm install
test -f .env || cp .env.example .env
pnpm dev
```

访问 `http://127.0.0.1:5173`。桌面端示例为 `/demo`，独立 Vant 移动端为 `/m/`，示例为 `/m/demo`；两端无需数据库即可体验。PC 示例默认使用模拟数据，可显式选择本地开发来源；H5 沿用默认开发来源，`/m/demo?source=mock` 为模拟示例，公开构建始终使用模拟示例。邮箱服务未配置时，登录页明确提示并停用发送按钮。

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install chromium firefox webkit
WEREAD_DEMO_MODE=mock pnpm dev # 先关闭已有开发服务；另一个终端运行下一条
pnpm test:e2e
```

实际验证结果与限制见 [质量记录](docs/quality-log.md)。

PC 正式产物为 `dist/`，`pnpm preview` 可预览生产构建。旧 PC 页面和迁移专用入口已移除。

后台本地入口为 `http://127.0.0.1:5173/console/`。配置与初始化见[开发说明](docs/development.md#后台开发与初始化)，独立集成检查为 `pnpm test:console`；生产管理身份需单独配置。

## 真实账号接入

游客接入需要服务端数据库、应用地址及加密密钥；按需登录保存还需要认证密钥与 Resend 发信配置。按 `.env.example` 配置后执行 `pnpm db:migrate`。`APP_URL` 必须与浏览器访问来源一致。

`KEY_ENCRYPTION_KEYS` 为 JSON 对象，键为版本号、值为 32 字节随机密钥的 Base64 编码；`KEY_ENCRYPTION_VERSION` 指定当前写入版本。旧版本密钥应在迁移密文前保留。认证密钥和加密密钥应独立生成并保存在服务端配置中。

临时连接和报告闲置 30 分钟、最长 2 小时后清理，可随时下载或清除。保存连接只保存 Key；PC 另提供“保存报告”和历史列表，可选择是否保存笔记正文，重新登录后查看与下载。长期存档代码已实现，生产迁移与发布尚待执行。

`WEREAD_API_KEY` 用于本地开发页面和只读探针，不能作为公开服务的全局用户凭证，也不能注入前端。`pnpm probe` 输出字段类型，`pnpm probe:report` 在内存中执行有界采集并输出模块状态；均不保存个人笔记正文。

## 技术与目录

- PC：`web/` 使用 React、React Router、shadcn/ui、Radix、Tailwind CSS、Biome、TanStack Query、React Hook Form/Zod 与 Better Auth React。
- 后台：`console/` 使用 React、antd、独立 Router/QueryClient、RHF/Zod 和 Better Auth Username。
- 移动端：Vant 4，独立路由、底部导航与弹层；不使用桌面响应式布局。
- 图表：ECharts 按需注册，SVG 渲染，提供数据表和离线图表。
- 后端：Hono、Node.js、Better Auth、PostgreSQL、Drizzle。
- `web/` 桌面页面；`web-mobile/` Vant 移动页面；`client/` 两端共用的登录、账号、采集与导出；`shared/` 报告契约与原创示例；`server/` 认证、采集、聚合与数据模型；`netlify/functions/` 函数入口；`tests/` 自动化验证。

[任务计划与下一步](task_plan.md) · [发现与决策](findings.md) · [进度日志](progress.md) · [Agent 协作入口](AGENTS.md) · [PC 设计系统](DESIGN.md) · [跨端设计细则](docs/design-system.md) · [数据契约](docs/data-contract.md) · [开发与部署说明](docs/development.md) · [模板来源](docs/third-party-notices.md)

项目路线图、需求与决策、执行记录分别保存在根目录 `task_plan.md`、`findings.md`、`progress.md`。详细方案见 `docs/plans/` 的相关专题，历史方案见 `docs/plans/archive/`，实际验收结果见质量记录。

## 品牌

「阅纹」取“阅读留下的纹理”之意。Logo 用圆角绿色底承托三道统一粗细的弧线，将展开的书页与阅读纹理合为「层页」标志。PC 采用纸白背景、墨色正文和墨绿强调；深色采用墨黑绿背景、中性浅色正文与浅墨绿主色。

[品牌预览](brand/brand-preview.png) · [浅色 Logo](brand/logo-light.svg) · [深色 Logo](brand/logo-dark.svg)

编辑 [图形源文件](brand/symbol.svg)、[字标源文件](brand/wordmark.svg) 或 [品牌色板](client/theme.ts) 后运行 `pnpm brand:generate`，统一生成品牌资产及网站副本。

## 公开参考

- [微信读书 Skill 官方入口](https://weread.qq.com/r/weread-skills)
- [官方网关与接口说明](https://github.com/Tencent/WeChatReading)
- [阅读报告功能参考](https://github.com/yaojingang/yao-open-skills/tree/main/skills/yao-weread-skill)
- [前端模板：Vitesse](https://github.com/antfu-collective/vitesse)
