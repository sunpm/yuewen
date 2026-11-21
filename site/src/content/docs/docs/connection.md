---
title: 连接微信读书
description: 获取读取授权，把 API Key 配置为实例的 Worker Secret，并确认首次采集。
---

Cloudflare Access 决定谁能打开私有报告。微信读书的 API Key 决定实例读取哪个读者的数据。请用你希望回顾的微信读书账号获取授权。

## 配置读取授权

1. 打开[微信读书官方授权页面](https://weread.qq.com/r/weread-skills)，按提示获取 API Key。
2. 在 Cloudflare 打开对应 Worker 的设置，添加类型为 **Secret** 的变量，名称填 `WEREAD_API_KEY`，值填刚取得的 Key。也可在已绑定该实例的仓库根目录运行以下命令，按提示输入。

```sh
pnpm exec wrangler secret put WEREAD_API_KEY
```

3. 通过 Access 打开实例的「连接设置」，点「重新检查」。显示「已配置」说明 Worker 已收到配置；首次成功采集后即可确认上游授权有效。

仅在本机采集时，把同名变量写入仓库根目录被 Git 忽略的 `.dev.vars`，重启本地 Worker。Key 只交给运行实例的服务端。

## 无法生成报告

- **进不了私有报告**：使用受 Access 保护的自定义域名，重新完成身份验证。部署者可核对团队地址、应用 AUD 和 Allow 策略。
- **连接页提示尚未配置**：检查 Secret 名称、所属 Worker 和部署环境，再点「重新检查」。
- **已配置但上游拒绝读取**：到微信读书确认授权是否有效，必要时更换 Secret，再开始一次新采集。需要撤销旧授权时，在微信读书端操作。

连接就绪后，按[生成和阅读报告](/docs/report/)开始采集。
