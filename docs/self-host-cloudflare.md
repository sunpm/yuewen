# Cloudflare 单实例自部署

日期：2026-11-21。适用于当前无应用账号版本，不适用于旧 PostgreSQL/Netlify 系统。

## 安全与数据边界

一个实例只服务一个可信使用范围。Cloudflare Access 是部署边缘准入，不是阅纹账号：应用不保存邮箱、昵称、头像、用户 ID、密码或 Access 会话。所有准入者能读取、创建、保存、删除同一份实例数据；不要配置 Everyone/Bypass 策略或将实例作为多租户服务。

生产 `server/worker.ts` 不存在本地绕过。私有 `/api/*`（除 `/api/health`、`/api/demo`）验证 Access JWT 的 RS256 签名、固定团队 issuer、应用 audience、期限与必要声明；不信任客户端提供的邮箱头或 Host。验证失败时不读取 D1，不使用上游 Secret。写请求要求同源 Origin。私有响应 `Cache-Control: no-store`，Worker 不记录正文或凭据。

公开前端和模拟示例可公开；建议 Access 覆盖整个自定义域名，使边缘身份过期后重新打开页面即可恢复准入。浏览器已经下载的报告不能被远程撤回。Access 配置错误时应用会失败关闭。Workers 默认地址或预览地址也会经过 JWT 校验，不能用来绕过私有 API。

## 按钮部署新实例

1. 确认来源仓库已经包含本次代码，再点击 README 的 Deploy to Cloudflare。平台复制仓库到你的账户。
2. 选择新的 Worker 和新的 D1 名称，不复用旧系统资源。平台按 `wrangler.jsonc` 自动提供 D1 绑定；接受构建命令 `pnpm build` 和部署命令 `pnpm deploy`（含迁移）。自动迁移按绑定名 `DB` 执行。
3. 首次可保持 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` 和 `WEREAD_API_KEY` 为空。此时只有示例/健康检查可用，私有 API 拒绝。
4. 在 Cloudflare Zero Trust 创建 Self-hosted Access 应用，覆盖此实例自定义域名；Allow 策略只允许自己或明确的可信人员。复制应用 AUD Tag 与团队地址。
5. 将 `ACCESS_TEAM_DOMAIN` 设置为 `https://你的团队.cloudflareaccess.com`（无结尾斜杠），`ACCESS_AUD` 设置为该应用 AUD；在仓库 Wrangler 配置中维护，避免下次部署覆盖控制台值。它们不是上游 Key。
6. 通过 Worker Settings 的 Secret，或 `pnpm exec wrangler secret put WEREAD_API_KEY` 添加微信读书读取授权。不要写入 `vars`、Vite 环境变量、Git、Issue 或截图。
7. 通过 Access 打开域名，在连接设置确认授权已配置，再进入阅读概览采集；状态“已配置”并不代表 Key 已向上游验证，实际错误由采集反馈。

平台按钮创建资源/真正部署与真实 Access 域名联调未在本次工作中执行。按钮部署依赖平台先自动提供资源，流程依据 [Cloudflare 官方按钮说明](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。

## Wrangler 命令行首次部署

以下命令会操作你选择的 Cloudflare 账户；本次实现未执行它们。先核对当前账户及新资源名称。

```sh
pnpm install
pnpm exec wrangler login
pnpm deploy:init
```

`deploy:init` 先构建，运行 `wrangler deploy` 自动创建/绑定缺失 D1，再立即对 `DB` 应用迁移。首次初始化完成前私有 API 因 Access 未配置而拒绝；不要预先开放准入。保留 Wrangler 写回的数据库 ID，后续更新不得删除它。随后按上面的 Access 与 Secret 步骤配置并 `pnpm deploy`。

首次初始化的网络失败可能已创建资源：先检查 Wrangler 配置与该实例 D1，不要反复创建新库。若代码已部署而迁移未完成，可运行 `pnpm deploy:prepare` 补迁移；不要用清库重试。

## 本地开发与验证

```sh
pnpm install
pnpm build
pnpm db:local
pnpm dev:api
```

访问 `http://127.0.0.1:8787`。PC 路由回退到 PC SPA；`/m` 与 `/m/*` 文档路由回退到 H5 SPA；`/api` 始终交 Worker，未知 API 返回 JSON 404。

本地入口 `server/local.ts` 只在 `wrangler.local.jsonc` 中引用，显式标记回环请求。生产入口不生成这个内部标记，因此即使误设 `LOCAL_DEV=true` 也不会放行。只监听 `127.0.0.1`；不要给本地服务加公网隧道或反向代理。`.wrangler/` 保存本地 D1，不进入 Git。

如需热更新，构建并初始化后运行 `pnpm dev`，Vite PC 位于 `127.0.0.1:5173`，代理 H5 和 API。本地仅额外允许该明确的 Vite Origin；没有通配 CORS。

示例完全不调用上游。测试真实采集时自行创建 `.dev.vars`，仅填 `WEREAD_API_KEY`；不得复用旧系统数据进行自动导入。本次所有验证都使用空库或合成响应。

```sh
pnpm test       # 数据、上游边界、JWT 签名与导出
pnpm test:d1    # 临时 D1；remoteBindings=false，合成网关响应，结束即销毁
pnpm test:http  # 构建后运行；真实本地 Worker HTTP 与 PC/H5 路由检查
pnpm typecheck
pnpm lint
pnpm build
pnpm check:worker # wrangler deploy --dry-run；不发布
```

## 更新、备份与恢复

更新前自行导出重要报告并备份 D1（Cloudflare 控制台导出或 D1 export）；备份包含私人阅读数据，必须私有保存。旧 PostgreSQL/S3 自动备份和撤销日志已移除，不能再运行旧手册命令。D1 Time Travel 的账户可用窗口应在控制台确认，本次未验证远端恢复。

1. 拉取你自己的部署仓库更新，保留 Worker 名、D1 ID 和 Access 参数；备份 `.dev.vars`/Secret 的管理记录，绝不提交值。
2. `pnpm install --frozen-lockfile`，运行测试、类型和构建。
3. `pnpm deploy`：先构建，再按绑定名应用待执行 D1 迁移，成功后才部署代码。迁移只面向新实例，失败会停止部署。已有迁移不重写，未来结构变更用新编号。
4. 核验健康、匿名私有 API 403、准入后的报告恢复和存档。代码回滚不能自动撤销 D1 结构；跨不兼容迁移时从私有备份恢复至新的隔离数据库再验证。

Key 更换通过 Secret 管理，撤销在微信读书上游完成。当前采集记录保存不可逆的授权指纹以防换 Key 后混合续采；Key 本身不进入 D1。旧快照仍属于当前实例，若你将实例转交他人，应自行先导出并清除数据，或创建全新实例。

## 功能取舍

保留 PC/H5 核心报告、书架、笔记、主题、HTML/JSON 下载；PC 保存历史、正文选择、删除、分段续采。当前报告最长两小时，API 到期即拒读；小时 Cron 删除过期当前报告，物理清理最多另延后一小时（平台延迟除外）。历史快照最多 20 份、每份 2 MiB，保留至主动删除。D1 JSON 按 Unicode 安全分块；写入通过版本与内部 token 双重比较和原子 batch，防止清除/替换后的迟到写回。

移除应用邮箱/密码、用户资料、游客转账号、后台用户/会话管理、服务端反馈及截图 R2、旧备份恢复自动化和 Netlify 入口。GitHub Issue 反馈和本地截图仍保留。书籍详情使用已采集报告字段，不再临时发起额外上游详情请求；H5 历史管理跳转 PC 页面，未新增 H5 原生存档页面。新实例不导入或删除旧库数据。
