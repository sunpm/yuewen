# 模板与组件来源

前端构建配置依据 [Vitesse](https://github.com/antfu-collective/vitesse) 提交 `8a01bc9283fedcd63e750af55a75496361789a81` 裁剪，保留文件路由、自动导入及 Vue 目录组织。没有复制模板的示例业务、品牌、多语言或 UnoCSS。

按钮、输入和工具函数参考 [shadcn/vue 的手动集成方式](https://www.shadcn-vue.com/docs/installation/vite)，行为依赖 Reka UI，自行适配阅纹主题。第三方 npm 包的许可随各包提供。

独立移动端采用 [Vant](https://github.com/youzan/vant) 4.10.2，依照其 [ConfigProvider 文档](https://vant-ui.github.io/vant/#/zh-CN/config-provider) 配置品牌颜色与明暗主题；组件按需导入。

以下许可适用于 Vitesse 来源的配置部分：

MIT License

Copyright (c) 2020-PRESENT Anthony Fu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 本轮组件、字体与公开书目

Select、Dialog、Table 从 [shadcn/vue 官方 new-york registry](https://www.shadcn-vue.com/r/styles/new-york/select.json) 取得（2026-10-03），保留组件结构，调整中文关闭文案、主题和可选属性默认值。Dialog 与 Table 分别来自同目录的 `dialog.json` 和 `table.json`。图标沿用组件采用的 Lucide，使用发布者当前维护的 `@lucide/vue` 包。shadcn/vue 为 MIT 许可，Copyright (c) 2023 unovue；上述 MIT 正文同样适用。

字体来源：[LXGW WenKai Lite v1.522](https://github.com/lxgw/LxgwWenKai-Lite/releases/tag/v1.522)。使用官方 Regular、Medium TTF，以 FontTools 4.60.2 进行 WOFF2 格式转换，未裁剪字符或修改字形；实际字重为 400、500。完整版权与 SIL OFL 1.1 许可保留在 [OFL.txt](../web/public/fonts/OFL.txt)。品牌组合 SVG 的文字使用相同字形转路径，PNG 由矢量文件生成。

[微信读书公开首页](https://weread.qq.com/) 的公开书目数据（2026-10-03）用于 `shared/demo-books.json`：只保存书籍 ID、书名、作者及该书对应封面 URL。没有保存用户阅读数据；统计与演示文本来自本项目的独立模拟数据。
