# 阅纹

**看见你的阅读轨迹。** 微信读书个人阅读可视化工具，支持阅读概览、27 个分析模块、书架、划线与想法、主题切换和离线 HTML / JSON 下载。

本版本面向单实例自部署：Cloudflare Workers 提供 API 和 PC/H5 静态资源，D1 保存当前报告和历史快照。没有阅纹账号、邮箱登录、用户资料或管理后台。微信读书 API Key 仅是上游读取授权，配置在 Worker Secret 中。

私有 API 默认拒绝访问。部署者需配置 Cloudflare Access 并限制准入；所有通过准入的人共享同一实例的数据与操作权限。公开示例只使用原创模拟数据。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sunpm/yuewen)

按钮需要目标仓库已包含本版本代码；本地未推送的修改不会出现在按钮部署中。完整步骤、Access 设置、首次部署与更新见 [Cloudflare 自部署说明](docs/self-host-cloudflare.md)。

## 本地体验

需要 Node.js 22+、pnpm 10+。

```sh
pnpm install
pnpm build
pnpm db:local
pnpm dev:api
```

打开 `http://127.0.0.1:8787`；PC 示例 `/demo`，H5 示例 `/m/demo`。无需 Key 即可看示例。真实采集需将自己的微信读书 Key 放入被 Git 忽略的 `.dev.vars`，参见 `.dev.vars.example`。本地开发入口只用于可信机器的回环地址，禁止反向代理到公网。

```sh
pnpm test
pnpm test:d1
pnpm test:http # 需要先构建静态资源
pnpm typecheck
pnpm lint
pnpm build
pnpm check:worker # 只打包，不部署
```

`test:d1` 使用临时本地 D1 和合成上游响应，不读取真实数据、不连接远端数据库。实际结果与限制见 [质量记录](docs/quality-log.md#self-host-2026-11-21)。

## 功能与边界

- PC/H5 保留阅读概览、分析、书架、笔记和下载。当前报告两小时后不可读取，每小时清理过期存储。
- PC 支持保存历史快照、选择是否保存笔记正文、查看和删除；最多 20 份，每份 2 MiB。H5 可跳转历史入口。
- 保留有界分页与 PC 分段续采；每次 Worker 请求只执行一个上游操作。并发写入使用 D1 版本校验，迟到响应不能覆盖新报告。
- 移除 Better Auth、账号/游客身份表、用户管理后台、PostgreSQL、R2 反馈后端、旧恢复/备份任务和 Netlify 部署链路。GitHub 反馈与本地截图下载仍可用。
- 不自动迁移旧库、旧用户、Key 或阅读数据。旧系统不受本地代码改造影响；历史记录不代表新版本已部署。

## 目录

`web/`：React PC；`web-mobile/`：Vue/Vant H5；`client/`、`shared/`：报告、图表与导出；`server/`：Worker、访问保护、采集与 D1 存储；`migrations/`：新实例迁移；`scripts/smoke-d1.ts`：隔离集成验证。

[任务计划](task_plan.md) · [需求与决策](findings.md) · [进度](progress.md) · [开发说明](docs/development.md) · [数据契约](docs/data-contract.md) · [PC 设计系统](DESIGN.md) · [第三方说明](docs/third-party-notices.md)

## 公开参考

- [微信读书官方授权入口](https://weread.qq.com/r/weread-skills)
- [微信读书官方接口](https://github.com/Tencent/WeChatReading)
- [Calends Cloudflare 自部署体验](https://docs.calends.date/self-host/cloudflare/)
- [Cloudflare Deploy 按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
