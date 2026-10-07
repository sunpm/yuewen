# PC 精简与 React 迁移

更新日期：2026-10-08（Asia/Shanghai）

状态：用户确认新增计划，技术选型已确定；尚未开发、安装依赖或部署。当前 PC 仍为 Vue，H5 仍为独立 Vant 入口。

[返回总计划](../../PLAN.md) · [设计与布局](design.md#pc-layout) · [架构与接口](architecture.md) · [后台计划](console.md)

## 目标与现状

PC 页面精简描述与重复信息，按 AIHOT 的桌面布局重做应用外壳，同时迁移到 React。保留游客接入、按需登录保存、27 个图表与 3 个画像内容模块、范围/筛选/详情以及 HTML/JSON 下载的既有业务能力；精简展示不改变数据口径和导出完整性。

已核对 `package.json`、两份 Vite 配置、`netlify.toml`、`web/src/layouts/default.vue`、`ReportView.vue`、`ReportModule.vue` 与 `client/`：现有 PC 使用 Vue 3 + Vite + shadcn/vue，H5 使用 Vue + Vant；API 为 Hono/Netlify Functions。`client/api.ts`、`charts.ts`、`wordCloud.ts`、`export.ts` 等已有可复用逻辑，但 `useReadingReport.ts` 等 composables 及 `auth.ts` 依赖 Vue，不能直接当作 React hooks 使用。后台 React 工程仍未实施。

<a id="h5-freeze"></a>

## H5 冻结与需求默认范围

- 从本次决策起，后续未特别注明的前端需求均指 PC。H5 停止功能、视觉、交互与技术栈更新，未来整体重构另行制定计划；本轮不确定其新技术栈或开工日期。
- 保留现有 `web-mobile/`、`/m/` 路由、Vant 与构建发布能力，不下线或删除旧 H5。PC 新布局、截图反馈、统计和依赖迁移不向 H5 同步。
- 原计划的 H5 品质改进与完整移动端专项验收暂停，保留质量记录中的失败与未验证事实；后续重构时重新评估。冻结不等于验收通过，也不以补齐移动端品质作为本轮 PC 完成条件。
- 修改共享代码、API、字体路径或构建时，仍运行受影响的已有检查，核验 H5 入口、资源和既有核心流程可用。由本轮 PC 改造引入的兼容问题在改动源头处理，不借此扩大 H5 功能范围。
- 设备自动分流、双端手动偏好及新增深链接映射整体推迟到 H5 重构阶段，见[设备入口计划](design.md#device-entry)。现阶段保持既有入口行为，不把 PC 用户自动导向冻结页面。

<a id="stack"></a>

## 技术选型与职责

决定采用 **React + Vite + TypeScript**，路由使用 React Router 的客户端路由。Next.js 是基于 React 的框架；本站已有 Hono API、会话、采集与静态部署，当前主要需求是交互式个人报告，没有已确认的 SSR、RSC 或内容型 SEO 需求，因此沿用 Vite 的迁移范围更小，也与后台方案一致。后续确有服务端渲染需求再评估，不在本次引入第二套服务端接口或渲染运行时。此取舍依据当前项目边界；React 官方说明了 [Vite 客户端应用及路由、取数的配套需求](https://react.dev/learn/build-a-react-app-from-scratch)，Next.js 的能力见[服务端与客户端组件](https://nextjs.org/docs/app/getting-started/server-and-client-components)。

| 部分          | PC 采用方案与职责                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI 与布局     | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/docs/installation/vite)；采用以 [Radix UI](https://www.radix-ui.com/) 为底层的组件，按需引入源码，替换 shadcn/vue。Radix 提供基础交互，不额外叠加 Radix Themes 或另一套相同控件 |
| 动效          | Framer Motion，按现行 [Motion for React](https://motion.dev/docs/react) 接入；用于必要的页面和状态过渡，普通 hover/颜色变化仍用 CSS，支持减少动效                                                                                                            |
| 通用 hooks    | [ahooks](https://github.com/alibaba/hooks) 用于防抖、事件和常用交互；PC 的服务端请求由 TanStack Query 管理，不再用 `useRequest` 复制缓存、轮询与重试                                                                                                         |
| 服务端状态    | [TanStack Query](https://tanstack.com/query/latest)：连接状态、报告查询、分页、变更与失效处理；缓存只在内存中，不持久化报告正文或 Key                                                                                                                        |
| 客户端状态    | [Zustand](https://github.com/pmndrs/zustand)：确需跨组件共享的界面状态；局部状态用 React，范围与可分享的筛选继续以 URL 为准，不复制 Query 缓存或建立第二份范围来源                                                                                           |
| 表单          | [React Hook Form](https://github.com/react-hook-form/react-hook-form) + Zod：登录、Key 设置和反馈表单；错误、提交中、取消与重复提交沿用既有业务规则                                                                                                          |
| 类型与校验    | 全链路 [TypeScript](https://www.typescriptlang.org/) + [Zod](https://zod.dev/)；共用必要类型与纯 schema，服务端继续验证信任边界，不将前端校验代替接口校验                                                                                                    |
| Lint 与格式化 | [Biome](https://biomejs.dev/internals/language-support/) 负责 PC React/TS/TSX、JSON 与支持的样式文件；保留 `tsc` 类型检查。冻结 Vue 和 Markdown 等未迁移范围沿用既有 ESLint/Prettier，按路径划分、不重复处理同一文件                                         |
| 图表与后端    | 保留 ECharts、词云布局、HTML/JSON 导出及 Hono、Better Auth、Drizzle、PostgreSQL、Netlify Functions；仅为 React 补必要生命周期与认证适配                                                                                                                      |

上述选型在实施时锁定兼容的稳定版本并更新锁文件。Biome 官方仍将 Vue 全量支持标为实验性，本次不以工具切换为由改造 H5。后台继续按其专题采用 antd/ProComponents 与 ahooks，不因 PC 选型强制改用 shadcn/ui 或 React Hook Form；可共用 React/Vite/TypeScript 的工程配置，入口样式、请求缓存与认证保持独立。

<a id="migration"></a>

## 迁移边界

1. PC 最终仍使用 `web/` 和 `/`。PC0–PC3 在同一迁移分支持续开发，主分支保留可运行的 Vue PC；React 在本地或隔离的受控部署验收，公开 PR 预览仅验模拟数据。PC4 通过后才合并并切换正式入口，不能将阶段性替换直接合入会自动发布的主分支。H5 使用 `web-mobile/` 和 `/m/`，后台使用 `console/` 和 `/console`，保持一个根包和一个 Netlify 部署单元。
2. 共用 `shared/` 类型与聚合口径、无框架依赖的 API/图表/导出函数。React hooks 与组件放在 PC 内，冻结 H5 继续使用现有 Vue composables；只在确有两处消费者时提取纯函数，不建立通用跨框架状态层。PC 完成后也不能删除 H5 仍引用的 Vue、Vant、插件与共享组件。
3. React 认证适配沿用现有 Cookie、接口、连接选择与返回规则。报告 Query key 包含当前属主上下文、连接、范围及必要任务/凭证版本；退出、清除、切换连接或版本失效时清理对应缓存并取消或忽略旧响应。
4. 采集创建、推进、保存、替换确认属于有副作用的操作，按既有幂等标识和串行规则驱动；不因组件挂载、StrictMode、重新聚焦或 Query 默认重试重复执行。只读恢复与任务推进区分，保留跨会话确认、迟到批次和响应丢失恢复约束。
5. 原有路由、合法 query、登录返回、历史记录恢复、下载范围及公开预览隔离保持兼容；PC 缩放和窄窗只调整自身布局，不自动跳 H5。`/api/*`、`/m/*` 与 `/console/*` 的重写优先级沿用上线计划。
6. 工程入口按职责拆分检查：React PC 与后台的 `.tsx` 由带 JSX 配置的 `tsc` 检查，冻结 H5 及其 `client/` Vue 依赖仍由 `vue-tsc` 检查，共享 TS 与服务端不能漏检。Biome、ESLint、Prettier 按文件归属划分，根命令汇总适用检查；Vitest 保留现有 Vue 用例发现范围，不因增加 React 配置遗漏旧检查。`web/public/` 的字体、品牌资源仍被 H5 和离线导出引用，迁移时保留根资源路径及构建复制关系。

<a id="delivery"></a>

## 执行步骤与验收

总顺序由 [PLAN.md](../../PLAN.md) 维护；本专题先于新 PC 反馈界面实施，后台 API 与存储可按自身依赖推进。当前全部待实施。PC4 按 PC 与受影响共享能力的上线门槛验收，不等待尚未启用的后台、反馈或统计；新功能按[分批发布规则](release.md#batch-release)另行启用。

| 阶段                 | 工作与主要落点                                                                                                                                               | 完成判据                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| PC0 页面盘点与布局   | 对照 `web/src/pages/`、`layouts/default.vue`、`ReportView.vue`、`ReportModule.vue`，列出删除/合并/移入详情/保留项；按[设计计划](design.md#pc-layout)确定布局 | 首页、概览、报告、书架、笔记均有可审查的前后信息层级；共同范围只展示一次，异常范围与必要状态可见           |
| PC1 React 工程与外壳 | `web/`、`vite.config.ts`、React Router、shadcn/ui 配置、Biome、类型检查、根脚本与样式入口                                                                    | 左侧导航、标题/筛选/搜索区、主题和路由直达可用；PC/H5 产物及后台预留子路径互不覆盖                         |
| PC2 业务与状态迁移   | React 认证/hooks、Query/Zustand、RHF/Zod 表单、连接与报告流程，复用纯 TS 模块                                                                                | 游客到保存连接完整；保留旧范围/回执/取消/重试语义，无重复采集、旧响应覆盖或跨用户缓存                      |
| PC3 页面精简与图表   | PC 页面与组件、ECharts 生命周期、详情/下载、Motion                                                                                                           | 27 图表与 3 画像能力保留，冗余文案和重复信息移除；图表 resize/dispose、全量明细与离线导出可用              |
| PC4 切换与收尾       | 根构建与检查、Netlify 路由、文档、第三方声明                                                                                                                 | 适用既有检查与 PC 浏览器验收有证据；冻结 H5 兼容检查完成；再切换 PC 正式入口，清理仅旧 PC 使用的文件与依赖 |

- [ ] 1280、1440、1920 下侧栏与正文比例清楚；200% 缩放、长中文、键盘与减少动效均可用，页面无意外横向溢出。
- [ ] 默认界面不重复展示同一标题、范围、数量和说明；统计例外、未知/零值、缺失/部分覆盖、错误和关键操作影响仍能辨认，完整明细与笔记原文可读。
- [ ] 示例、游客与账号的接入/保存/恢复/退出、范围切换、筛选、书籍详情、完整 HTML/JSON 下载保持既有语义；接口与资源路径没有被 SPA 回退吞掉。
- [ ] 运行受影响的既有测试、类型检查、lint、构建及必要人工操作；这次新增计划不新增测试授权。后台、反馈等此前已明确授权的测试范围仍按[验证边界](release.md#validation)执行，其余不新增/修改测试，也不以临时断言脚本替代。
- [ ] 实际证据写入质量记录，确认完成后再更新现行设计规范、开发说明与数据契约；不得用旧 Vue 检查通过证明 React 已验收。

依赖：现有会话隔离与报告语义、React 兼容版本、参考布局核对及图表/导出适配。H5 重构、设备自动分流、Next.js/SSR、长期报告存档均不作为此次 PC 迁移的隐含交付。
