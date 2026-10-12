# 模板与组件来源

C4（2026-10-12）接入可选的 [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/) 托管 beacon，按官方 [SPA 配置](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)设置 `spa: false`，只在受限生产公开文档手动加载。未复制、打包或修改第三方脚本，未新增 npm 依赖；站点 token 与生产开通留到 C5。该手动脚本没有可固定的版本/SRI，维护约束见 [Cloudflare FAQ](https://developers.cloudflare.com/web-analytics/faq/)。

C2 界面（2026-10-12）新增 [html-to-image](https://github.com/bubkoo/html-to-image) 1.11.13（MIT），按官方 `toCanvas`、`getFontEmbedCSS` 和尺寸/字体选项接入 PC 当前网页截图；仅使用依赖 API，未复制示例工程。截图只在本地预览，用户提交后才发送本站接口。

C2 后端（2026-10-10）新增 [AWS SDK for JavaScript S3 Client](https://github.com/aws/aws-sdk-js-v3) 3.1149.0 与 [sharp](https://github.com/lovell/sharp) 0.35.5，均为 Apache-2.0。R2 客户端依据 [Cloudflare S3 v3 示例](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)配置，图片限制依据 [sharp constructor 文档](https://sharp.pixelplumbing.com/api-constructor/)设置；使用依赖 API，未复制完整示例工程。原生 libvips 与平台依赖的许可证随各 npm 包分发。

后台 C0–C1（2026-10-09）采用 [Ant Design](https://github.com/ant-design/ant-design) 6.6.5 和 [@ant-design/cssinjs](https://github.com/ant-design/cssinjs) 2.1.2，均为 MIT；React 组件行为检查使用 [Testing Library](https://github.com/testing-library/react-testing-library) 16.3.3 与 DOM 10.4.1（MIT）。未复制完整后台模板，暂未引入 ProComponents。认证沿用 Better Auth 1.7.7 的 [Username 插件](https://better-auth.com/docs/plugins/username)，支持项目已有账号的连字符；Tailwind 与 antd 层序按[官方 CSS 兼容说明](https://ant.design/docs/react/compatible-style/)配置。

React 外壳的 Button、Select 根据 [shadcn/ui 官方 new-york-v4 registry](https://ui.shadcn.com/r/styles/new-york-v4/button.json) 和同目录的 `select.json` 适配（2026-10-08），只保留当前使用的变体与组件，采用 Radix 独立包与阅纹主题；MIT 许可原文保留在 [React 组件 LICENSE](../web/src/components/ui/LICENSE)。

PC 布局核对了 [AIHOT](https://github.com/KKKKhazix/AIHOT) 提交 `c547b669acc7f64720cd82024e502446ee1ef88d` 的 `apps/web/app/components/shell/Sidebar.tsx`、`Chrome.tsx` 与 `NOTICE`：仅参考左侧导航、底部主题与右侧内容的布局关系，未复制源码或品牌资产，使用阅纹现有名称、Logo、字体与配色。

前端构建配置依据 [Vitesse](https://github.com/antfu-collective/vitesse) 提交 `8a01bc9283fedcd63e750af55a75496361789a81` 裁剪，历史 PC 保留文件路由、自动导入及 Vue 目录组织；PC4 后仅 H5 继续使用相关 Vue 构建工具。没有复制模板的示例业务、品牌、多语言或 UnoCSS。

按钮、输入和工具函数参考 [shadcn/vue 的手动集成方式](https://www.shadcn-vue.com/docs/installation/vite)，历史版本行为依赖 Reka UI；PC4 已删除旧 PC 的相关组件与依赖，仅保留既有检查使用的 Input 组件。第三方 npm 包的许可随各包提供。

独立移动端采用 [Vant](https://github.com/youzan/vant) 4.10.2，依照其 [ConfigProvider 文档](https://vant-ui.github.io/vant/#/zh-CN/config-provider) 配置品牌颜色与明暗主题；组件按需导入。

以下许可适用于 Vitesse 来源的配置部分：

MIT License

Copyright (c) 2020-PRESENT Anthony Fu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 本轮组件、字体与公开书目

Select、Dialog、Table 从 [shadcn/vue 官方 new-york registry](https://www.shadcn-vue.com/r/styles/new-york/select.json) 取得（2026-10-03），保留组件结构，调整中文关闭文案、主题和可选属性默认值。Dialog 与 Table 分别来自同目录的 `dialog.json` 和 `table.json`。图标沿用组件采用的 Lucide，使用发布者当前维护的 `@lucide/vue` 包。shadcn/vue 为 MIT 许可，Copyright (c) 2023 unovue；上述 MIT 正文同样适用。

字体来源：[LXGW WenKai Lite v1.522](https://github.com/lxgw/LxgwWenKai-Lite/releases/tag/v1.522)。使用官方 Regular、Medium TTF，以 FontTools 4.60.2 进行 WOFF2 格式转换，原文件未裁剪字符或修改字形；实际字重为 400、500。PC4 使用同版 FontTools 从原 WOFF2 生成界面字集子集供 PC 按需加载，不修改字形，原完整字体继续用于其他字符和导出。完整版权与 SIL OFL 1.1 许可保留在 [OFL.txt](../web/public/fonts/OFL.txt)。品牌组合 SVG 的文字使用相同字形转路径，PNG 由矢量文件生成。

[微信读书公开首页](https://weread.qq.com/) 的公开书目数据（2026-10-03）用于 `shared/demo-books.json`：只保存书籍 ID、书名、作者及该书对应封面 URL。没有保存用户阅读数据；统计与演示文本来自本项目的独立模拟数据。
