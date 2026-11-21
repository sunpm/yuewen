# 开发说明

当前运行入口为 Cloudflare Workers + D1；具体本地、部署、更新和安全配置统一见 [自部署说明](self-host-cloudflare.md)。旧 PostgreSQL、Better Auth、管理后台、Netlify 和恢复脚本已移除，历史质量记录仅供追溯。

PC：React/Vite，`web/`；H5：Vue/Vant，`web-mobile/`；共用图表、采集契约和导出见 `client/`、`shared/`。`pnpm build` 顺序生成 `dist/` 和 `dist/m/`。构建后执行类型检查可同时得到 Vant 自动生成的声明文件。

`pnpm dev` 启动 Vite PC、H5 和 Wrangler local；首次先运行 `pnpm build`、`pnpm db:local`。若只验证部署产物，运行 `pnpm dev:api` 并打开 8787。开发入口与生产入口有明确安全边界，禁止将本地入口部署到公网。

验证：`pnpm test`、`pnpm test:d1`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm check:worker`。后者只做 dry-run；真正部署命令 `pnpm deploy:init` 和 `pnpm deploy` 需由实例部署者主动执行。
