# 阅读报告数据契约

契约版本 1；网关规范版本 1.0.4；核对日期 2026-10-04。

本文记录已实现的字段与接口，不将代码实现等同于完整联调通过。已实施的书架、笔记、作者字段拆分与图表调整见[报告体验计划](plans/report-experience.md)，游客权限与保存转换见[游客计划](plans/guest-access.md)。进度从[总计划](../task_plan.md)查看。

## 真实接口证据

本地只读验证了书架、自然年与本月统计、笔记概览和下一页、非空划线、个人想法、书籍进度。另运行一次完整的本月采集与聚合：42 次请求，约 6 秒，失败为 0，临时采集状态约 150 KB。仅代表一个账号、当前网络和当前数据量，不作为生产容量或服务时延承诺。探针不落盘真实正文，不输出书名、身份、Key 或完整回包。

实际回包为顶层业务对象。书架含 `books`、`albums`、`mp`、`archive`；笔记分页使用 `lastSort`，想法分页使用 `synckey`。年度统计未返回 `dailyReadTimes`、`preferTime` 或阅读/听书拆分，本月 `readTimes` 可以取得日桶。分类回包有 `readingTime`，但没有 `val`。这些字段均按可选处理。

2026-10-04 探针补充 `weekly` 与 `overall(baseTime: 0)`。本账号全历史返回 `readLongest` 10 条、`preferCategory` 8 条、`preferAuthor` 10 条、`preferPublisher` 10 条及 `preferTime` 24 项；本月返回排行及分类，本周返回排行但未返回分类、作者与出版社。仅输出字段类型和数组长度，不输出书名、正文或身份。该样本不保证其他账号拥有相同字段。

2026-10-04 另执行 `pnpm probe --shelf`：书架及各一本普通、无分类书籍的详情与进度共 5 次只读请求成功。书架和普通详情分类为“一级-二级”字符串；无分类条目的详情、进度成功，详情没有分类和简介。按本账号已核实的 `-` 分隔处理层级，其他格式不猜测；证据入口为[官方书架字段](https://github.com/Tencent/WeChatReading/blob/main/skills/shelf.md)、[书籍详情字段](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md)及本地探针。未观察到导入书籍不支持详情的业务错误，现有鉴权、限流和网络错误处理保持生效。

## 口径

| 数据       | 使用规则                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 总时长     | 秒；使用不重叠自然周期的 `totalReadTime`，不用日明细之和替代官方总量                                                                      |
| 最近 24 月 | 从最早月份 1 日到上海时区当天；本月是不完整月                                                                                             |
| 采集策略   | 周、月、全部历史复用对应 `period` 回包的偏好，不额外请求年报；自然年与最近 24 月仍按月取得日明细，另请求一次所选年或结束年份的年度偏好    |
| 阅读日     | 官方 `readDays`，每日满 60 秒；自然日均和阅读日均分母分别展示                                                                             |
| 书架       | 电子书数组 + 有声数组 + 非空文章收藏入口；未知私密状态单列                                                                                |
| 进度       | 0–100，1 就是 1%；不将专辑完结标记作为用户读完                                                                                            |
| 累计笔记   | 划线 + 想法/点评 + 书签；不重复增加点评                                                                                                   |
| 正文       | 只含个人划线及个人想法；书签无正文；不采集书籍全文                                                                                        |
| 偏好       | 周、月、自然年与全部历史使用各自周期；仅最近 24 月用结束年份的年度补充并直接标明截至日，不参与 24 月总量；不合并 Top 榜，分类权重不是占比 |
| 热力图     | 按自然年分行、按周排列的逐日日历；保留日记录原始分钟数，不推造缺失日                                                                      |
| 词频       | 中文分词，去除单字及常见停用词，展示前 40 词；用于回顾，不代表心理或人格结论                                                              |
| 未知/零    | 上游缺失字段为不可用，实际零保留为零；尚在采集与失败另行标注                                                                              |

本周/本月报告的“月度”模块展示当前请求的周期片段，并保留准确起止日。全部历史使用官方汇总与年桶，月度和日历模块显示未逐月采集的原因。

全年阅读日历按自然年分行、按周排列，每格对应一天，包含闰年的 2 月 29 日。仅按当前报告已取得的逐日阅读分钟数高亮；未阅读、范围外、未来及未取得日明细的日期保留浅色底格。补齐底格只用于展示，不补造数据表与导出 JSON 中的阅读记录。

## 前端契约

`shared/report.ts` 定义 `ReadingReport` 与 27 个模块目录。每个模块都有 `id`、`title`、`section`、`scope`、`unit`、`status`、`description`、`coverage` 和 `data`。状态为 `ready / empty / unavailable / partial`。

`summary` 区分未知值与零；`books` 仅保留显示所需字段；`notes` 保留稳定 ID、书名、作者、日期、章节、正文、类型和可选对应原文。画像包含有指标依据的文字、来自真实划线的顶部选句、最多 20 条精选。模拟示例始终标记 `sampleReport: true`。

电子书的 `Book.category` 是一级分类，`rawCategory` 保留已返回的原始分类；空白、缺失或“未分类”按已确认业务规则统一为“导入书籍”，并设 `imported: true`。有声内容、文章收藏保留独立类别。缺作者、出版社或简介不会额外触发导入分类。书架筛选、模块 17 和 JSON 复用同一归一结果；HTML 的书架分类统计同口径。正式和开发详情接口统一分类；两端合并详情时忽略空字符串及缺失值，并保持书架的分类、原始分类和导入标识。

报告响应先返回最多 200 条正文，前端在采集结束后通过 `/notes?cursor=` 补齐余下分页。分页未齐时不允许导出，避免误称完整。浏览器只使用内存保存阅读正文；localStorage 仅保存主题。旧 Vue 入口的浏览器历史条目保留页面筛选、章节与笔记展开数量，不存入报告内容或凭证。React PC 的搜索、分类、章节、展开数量与滚动位置仅保存在内存中，按来源和任务隔离，最多保留 24 个访问条目；前进/后退可恢复，刷新不恢复私有筛选。

页面 URL 的 `range=recent/weekly/monthly/overall/年份` 是显式来源；年份为 `2015` 至上海时区当年。缺失、重复或非法页面参数以 `replace` 归一为 `recent`；API 非法值仍返回 `INVALID_INPUT`。用户切换范围形成历史记录并清除月份筛选。有效的较早年份补入选择器，导航、单书笔记及登录返回保留范围；只恢复匹配范围的报告。前端串行提交创建请求，并检查创建、批次与笔记分页的调用代次；离开旧页面在新页面初始化前停止推进。

模块 9–14 的 `scope` 表达实际周期，最近 24 月明确标记「年度偏好，非最近 24 月汇总」。旧周/月/全历史采集状态重新聚合对应 `period`，忽略旧 `preference` 年度数据；没有对应来源则提示重读。缺失字段为不可用、空数组为空、数值零保留；正在读取和失败使用相应原因说明。

模块 13 使用 `kind: authors`；`Datum.label` 仅为作者名称，`value` 为数值本数，`readTime?: string` 保留上游格式化时长，缺失不补零也不解析为数值。数据按本数稳定降序，真实零保留；卡片只显示前 5 位，弹窗、HTML 明细和 JSON 保留全部已返回记录。正式与开发接口从保存的原始采集状态重聚合旧报告，时长缺失显示“—”，不从旧标签猜测。示例时长仅汇总其自身模拟记录。

模块 25 的分词、停用词与前 40 词口径保持不变；SVG 云图的布局位置与字号不进入 JSON。云图长词省略不改变 `label`，完整词语和频次仍在提示、明细及 JSON 中保留；HTML 同时嵌入静态词云和完整词频表。

## 服务端接口

公开接口为 `GET /api/health`、`GET /api/demo` 和认证库需要的 `/api/auth/*`。`GET /api/connections` 只返回本机两种连接的状态，`PUT /api/guest/connection` 验证 Key 后建立匿名连接。个人报告接口接受有效游客或账号会话，账号设置与删除、保存转换要求登录。

C2 已扩展 `DELETE /api/account`：事务内锁定账号并复核会话及 10 分钟再认证期限，撤销自有反馈/附件访问，将 R2 删除任务持久化后删除账号；双 Cookie 游客反馈只解除辅助账号关联。未应用 C2 迁移时仍支持原账号删除，迁移后不依赖反馈开关来执行清理。

| 接口                                     | 行为                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `GET/PUT/DELETE /api/account/weread-key` | 查询状态、先验证再加密替换、移除；不回显 Key                             |
| `DELETE /api/account`                    | 要求 10 分钟内新建的登录会话，删除账号与关联数据                         |
| `GET/DELETE /api/session/reports`        | 恢复或清除当前会话的临时报告                                             |
| `GET /api/reports/target`                | 返回当前目标的 `id / keyVersion / otherSession`，不返回其他会话正文      |
| `POST /api/reports`                      | `{ range, requestId, expected, replace? }`；事务内核验并替换，详见下节   |
| `GET /api/reports/:id`                   | 当前报告与进度，不推进采集                                               |
| `POST /api/reports/:id/advance`          | `{ version, requestId }`；单批一个上游请求，使用数据库执行租约和版本比较 |
| `GET /api/reports/:id/notes`             | 游标、书籍、类型、关键词过滤；单页最多 200 条                            |
| `POST /api/reports/:id/touch`            | 用户交互延长闲置期限，不能越过绝对到期时间                               |
| `POST /api/reports/:id/cancel`           | 撤销执行租约，保留已有结果                                               |
| `POST /api/reports/:id/retry`            | 重新加入失败项，保留成功结果                                             |
| `GET /api/books/:id`                     | 按需读取封面、作者、分类、出版社、简介和当前进度                         |

`shared/connection.ts` 定义连接及任务响应。报告任务新增 `expiresAt`、`idleExpiresAt`、`serverTime`（ISO 时间），所有创建、恢复、推进、取消与重试响应沿用服务端原期限。React 以请求发起时的单调时钟和服务端剩余时长保守计算本地截止时间，分页、下载和自动恢复不延长它；到期立即隐藏并清除报告及相关查询。`touch` 仍返回 204，仅真实用户交互触发，成功后只读获取服务端新期限。

`GET /api/connections` 新增顶层 `serverTime`；有效连接包含不可逆的 `context` 摘要，用于前端缓存隔离。游客摘要包含连接 ID 与凭据版本，账号摘要包含用户、登录会话与凭据版本；不返回原始身份标识、会话令牌或 Key。账号状态还返回登录会话的 `expiresAt`，游客保留闲置与绝对期限。摘要不授予权限，也不代替 Cookie 与服务端归属核验。

临时报告按游客连接或用户与登录会话、Key 版本隔离。闲置 30 分钟、绝对 2 小时；自动推进不续期。单批租约 25 秒、上游超时 12 秒、全应用最多 8 个有效租约；每报告最多 600 请求、10,000 条正文、1.5 MB 采集状态。预算触顶返回部分结果，`retryAllowed: false` 禁用继续采集；回退超大批次时仍保留实际请求计数。`issueCode` 区分失效 Key、预算与上游失败，已有笔记分页可继续读取。当前预算是明确上限，尚未实现超过上限后分卷继续采集。

正式采集在调用上游前，按当前有效租约、报告版本和归属持久化预留一次请求计数；取消、转换、租约失效或进程中断不会退还已预留预算。预留失败不发出上游请求，结果写回也要求租约仍有效。计数独立于正文和游标提交，迟到批次被拒绝后仍保留已用预算；重试和保存到账号不重置该计数。

取消、重试、续期、租约取得、预算预留和结果写回均先按归属、报告的顺序取得事务锁，再重新读取当前状态；提交前核对原报告期限、游客或账号会话期限，预留与结果写回同时复核原租约期限。等待锁或事务执行期间到期则回滚本次写入，不能续活已过期数据。游客与报告的闲置续期在同一事务完成，不增加绝对期限或重置已用预算。账号归属锁取得后重新检查登录会话；报告创建/替换、保存连接及 Key 修改/删除在提交前再次核对账号会话，登录已过期或撤销时返回 `401 AUTH_REQUIRED` 并回滚。游客创建/替换提交前也检查原连接期限，到期返回 `401 GUEST_EXPIRED`，不删除原报告。

失败响应包含 `code`、中文 `message`、`retryable`、`requestId`。HTTP 401 上游响应映射 Key 无效；普通网络错误、HTTP 403、限流和未知业务错误不会把 Key 标为过期。`upgrade_info` 立即中止该任务。尚未核实上游所有业务失效码，需后续补充真实证据。

<a id="report-replacement"></a>

### 普通账号报告替换

创建前读取 `/api/reports/target`，提交 `expected: { id: string | null, keyVersion: number }`；无有效报告时 `id` 为 `null`。同会话允许替换，另一登录会话必须明确选择「替换并生成」并提交 `replace: true`。服务端使用账号行锁核验实际归属、目标 ID 和凭证版本；不信任客户端的会话归属声明，也不把普通批次版本变化作为再次确认的原因。

另一会话的目标存在时返回 `409 REPORT_CONFLICT`，同会话目标或凭证变化返回 `409 REPORT_TARGET_CHANGED`；`details` 只含新的 `ReportTarget` 元信息。前端刷新确认目标，取消不发送替换请求。成功后同一事务删除旧任务及正文、撤销旧租约并建立新任务。成功请求重复提交相同 `requestId` 返回原任务；其报告已被替换时，短期回执使旧请求返回 `REPORT_REPLACED`，不会重建。

`report_replacement` 仅保存原报告 ID、用户/会话归属、原请求 ID 和原绝对到期时间，不保留正文。到期后不再用于识别，清理任务分批删除；账号或会话删除时级联清除。旧会话读取、推进或恢复前台校验遇到替换后收到 `REPORT_REPLACED`，清除失效引用并停止自动生成，用户可主动重新生成并再次核对冲突。迁移文件为 `0001_slim_ultimatum.sql`；当前配置数据库迁移已通过，真实多会话并发场景尚待验收。

## 游客连接与保存转换

迁移 `0002_nasty_black_knight.sql` 新增 `guest_connection`、`connection_save`，报告通过排他归属约束只能属于一个游客或一个账号会话。游客 Cookie 为 `HttpOnly / SameSite=Lax`，HTTPS 下使用 `Secure`，服务端仅保存随机令牌的 SHA-256 摘要。游客密文、报告与回执按期限清理，自动采集不续期。

| 接口                           | 输入与行为                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/connections`         | 返回 `guest / account` 状态、期限与 `context` 缓存隔离摘要，不含原始身份、凭据和正文                                  |
| `PUT /api/guest/connection`    | `{ apiKey }`；先验证，再建立闲置 30 分钟、最长 2 小时的临时连接                                                       |
| `DELETE /api/guest/connection` | 删除当前游客连接及报告，保留账号连接                                                                                  |
| `POST /api/guest/save`         | `{ requestId, reportId, expected?, replace? }`；在登录身份下先查回执，再事务转换当前游客报告，返回 `reportId / range` |

个人 API 用 `X-Yuewen-Connection: guest|account` 明确选择 Cookie；不携带选择时仅兼容单一有效身份，两种均存在返回 `CONNECTION_REQUIRED`。请求头不授予权限。双端 URL 用同名 `connection` 参数保留选择；没有选择时先恢复游客，再恢复账号；显式选择失效不自动换源。

保存意图用 URL 中的非敏感 `save / saveReport` 保留请求及原报告标识，登录返回仅允许站内报告或设置路径。`SAVE_CONFLICT` 的 `details` 包含游客报告、凭证版本、账号凭证版本、旧报告 ID 和 Key 冲突标志；界面一次确认实际替换影响。取消不转移任何内容。事务锁定账号、游客和报告，重新加密到账号归属、撤销旧租约、提升版本并转移现有状态，保留范围、笔记、游标、预算和更早的原期限。提交前再次检查游客及报告期限；等待锁或执行转换期间到期时整笔回滚，不留下账号凭据、报告替换或成功回执。成功后旧游客 Cookie 失效。

相同账号和 `requestId` 的重试优先读取 `connection_save`，不再要求已撤销的游客 Cookie；仍核验原 `reportId`、当前登录会话、报告期限及 Key 版本。原结果已变化返回 `SAVE_RESULT_EXPIRED`，不恢复已删除内容。首次提交时报告变化返回 `SAVE_TARGET_CHANGED`。前端在保存确认期间暂停采集与自动过期跳转，成功后使用回执确认的范围恢复账号报告。保存请求固定使用发起时的请求、报告和冲突目标；页面卸载、连接或保存意图变化后，旧请求不再提交后续操作或改写当前页面。连接自动恢复也在监听失效或页面卸载后丢弃旧结果。服务不可用或响应无法确认时清除旧冲突选项并提示重试确认，原请求标识仍保留在地址中，刷新可查询同一回执。

创建游客连接、报告及详情使用数据库共享限流；来源桶仅信任 Netlify Functions `context.ip`，不读取客户端 IP 请求头，其他宿主使用公共桶，不信任任意 `X-Forwarded-For`。限流日期参数显式编码为 PostgreSQL 时间戳。

## 扩展指标

`ReadingReport.insights` 是可选扩展，由 `shared/insights.ts` 共用计算，服务端在正文截页前生成，双端和 HTML/JSON 使用同一结果。保留原 27 模块目录及 3 个画像内容。

- `metrics`：自然日均、阅读日均、活跃率和最长连续天数，包含值、单位、原因及适用分子分母；未知为 `null`，真实零保留。连续值要求范围内每日记录齐全，每日满 60 秒。
- `hourly`：对应偏好周期的 24 项秒数转小时，按 6 时至次日 5 时；缺失或格式不完整时展示原因。
- `comparison`：只比较当前范围最近两个相邻完整自然月，保留双方起止日及数值；缺月不跳过，基期零不计算百分比。
- `density`：同书、同范围、稳定 ID 去重且日期已知的划线及想法除以官方阅读小时；排除书签和重复引用，不使用最近 24 月的年度榜单作分母，未采正文不填零，部分覆盖明确说明。
- `months`：保留已有月回包中的统计与单书榜。月份联动同时显示该月指标、榜单和日期可定位的笔记；无月榜时明确不可得，下载仍是整份报告。

计算口径依据[产品计划](plans/product.md#extended-metrics)和[腾讯统计字段](https://github.com/Tencent/WeChatReading/blob/main/skills/readdata.md)。真实联调和未验证场景见[质量记录](quality-log.md)。

## 保护与下载

Key 使用 AES-256-GCM，随机 IV，以账号用户 ID 或游客连接 ID 作 AAD；密钥版本与凭证版本分别记录。私有 API `no-store`，写请求核对精确同源 Origin；Better Auth 另执行自身来源及会话检查。账号删除和会话撤销通过外键级联清除临时报告。

HTML 用同一报告对象生成，包含内嵌 SVG、完整数据表、范围和文本转义，离线无外部脚本或封面依赖。JSON 只投影公开报告契约，不携带任务、凭证或账号身份。默认仅含精选，完整笔记可选择加入。

下载使用当前来源及统计范围的整份已采集报告，局部月份、单书、分类、关键词和笔记类型筛选不改变下载对象。面板显示来源、范围及起止日；范围或来源切换时关闭面板，异步生成完成后再次检查报告引用，防止下载上一份结果。

依据：[官方网关](https://github.com/Tencent/WeChatReading/blob/main/skills/SKILL.md)、[统计](https://github.com/Tencent/WeChatReading/blob/main/skills/readdata.md)、[书架](https://github.com/Tencent/WeChatReading/blob/main/skills/shelf.md)、[笔记](https://github.com/Tencent/WeChatReading/blob/main/skills/notes.md)、[进度](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md)。

<a id="period-statistics"></a>

## 周期统计与笔记内容

07 使用可选 `periods: PeriodStatistics[]`：每个完整周期有 `label`、`start`、`end`、`seconds`、`readDays` 和 `stats[{ name, text }]`。秒数与阅读天数取官方数值，`readStat` 名称和数量文案原样保留，不再拼接后用 `parseFloat` 解析。固定列只映射已核实的“读过”“读完”“笔记”，其他字段保留在全部原始明细中；缺失显示“—”，原始零不丢失。本周跨月仍是一组；本月截止当天；自然年和最近 24 月按月；全部历史仅一组汇总。`Datum.unit` 为可选逐项单位，01 的小时与天分别标注。

`Note` 只保留正文、对应原文、有效章节、书名、作者、日期、类型、稳定 ID、演示标识与章节关联 `chapterUid`，不再采集或输出 `range`、`page` 等笔记位置。报告聚合和正式笔记分页使用字段白名单重新构造笔记；JSON 对 `notes`、`portrait.quote`、`portrait.selections` 再次应用同一白名单。旧采集状态可直接重聚合，无需清空报告或为补位置重采。报告统计范围 `ReadingReport.range` 和分页游标不受影响。

想法的 `abstract` 默认完整可见；只给划线正文及引用原文加下划线，想法正文不加。HTML 的完整笔记选项同时输出对应原文，仍做 HTML 转义；默认最多 20 条精选。缺章节时省略，列表、顶部选句、精选与导出均无位置占位。

`meta.generatedAt` 是报告采集开始时间，页面明确标为“报告采集时间”，不是最近成功更新时间。新增可选 `meta.source` 区分 `sample / development / guest / account`；原有 `sampleReport` 保持兼容。12 本公开书目来自微信读书公开页面，另有一本原创导入示例；阅读记录独立模拟；演示文字标记 `demoText: true`，不作为该书真实原文署名。

本地开发的 `/api/dev/*` 不属于正式接口；本地内存任务因内容预算受限可一次返回当前已读取的全部正文，正式账号任务继续使用 200 条分页。旧 Vue 双端沿用既有来源选择。React 的 `/demo` 默认模拟，只有开发构建显式选择 `source=development` 才使用本地来源；新增只读 `/api/dev/session/reports` 与 `/api/dev/reports/:id` 用于恢复本地内存任务，进入页面不会自动调用采集接口。来源或范围变化时旧响应不再写回。

## 后台认证接口

2026-10-09 接入 C0–C1，管理认证与前台邮箱身份完全分开，详见[后台开发与初始化](development.md#后台开发与初始化)。新增 `console_auth_user/session/account/verification/rate_limit`，只允许一名管理员，不进入前台用户列表。`0003_swift_zuras.sql` 为向前兼容新增迁移，不修改已有报告或认证表。

| 接口                                      | 行为                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /api/console/auth/sign-in/username` | Better Auth 用户名/密码登录；失败不区分未知账号与密码错误；可信平台 IP 每分钟最多 5 次 |
| `GET /api/console/auth/get-session`       | 返回当前管理会话或 `null`，不回退读取前台/游客 Cookie，不自动续期                      |
| `POST /api/console/auth/sign-out`         | 撤销当前管理会话并清理独立管理 Cookie                                                  |
| `GET /api/console/overview`               | 每次核验有效管理会话，返回 `{ status: 'ready' }`，不暴露用户数据                       |

管理认证与数据响应均 `no-store`；写操作保持同源 JSON 和 16 KiB 限制。管理 Cookie 8 小时到期，HTTPS 下 Secure、HttpOnly、SameSite Strict、host-only，Path 为 `/api/console`。配置未就绪返回 503 `CONSOLE_UNAVAILABLE`；业务接口未登录返回 401 `CONSOLE_AUTH_REQUIRED`；其他管理认证路径及未实现管理接口拒绝访问。公开预览在入口层返回 `PREVIEW_ONLY`。公开注册、邮箱登录/找回、资料修改和后台账号删除尚未开放。C2 反馈管理及 C3 用户/数据接口见下文，均由各自开关控制；C3 危险操作在同次请求中核验管理员当前密码与目标版本。

<a id="feedback-api"></a>

## C2 反馈 API（2026-10-10）

已实现，默认关闭；需应用 `0004_c2_feedback.sql` 并设置服务端 `FEEDBACK_ENABLED=true`。公开 Deploy Preview 仍在进入数据库前拒绝。PC 截图组件与后台反馈页面已接入，生产及真实 R2 尚未启用/验收，见[质量记录](quality-log.md#c2-feedback-ui-2026-10-12)。

| 接口                                         | 已实现的载荷与结果                                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/feedback/context`                 | JSON `{ allowUnverified?: boolean }`；返回 `contextId / expiresAt / identity / unverifiedReason? / screenshotAvailable`。所有身份先取得上下文，访客另收到仅限 `/api/feedback`、最长 24 小时的 HttpOnly/SameSite Strict Cookie；HTTPS 使用 Secure |
| `POST /api/feedback`                         | multipart 字段 `contextId`、`requestId`（UUID）、`payload`（JSON 字符串）及可选 `screenshot`；首次保存 `201 { id }`，有效重试 `200 { id }`，不返回正文或附件                                                                                     |
| `GET /api/console/feedback`                  | 管理会话；`page / pageSize`（默认 20、最大 100）、`status / source / from / to` 白名单筛选，按创建时间及 ID 降序；返回 `items / total / page / pageSize`。列表不加载正文、环境 JSON 或图片，邮箱脱敏                                             |
| `GET /api/console/feedback/:id`              | 管理详情含原文、处理字段、属主及必要账号信息、附件 MIME/大小/尺寸/期限；不返回 object key 或令牌                                                                                                                                                 |
| `GET /api/console/feedback/:id/screenshot`   | 管理鉴权、期限和摘要检查后返回私有图片流；返回前再次核验会话与附件有效性，缺图/到期返回 410，禁止缓存并设置 `nosniff`                                                                                                                            |
| `PATCH /api/console/feedback/:id`            | JSON `{ version, status, category, internalNote }`，返回 `{ id, version }`；状态为 `pending / processing / resolved / closed`，分类为 `uncategorized / bug / suggestion / other`，备注最多 4,000 字；旧版本返回 409                              |
| `DELETE /api/console/feedback/:id?version=N` | 撤销访问、保存对象删除任务、保留短期无正文墓碑并写审计；成功返回 204，旧版本返回 409                                                                                                                                                             |

`payload` 为 `{ description, steps?, contact?, environment }`：描述 1–4,000 字，步骤最多 4,000 字，联系方式最多 200 字；未知字段拒绝。JSON 字符串最多 32 KiB，环境信息最多 16 KiB。仅反馈 multipart 的实际请求流可到 2 MiB，其他接口保持原 16 KiB/JSON 限制。

`environment` 必填 `entry: "pc"`、`path`（`/`、`/demo`、`/overview`、`/report`、`/shelf`、`/notes`、`/settings`、`/login`）、`source`（`mock / guest / account / none`）、`theme`（`light / dark / unknown`）、`viewport: { width, height }` 和 `dpr`。可选 `range` 沿用报告范围、`view` 为 `overview / bookshelf / notes / insights`，以及受限的 `language / timezone / browser / browserVersion / os / clientVersion / clientTime / error`；具体枚举与纯校验共用于 `shared/feedback.ts`，multipart 和图片边界由 `server/feedback/input.ts` 核验。不接收任意 URL、查询词、referrer、User-Agent 原文、DOM、网络响应或控制台内容。服务端单独记录部署、构建、接收时间、请求关联 ID 和未验证原因。

账号和游客沿用 `X-Yuewen-Connection` 与真实 Cookie 鉴权；两种有效 Cookie 同时存在时必须选择。所选会话过期时，调用上下文接口须显式 `allowUnverified: true` 重新确认，不能把旧请求自动转给访客；访客来源使用 `none` 或 `mock`。属主与辅助登录账号分列，游客保存为账号后不迁移旧反馈。客户端不能提交属主字段。

重试必须保留原 `contextId / requestId / payload / screenshot`。摘要包含规范化文本、全部诊断字段及图片字节 SHA-256；使用同一标识改变载荷、丢失 Cookie、换会话或上下文过期返回 409，删除后旧请求返回 410。上下文最长 24 小时，墓碑保存到其期限；期限结束后即使回执已清理，旧上下文也不能再提交。修改内容或移除截图需生成新请求标识。

截图只接受真实可完整解码的单帧 PNG/JPEG/WebP，最多 1 张、1 MiB、400 万像素。`sharp` 核验声明类型、真实格式、像素数并执行有界解码；文件名不进入存储 key。R2 对象使用服务端随机 `feedback/UUID`，元信息存真实 MIME、字节数、尺寸、摘要、状态和到期时间，不存二进制。缺少配置、容量已满或图片不合法时明确失败，客户端可由用户确认后改为文字反馈，不静默丢图。

共享 PostgreSQL 限流为每 IP 每 10 分钟 5 次提交（上下文另有同等限流）、每有效属主每小时 10 个新请求、全站 UTC 日 200 个新请求，超限返回 429 和 `Retry-After`。每日/属主额度在预留事务中扣减，失败后待重试的预留也占用该窗口，合法重试不重复扣减。1 GiB 附件容量包含待上传、有效附件和未完成删除对象；容量与幂等使用同一事务锁。管理 API 每分钟 120 次，图片读取另限每分钟 30 次。

R2 写入不跨数据库事务：先预留，再上传同一 key，再以租约及身份检查发布；失败不返回成功，半成品不对后台可见。上传租约 60 秒，R2 PUT 最长 10 秒、单次 SDK 尝试；删除与迟到上传交错时延迟清理，最终写入失败由回执重试、删除任务和孤儿对账回收。正文/诊断与审计保留 180 天，截图 30 天，未完成上传 24 小时回收；读取即时检查期限。R2 的 30 天生命周期仍需在实际 bucket 单独配置。

<a id="console-read-api"></a>

## C3 用户与数据只读 API（2026-10-10）

已实现，默认由服务端 `CONSOLE_DATA_ENABLED=false` 关闭；要求 0000–0005 迁移、有效独立管理会话，不依赖 R2 或反馈提交开关。未启用/未完成 C3 迁移返回 503 `CONSOLE_DATA_UNAVAILABLE`，未登录返回 401 `CONSOLE_AUTH_REQUIRED`。读取后再次核验管理会话，响应 `no-store`，每管理员每分钟最多 120 次；公开预览继续拒绝管理 API。

所有分页返回 `{ items, total, page, pageSize }`，`page` 默认 1、最大 10,000，`pageSize` 默认 20、最大 100。固定按创建时间及 ID 降序，凭据按更新时间及用户 ID 降序；拒绝未登记的查询字段和任意排序。ID 筛选精确匹配，邮箱/ID 搜索为不区分大小写的字面子串，`%`、`_` 等不作为通配符。

| 接口                                  | 查询参数与字段范围                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/console/users`              | 分页及 `search / verified / connection / from / to`；验证状态为 `true/false`，连接状态为 `unconfigured/valid/invalid`；注册起止时间为 UTC ISO datetime，含边界且起始不能晚于结束。返回 ID、昵称、脱敏邮箱、验证状态、创建/更新时间、连接状态、最近有效会话创建时间和自有反馈数 |
| `GET /api/console/users/:id`          | 必要账号字段与列表相同，邮箱完整；无查询参数；不存在返回 404 `USER_NOT_FOUND`                                                                                                                                                                                                  |
| `GET /api/console/data/credentials`   | 分页及可选 `userId`；仅用户 ID、状态、版本、验证/创建/更新时间，不返回密文及加密密钥版本                                                                                                                                                                                       |
| `GET /api/console/data/guests`        | 分页及可选 `guestId`；仅 ID、状态、版本、闲置/绝对期限和创建/更新时间，不返回 token 哈希或密文                                                                                                                                                                                 |
| `GET /api/console/data/reports`       | 分页及可选 `userId / guestId`；仅 ID、属主 ID、状态、任务/凭据版本、`rangeKey/rangeStart/rangeEnd`、请求/笔记/笔记本/待处理/失败数量及期限/时间；不返回正文、书目、队列参数、游标、租约或完整 `state`                                                                          |
| `GET /api/console/data/sessions`      | 分页及可选 `userId`；仅会话 ID、用户 ID、创建/更新时间和期限，不返回 token、IP 或 User-Agent                                                                                                                                                                                   |
| `GET /api/console/data/audit`         | 分页；只返回未过期审计的 ID、操作者、动作、目标 ID、结果、可选结构化操作原因和创建/到期时间                                                                                                                                                                                    |
| `GET /api/console/data/cleanup-stats` | 无查询参数；返回 `{ items: [{ resource, total, expired }] }`，固定汇总 `auth_rate_limit / request_limit / connection_save / report_replacement`，不返回原始键、计数明细或回执                                                                                                  |

`latestSessionCreatedAt` 只取当前未过期会话的最大创建时间，没有则为 `null`，不是登录历史。`feedbackCount` 只计 `feedback.user_id` 匹配、已提交且未过期记录；游客反馈的 `associated_user_id` 不计入账号名下。元信息列表可显示尚未被清理的过期连接/报告/会话，期限字段用于判断失效；不会借此开放正文。清理统计中认证限流的 `expired` 表示最后请求距今超过 24 小时，其他三表按期限统计；查询本身不执行清理。

未提供 `auth_account`、`auth_verification`、管理认证表或任意 SQL/表名/列名读取，也未开放新增用户或改邮箱。2026-10-12 管理查询页面已接入上述接口，专用写操作见下文。

<a id="console-write-api"></a>

## C3 管理写操作（2026-10-12）

与查询共用 `CONSOLE_DATA_ENABLED`、独立管理会话和 0005 迁移检查。所有请求使用同源 JSON，成功返回 204；只接受声明字段。写请求每管理员每分钟最多 30 次，危险操作的密码核验每分钟最多 5 次，失败也计数；仍计入管理数据接口每分钟 120 次总限流。

| 接口                                            | 请求与行为                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/console/users/:id`                  | `{ name, updatedAt }`；昵称 trim 后 1–100 字，仅修改昵称，更新时间单调递增                                                      |
| `POST /api/console/users/:id/delete`            | `{ password, reason, updatedAt }`；事务删除账号及关联认证、连接、报告、自有反馈，保存附件删除任务；禁止目标为管理员             |
| `POST /api/console/data/credentials/:id/revoke` | `{ password, reason, version, updatedAt }`；ID 为用户 ID，撤销保存的连接并清除该账号全部报告                                    |
| `POST /api/console/data/guests/:id/revoke`      | 同上；撤销游客连接并级联清除报告和游客回执，反馈保留游客类型并解除连接关联                                                      |
| `POST /api/console/data/sessions/:id/revoke`    | `{ password, reason, updatedAt }`；删除指定前台会话及其报告、回执，不撤销其他会话或保存的连接                                   |
| `POST /api/console/data/reports/:id/stop`       | `{ password, reason, version, updatedAt }`；仅停止 queued/running，递增版本并清空租约，保留采集状态、预算和期限；用户可主动继续 |
| `POST /api/console/data/reports/:id/clear`      | 同上；删除指定报告并保存至原报告到期的短期回执，账号和游客的原生成请求重试均不能恢复它                                          |

`updatedAt` 使用查询返回的 ISO 字符串，`version` 使用当前列表值。`reason` 仅接受 `user_request / security / troubleshooting / maintenance`；密码不进入审计、URL 或客户端持久存储。每次危险操作都在事务内调用认证库验证当前密码，核验只服务当前目标/动作，不发放可复用的再认证凭证；提交前复核管理会话及核验时间未超过 10 分钟。密码重置、管理写入共用管理员锁，管理会话行锁阻止退出与写入交错。

业务锁顺序与前台一致：先属主，再会话/连接/报告，账号删除再锁反馈。报告归属在加锁后复核，变化时拒绝。成功审计与业务操作同事务提交；业务失败回滚后另记固定错误码，失败审计写入不可用时仅输出无载荷诊断。`console_audit.reason` 只存上述枚举，旧审计及昵称编辑为 null，不记录原昵称、密码、Key 或阅读正文。

版本变化返回 409 `MANAGEMENT_CHANGED`，目标已删除/撤销返回 404 `MANAGEMENT_GONE`；非采集状态停止返回 409 `REPORT_NOT_RUNNING`。错误密码为 403 `CONSOLE_PASSWORD_INVALID`，核验超时为 403 `CONSOLE_REAUTH_REQUIRED`，管理会话失效为 401 `CONSOLE_AUTH_REQUIRED`。失败或响应未确认时不会自动重试；先刷新核对结果，再用新版本显式操作。

账号后台删除与自助删除共用 `removeAccount` 的反馈/附件事务清理，辅助账号关联的游客反馈只置空关联；截图 R2 故障不回滚已确认的账号删除，独立对象任务继续重试；已启用的恢复日志 R2 不可用时则在持久删除前拒绝，见下文。0005 扩展 `report_replacement` 的游客归属、唯一索引和属主约束，回执随游客删除或到期清理；停止与清除均拒绝旧租约写回。完整工程及手动 API 证据见[C3 写操作记录](quality-log.md#c3-write-2026-10-12)。

## 独立撤销与灾难恢复（2026-10-13）

`RECOVERY_LOG_ENABLED=true` 时，账号删除、持久 Key 移除/替换/判失效、反馈/附件删除先写入数据库之外的私有 R2 意图日志，再执行原事务。日志不可用返回可重试的 `503 RECOVERY_LOG_UNAVAILABLE`；原有授权、再认证、版本与事务检查继续生效，请求载荷不变。日志默认关闭，无新增数据库迁移或公开日志查询接口。

日志只保存事件 ID、时间、epoch、动作、目标 ID 和必要对象参数，不保存凭据或正文；意图可能对应最终回滚的操作，恢复会保守再次撤销。会话、游客、报告、密码在恢复时统一失效：清空旧会话、验证码和报告，并移除前后台旧密码哈希，用户重新验证，管理员显式重置。保留期限、覆盖入口、连续性要求与恢复步骤只在[恢复手册](database-recovery.md)维护。生产本批未启用。
