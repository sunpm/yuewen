---
name: 阅纹
description: 看见你的阅读轨迹
colors:
  primary: '#285c49'
  primary-foreground: '#ffffff'
  brass: '#896b38'
  background: '#f8f9f6'
  surface: '#ffffff'
  foreground: '#252d29'
  muted: '#eaf0eb'
  muted-foreground: '#606d65'
  border: '#dce2dc'
  destructive: '#a53228'
  chart-blue: '#4a6d82'
  chart-plum: '#776477'
  dark-primary: '#99c9af'
  dark-primary-foreground: '#141a17'
  dark-brass: '#ccb480'
  dark-background: '#141a17'
  dark-surface: '#1c2420'
  dark-foreground: '#e7ece8'
  dark-muted: '#27372d'
  dark-muted-foreground: '#abb9af'
  dark-border: '#35443b'
  dark-destructive: '#f39a8e'
  dark-chart-blue: '#9fbfd3'
  dark-chart-plum: '#c4aec4'
typography:
  display:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: '-0.02em'
  page-title:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '20px'
    fontWeight: 500
  section-title:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '18px'
    fontWeight: 500
  settings-title:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '23px'
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: '1.25rem'
  caption:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.8
  note:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontSize: '19px'
    fontWeight: 400
    lineHeight: 2
  metric:
    fontFamily: "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
    fontWeight: 400
    fontFeature: "'tnum'"
rounded:
  control: '0.375rem'
  panel: '8px'
  connection: '12px'
spacing:
  '8': '8px'
  '12': '12px'
  '16': '16px'
  '20': '20px'
  '24': '24px'
  '28': '28px'
  '32': '32px'
  '48': '48px'
  '64': '64px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '0.5rem 1rem'
  input-key:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.panel}'
    padding: '10px 14px'
  navigation-item:
    backgroundColor: 'transparent'
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.control}'
    padding: '10px 12px'
  navigation-item-active:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.primary}'
    rounded: '{rounded.control}'
    padding: '10px 12px'
  data-panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.panel}'
    padding: '24px'
  connection-panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.connection}'
    padding: '32px'
---

# Design System: 阅纹

## Overview

**Creative North Star: "阅读留下的纹理"**

阅纹以纸白、墨色正文与墨绿强调承托阅读记录；深色界面用墨黑绿表面与浅墨绿强调延续同一身份。霞鹜文楷轻便版和「层页」标志保留阅读的质感，界面本身保持安静、清楚，让书籍、图表和笔记承担内容。

密度随任务变化：报告用稳定的分组和细分隔线方便比较，笔记保留段落与来源，设置页突出当前任务，将维护操作后置。控件精细克制，通过布局、字号与状态区分主次，减少无信息量的辅助说明。

**Key Characteristics:**

- 纸白墨绿，正文与强调色分离。
- 同一阅读字体贯穿界面、图表与报告。
- 细线与表面分层，控件克制，内容优先。
- 数据范围、来源和交互状态清楚可辨。

本文件是当前 React PC 的设计系统主入口，依据 2026-11-12 工作区代码提取，包含尚未提交的设置页布局。基础 token 的记录值在 frontmatter，实际实现来源见下表；修改设计时同步源头后刷新本文和 [.impeccable/design.json](.impeccable/design.json)。不把工具中的预览色阶视为新增产品 token。

| 内容                      | 实现来源                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------- |
| PC 语义色、布局和业务样式 | [styles.css](web/src/styles.css)                                                       |
| PC 字体与加载策略         | [fonts.css](web/src/fonts.css)                                                         |
| 图表与离线报告色板        | [theme.ts](client/theme.ts)、[charts.ts](client/charts.ts)                             |
| 基础控件                  | [Button](web/src/components/ui/button.tsx)、[Select](web/src/components/ui/select.tsx) |
| 最近选定的连接设置布局    | [account.tsx](web/src/pages/account.tsx)                                               |
| Logo 与字标               | [symbol.svg](brand/symbol.svg)、[wordmark.svg](brand/wordmark.svg)                     |

H5、跨端内容细则、历史约定与未完成的验收仍见[跨端设计细则](docs/design-system.md)。后台沿用其独立 antd 体系，本文不将 PC 数值套用到 H5 或后台。产品事实见 [PRODUCT.md](PRODUCT.md)，实现不等同于已完成所有状态验收。

## Colors

色彩名称沿用已确认的纸白、墨绿、墨色与暖金。frontmatter 无前缀项是浅色基线，`dark-` 项是对应深色值；产品通过同名 CSS 语义变量切换主题，而非在组件中手写两组颜色。

### Primary

- **墨绿 / 浅墨绿**（`primary` / `dark-primary`）：主要操作、导航选中、焦点及主数据系列。
- **按钮前景**（`primary-foreground` / `dark-primary-foreground`）：与主色配对；不能用正文色替代。

### Secondary

- **暖金**（`brass` / `dark-brass`）：引文下划线、少量内容点缀与图表系列。
- **灰蓝、灰紫**（`chart-blue`、`chart-plum` 及其深色项）：PC 多系列图表。不是额外的 UI 操作主色。

### Neutral

- `background` 是页面底色，`surface` 是卡片与侧栏表面，`muted` 是轻填充。
- `foreground` 承载正文，`muted-foreground` 承载次级说明，`border` 承载分隔和控件边界。

`destructive` 已在两种主题声明，用于独立的破坏性语义；不将暖金自动定义为警告色，不假定已存在完整状态色体系。

**The 正文与强调分离 Rule.** 正文使用 `foreground`，主色留给操作与数据强调；不要把整段正文染成品牌绿。

Tailwind 的 `accent` 对应 `muted` 交互填充，品牌暖金使用 `brass`。PC 图表和离线报告显式选择 `pine`，H5 保留 `olive`。热力图等级、图表系列顺序和 tooltip 配色只在[共享色板](client/theme.ts)维护。

## Typography

统一使用 frontmatter 中的阅读字体栈。当前提供 400 与 500 字重，`font-display: swap`，禁止字体合成；PC 优先加载界面字集，完整字库作为补充。图表与离线报告保留相同字体身份。

| 角色             | 使用与当前例外                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `display`        | 首页标题使用 `clamp(36px, 4.5vw, 64px)`。流体字号在正文记录，不把上限误写为所有屏幕的固定字号。 |
| `page-title`     | 页面顶部标题。                                                                                  |
| `section-title`  | 数据面板与分区标题。                                                                            |
| `settings-title` | 连接设置主卡片标题；维护区继续使用分区层级。                                                    |
| `body`           | 正文与原生输入的默认基线；具体内容允许更宽松的行距。                                            |
| `label`          | 基础 Button 的文字层级。                                                                        |
| `caption`        | 常规辅助信息；部分元数据使用 12 px，设置页说明使用 13–14 px。                                   |
| `note`           | 笔记正文保留原段落，行距适合长时间阅读。                                                        |
| `metric`         | 指标使用 `clamp(22px, 2.2vw, 32px)` 与等宽数字，不依靠粗重字重建立层级。                        |

**The 真实字重 Rule.** 使用已提供的字重，以字号、留白和颜色区分层级，不依靠不存在的 600/700 字重。

长书名、错误与笔记允许换行。书架标题可在列表中截断，详情保留全文；笔记正文不能为等高布局而截断。表格与指标保留适当单位和等宽数字。

## Layout

PC 使用固定宽度的侧栏与可收缩的主内容区。侧栏宽 208 px，内部上下左右留白来自现有样式；主内容含内边距的最大宽度为 1352 px，常规 padding 为 `24px 48px 64px`。页头最小高度 88 px，使用底部分隔线。

| 区域     | 当前结构                                                                      |
| -------- | ----------------------------------------------------------------------------- |
| 概览     | 指标常规四列，图表与画像按 1.5:1 排列，间距 24 px。                           |
| 分析模块 | 两列网格；日历和周期表等宽模块跨整行。                                        |
| 书架     | 常规四列，间距 28 px；列表模式是单列条目，每条采用小封面与文字两列。          |
| 笔记     | 最大宽度 850 px 的纵向阅读列表。                                              |
| 连接设置 | 最大宽度 760 px、分区间距 28 px；一个主表单卡片，账号入口和无外框维护区在后。 |
| 登录     | 单独的 620 px 上限；不继承设置页专用布局。                                    |

frontmatter 的 spacing 是实际复用间距的记录，不是要求把每个现有尺寸机械归入统一刻度。相关控件靠近，任务区域之间留出更大的间隔；不要以额外卡片和重复文案替代分组。

| 断点     | 已实现变化                                                                              |
| -------- | --------------------------------------------------------------------------------------- |
| ≤1100 px | 指标两列、概览单列、书架三列。                                                          |
| ≤900 px  | 侧栏收为 76 px 图标导航，页面水平留白减为 24 px；设置页动作组可纵向排列。               |
| ≤760 px  | 分析模块单列、书架两列，常规面板 padding 为 20 px。设置主卡片因后置专用规则仍为 32 px。 |
| ≤540 px  | 页头最小高度 72 px，页面水平留白减为 16 px。                                            |
| ≤420 px  | 书架与指标单列。                                                                        |
| ≥1600 px | 页头内容按主区域上限向内对齐。                                                          |

这些规则支持 PC 页面缩放与窄窗口，不替代独立 `/m/` 入口，也不表示所有尺寸已经验收。

## Elevation & Depth

主要依靠纸白背景、白色表面、轻填充与 1 px 分隔线建立层次。数据卡片本身没有常驻投影；设置页主卡片用明确的容器突出任务，维护区域直接落在页面背景。

浮层是例外：Radix Select 使用 Tailwind `shadow-md`，原生反馈 dialog 使用半透明黑色 backdrop。精确阴影与动效值保存在 sidecar 的 extensions，并追溯到组件、当前 Tailwind theme 与图表实现。

**The 内容表面 Rule.** 数据区域通过表面和细线分层；不要把浮层的阴影扩散到所有卡片。

## Shapes

圆角按控件用途区分：基础按钮和导航沿用 `control`，数据面板与输入采用 `panel`，连接主卡片采用 `connection`。这些是已有实现，不是将所有控件统一改成一种圆角的提案。

书封是独立造型：宽高比 3:4，采用 `2px 6px 6px 2px` 圆角和 4 px 中性色书脊。它是内容的书本形态，不推广为通用卡片装饰。层页 Logo 内置方形圆角背景，保持原比例与笔画，页面不额外包背景、描边或投影；品牌生成规则仍见[品牌规范](docs/design-system.md#2-品牌与标志)。

## Components

| 组件         | 当前做法                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Button       | `default`、`outline`、`ghost` 三种变体；最小高度 44 px。主按钮以主色填充，次按钮描边，轻操作透明。禁用时不接收指针并降低透明度。 |
| API Key 输入 | 设置页原生 input，最小高度 48 px；显示按钮沿用 Button ghost。标签与获取 Key 链接同排，错误贴近字段，提交与替换说明同组。         |
| Select       | Radix 负责行为，触发器最小高度 44 px；选项和浮层消费同一套语义色。                                                               |
| 导航         | 文字与 18 px Lucide 图标并排；最小高度 44 px。悬停和选中使用轻填充与主色，选中增加字重。                                         |
| 数据面板     | 细边框、表面色、标题与正文分层；只在有独立内容单元时使用。                                                                       |
| 原生 details | 下载、范围、统计明细及维护确认按需展开；摘要保留可操作名称，不把重要失败原因藏进去。                                             |
| 笔记         | 顶部分隔线、来源元数据与完整正文；划线原文采用暖金细下划线，个人想法保持正文样式。                                               |
| 反馈 dialog  | 原生 dialog 承载截图与文字反馈，宽度上限 640 px，随视口保留边距；不改变已规定的焦点与关闭行为。                                  |

全局可见焦点为 2 px 主色轮廓、4 px 外偏；设置页输入外偏 3 px，搜索容器外偏 2 px。核对实际控件时同时观察默认、聚焦、失焦和相邻控件，不能把外扩的轮廓当成布局偏移。

导航与基础按钮使用约 150 ms 颜色反馈；图表入场时长为 250 ms。已有减少动态效果设置继续生效，不为记录设计而新增动画。

[.impeccable/design.json](.impeccable/design.json) 提供按钮、输入、导航、面板和笔记的独立 HTML/CSS 预览片段，使用真实语义变量继承主题；预览中使用占位内容，不表示真实阅读数据。该文件由 document 流程生成，修改源实现和本文件后重新生成，不逐项手改派生色阶或片段。

## Do's and Don'ts

### Do

- 沿用已确认的纸白墨绿、阅读字体和层页标志。
- 使用现有语义变量及组件接口，让明暗主题、图表和导出保持一致。
- 保留表单标签、数据范围、来源和必要的错误恢复入口。
- 根据任务分组，以字号、留白和状态建立主次。
- 按现有证据记录状态，把实现、设计要求与验收结果分开。

### Don't

- 不把 H5、旧 Vue PC 或后台尺寸当作当前 React PC 的规范。
- 不添加重复解释布局的辅助文案或把数据缺失包装成真实零值。
- 不用新色值、未提供字重或额外阴影绕开现有设计体系。
- 不为文档统一而批量修改页面、图表或生成的品牌副本。
- 不把本次源码提取写成全尺寸、全状态或无障碍验收通过。
