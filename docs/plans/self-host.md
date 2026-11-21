# 单实例 Cloudflare 自部署

日期：2026-11-21。状态：complete。

目标：Workers 静态 PC/H5 + D1 新实例部署；删除应用账号、用户信息和管理基础设施，保留阅读采集、报告、下载和历史功能。禁止远端部署、触碰真实数据库或导入旧数据。

步骤与完成判据：

1. 移除 Better Auth、用户/游客身份链路和旧 PostgreSQL/Netlify 运维入口。
2. 实现 D1 单实例存储、受保护 API、PC/H5 无账号连接与报告流程。
3. 提供 Deploy to Cloudflare、Wrangler 新库迁移、本地与更新说明。
4. 运行单元、类型、构建与本地 Wrangler/D1 冒烟；记录实际结果和边界。

安全默认：未配置 Cloudflare Access 时私有 API 拒绝；验证 Access JWT 签名、issuer、audience、有效期。Access 身份仅用于边缘准入，不建立应用用户资料。写操作要求同源 Origin。回环开发绕过须显式启用，不能在公网生效。仅使用合成数据测试。

## 验收与剩余项

本地实现完成；27/27 单元、类型、lint、双端构建、D1 合成闭环、双入口 HTTP、Worker dry-run 已通过，见[质量记录](../quality-log.md#self-host-2026-11-21)。Chrome 因云沙箱禁止 Unix socket 无法启动，交互/视觉待验；真实部署、Access 域名、上游与远端恢复未执行。工作副本 main 未提交未推送，未改旧系统数据。
