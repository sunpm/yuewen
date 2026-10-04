# 阅纹

**看见你的阅读轨迹。**

面向微信读书的个人阅读可视化工具，将阅读统计、书架、划线和想法整理成可探索的阅读档案。

## 当前状态

桌面端与独立 Vant 移动端已进入开发，提供可运行的首页和完整模拟示例：阅读概览、27 个分析模块、书架搜索与详情、笔记检索、明暗主题，以及离线 HTML / JSON 下载。

Hono API、Better Auth 邮箱验证码和可选密码、PostgreSQL 数据模型与迁移、Key 加密保存、分批采集与过期清理已实现。真实邮箱、数据库会话隔离、Netlify 部署和生产流程仍待联调；当前版本尚未上线。真实微信读书采集器已通过一次有界的本地只读联调。

## 本地开发

需要 Node.js 20.19+（部署建议 Node.js 22）与 pnpm 10。

```sh
pnpm install
test -f .env || cp .env.example .env
pnpm dev
```

访问 `http://127.0.0.1:5173`。桌面端示例为 `/demo`，独立 Vant 移动端为 `/m/`，示例为 `/m/demo`；两端无需数据库即可体验。默认从服务端开发 Key 读取真实数据；使用 `/demo?source=mock` 或 `/m/demo?source=mock` 可浏览模拟示例，公开构建始终使用模拟示例。邮箱服务未配置时，登录页明确提示并停用发送按钮。

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

## 真实账号接入

在服务端环境配置 `.env.example` 中的数据库、应用地址、认证密钥、Resend 发信信息及加密密钥，然后执行 `pnpm db:migrate`。`APP_URL` 必须与浏览器访问来源一致。

`KEY_ENCRYPTION_KEYS` 为 JSON 对象，键为版本号、值为 32 字节随机密钥的 Base64 编码；`KEY_ENCRYPTION_VERSION` 指定当前写入版本。旧版本密钥应在迁移密文前保留。认证密钥和加密密钥应独立生成并保存在服务端配置中。

`WEREAD_API_KEY` 用于本地开发页面和只读探针，不能作为公开服务的全局用户凭证，也不能注入前端。`pnpm probe` 输出字段类型，`pnpm probe:report` 在内存中执行有界采集并输出模块状态；均不保存个人笔记正文。

## 技术与目录

- 前端：从 Vitesse 配置裁剪的 Vue 3、文件路由、自动导入、Vite、TypeScript；shadcn/vue 官方基础组件、Reka UI、Tailwind CSS。
- 移动端：Vant 4，独立路由、底部导航与弹层；不使用桌面响应式布局。
- 图表：ECharts 按需注册，SVG 渲染，提供数据表和离线图表。
- 后端：Hono、Node.js、Better Auth、PostgreSQL、Drizzle。
- `web/` 桌面页面；`web-mobile/` Vant 移动页面；`client/` 两端共用的登录、账号、采集与导出；`shared/` 报告契约与原创示例；`server/` 认证、采集、聚合与数据模型；`netlify/functions/` 函数入口；`tests/` 自动化验证。

[总计划与下一步](PLAN.md) · [Agent 协作入口](AGENTS.md) · [设计规范](docs/design-system.md) · [数据契约](docs/data-contract.md) · [开发与部署说明](docs/development.md) · [模板来源](docs/third-party-notices.md)

计划按主题维护在 `docs/plans/`。查看进度或继续开发时，从根目录 `PLAN.md` 进入对应专题；已完成方案放在 `docs/plans/archive/`，实际验证结果统一记录在质量记录中。

## 品牌

「阅纹」取“阅读留下的纹理”之意。Logo 由三道展开的书页线条组成，采用纸白、橄榄绿、黄铜金与浅沙；深色采用近黑页面与炭灰卡片背景、浅橄榄绿主色、米白正文与柔金点缀。

[品牌预览](brand/brand-preview.png) · [浅色 Logo](brand/logo-light.svg) · [深色 Logo](brand/logo-dark.svg)

## 公开参考

- [微信读书 Skill 官方入口](https://weread.qq.com/r/weread-skills)
- [官方网关与接口说明](https://github.com/Tencent/WeChatReading)
- [阅读报告功能参考](https://github.com/yaojingang/yao-open-skills/tree/main/skills/yao-weread-skill)
- [前端模板：Vitesse](https://github.com/antfu-collective/vitesse)
