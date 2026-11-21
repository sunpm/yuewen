# 开发说明

当前运行入口为 Cloudflare Workers + D1；具体本地、部署、更新和安全配置统一见 [自部署说明](self-host-cloudflare.md)。旧 PostgreSQL、Better Auth、管理后台、Netlify 和恢复脚本已移除，历史质量记录仅供追溯。

PC：React/Vite，`web/`；H5：Vue/Vant，`web-mobile/`；共用图表、采集契约和导出见 `client/`、`shared/`。`pnpm build` 顺序生成 `dist/` 和 `dist/m/`。构建后执行类型检查可同时得到 Vant 自动生成的声明文件。

`pnpm dev` 启动 Vite PC、H5 和 Wrangler local；首次先运行 `pnpm build`、`pnpm db:local`。若只验证部署产物，运行 `pnpm dev:api` 并打开 8787。开发入口与生产入口有明确安全边界，禁止将本地入口部署到公网。

验证：`pnpm test`、`pnpm test:d1`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm check:worker`。后者只做 dry-run；真正部署命令 `pnpm deploy:init` 和 `pnpm deploy` 需由实例部署者主动执行。

## 官网与公开文档

从完整仓库运行以下命令，使用 Node.js 22.23.4 或以上版本和 pnpm 10。官网依赖与锁文件在 `site/`，既有个人实例的构建仍从仓库根目录运行。

```sh
pnpm --dir site install --frozen-lockfile
pnpm --dir site dev
```

本地默认地址为 `http://localhost:4321/`，指南入口为 `/docs/`。首页从共享示例生成器取数，字体和标志从仓库既有资产构建。用户指南维护在 `site/src/content/docs/docs/`，侧栏顺序由 `site/astro.config.mjs` 管理。

使用 `pnpm --dir site build` 构建，`pnpm --dir site preview` 查看含 Pagefind 全文搜索的静态产物。发布官网时，在构建环境中将 `SITE_URL` 设为最终官网的完整源地址，托管 `site/dist/`，保留目录索引和 `404.html`。官网不需要应用 Worker、D1 或微信读书凭据。
