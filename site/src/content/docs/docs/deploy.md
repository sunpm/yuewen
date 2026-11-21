---
title: 部署到 Cloudflare
description: 创建自己的阅纹实例，并通过 Cloudflare Access 限制访问范围。
---

阅纹实例由 Worker 提供应用和 API，D1 保存阅读数据。每个实例都应使用独立的 Worker 和 D1。

## 创建实例

1. 打开 [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/sunpm/yuewen)，登录 Cloudflare 并按页面提示连接代码仓库。
2. 为新实例创建 Worker 和 D1，保留数据库绑定名 `DB`。应用构建命令是 `pnpm build`，部署命令是 `pnpm deploy`。
3. 初次可以先留空读取授权和 Access 参数。部署完成后，在实例地址末尾加上 `/demo` 即可打开示例。

## 只允许自己访问

1. 给 Worker 绑定自定义域名。在 Cloudflare Zero Trust 中创建 **Self-hosted** 类型的 Access 应用，覆盖该域名。
2. 创建 **Allow** 策略，只允许自己的邮箱或明确授权的可信人员。每个获准访问的人都能读取、保存和删除这个实例的数据。
3. 在你的部署仓库 `wrangler.jsonc` 的 `vars` 中设置下表两项，并重新部署。将值保存在部署配置里，后续更新也会沿用它们。

| 配置项               | 填写内容                                                             |
| -------------------- | -------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | 团队地址，形如 `https://你的团队.cloudflareaccess.com`，省略结尾斜杠 |
| `ACCESS_AUD`         | 该 Access 应用的 Application Audience（AUD）Tag                      |

打开自定义域名，完成 Access 验证，再[配置微信读书读取授权](/docs/connection/)。也可以在同一浏览器打开 `/api/connections` 确认准入；未通过准入时私有 API 会拒绝访问。

## 更新已有实例

先导出重要报告并备份 D1，再更新部署仓库。保留原 Worker 名、D1 ID 和 Access 参数。在仓库根目录运行 `pnpm install --frozen-lockfile` 和 `pnpm deploy`，后者会先应用待执行的数据库迁移。

命令行首次部署、迁移失败处理和备份恢复边界见[仓库自部署手册](https://github.com/sunpm/yuewen/blob/main/docs/self-host-cloudflare.md)。
