import {
  emptyModules,
  getRange,
  group,
  longestStreak,
  naturalDays,
  preferenceScope,
  shanghaiDate,
  wordFrequency,
} from './report'
import type { Book, Datum, Note, RangeKey, ReadingReport } from './report'

import publicBooks from './demo-books.json'

const excerpts = [
  '走进山野的时候，时间有了另一种刻度。风吹过树梢，便是一页翻过。',
  '我们记得的从来不只是一本书，还有读它时窗外的光，和那时的自己。',
  '散步是重新认识一座城市的方法。走慢一点，日常也会露出陌生而明亮的一面。',
  '生长并不总是向上。有时候，它是向下扎根，是学会安静地等待。',
  '夜晚让声音变得清楚。远处的灯，桌上的书，都是可以停靠的地方。',
  '四季没有催促过一棵树。春天发芽，秋天落叶，每一步都有自己的节奏。',
  '生活中的诗意，常常藏在我们愿意再看一眼的地方。',
  '远方不是地图上的一个点，而是一种保持好奇的心情。',
  '微小的改变，也会留下清晰的纹路。一天读几页，日子便多了一点回声。',
  '关于明天，我们可以做的，是认真收好今天的一点光。',
  '给生活留一点空白，让未曾计划的美好有地方落脚。',
  '风经过书页，文字仍然留在那里。阅读留下的，是我们看世界的新方式。',
]

export function createDemo(key: RangeKey = 'recent', now = new Date()): ReadingReport {
  const range = getRange(key, now)
  const history = {
    ...getRange('recent', now),
    start: `${Number(shanghaiDate(now).slice(0, 4)) - 2}-01-01`,
  }
  if (key === 'overall') range.start = history.start
  const books: Book[] = publicBooks.map((book, i) => ({
    id: `demo-${i}`,
    title: book.title,
    author: book.author,
    cover: book.cover,
    category: [
      '文学',
      '文学',
      '文学',
      '文学',
      '文学',
      '文学',
      '文学',
      '科幻',
      '文学',
      '社会文化',
      '心理学',
      '人物传记',
    ][i],
    publisher: undefined,
    kind: 'book',
    progress: [100, 68, 100, 42, 100, 13, 100, 100, 28, 0, 81, 35][i],
    finished: [0, 2, 4, 6, 7].includes(i),
    secret: i % 4 === 0,
    archive: i % 3 === 0 ? '值得重读' : '慢慢读',
    description:
      '书名、作者及封面来自微信读书公开书目。阅读记录为模拟数据，笔记为阅纹原创演示文本，不是本书原文。',
  }))
  const allDays: Datum[] = []
  const start = Date.parse(`${history.start}T00:00:00Z`)
  const end = Date.parse(`${history.end}T00:00:00Z`)
  const notes: Note[] = []
  const bookTimes = new Map<string, number>()
  const preferenceTimes = new Map<string, number>()
  for (let stamp = start, i = 0; stamp <= end; stamp += 86400000, i++) {
    const date = new Date(stamp).toISOString().slice(0, 10)
    const seconds = i % 9 === 0 || i % 17 === 0 ? 0 : 900 + ((i * 7919) % 5200)
    const book = books[i % books.length]
    allDays.push({ label: date, value: seconds })
    if (seconds) book.updatedAt = date
    if (date >= range.start && date <= range.end)
      bookTimes.set(book.id, (bookTimes.get(book.id) ?? 0) + seconds)
    if (
      key === 'recent'
        ? date.startsWith(range.end.slice(0, 4))
        : date >= range.start && date <= range.end
    )
      preferenceTimes.set(book.id, (preferenceTimes.get(book.id) ?? 0) + seconds)
    if (seconds && i % 3 === 0) {
      const type = i % 12 === 0 ? 'thought' : 'highlight'
      notes.push({
        id: `note-${i}`,
        bookId: book.id,
        title: book.title,
        author: book.author,
        chapter: '演示章节',
        date,
        type,
        demoText: true,
        text:
          type === 'highlight'
            ? excerpts[i % 12]
            : `读到这里，想给自己留一点${['时间', '好奇', '安静', '空间'][i % 4]}。${excerpts[(i + 1) % 12]}`,
        abstract: type === 'thought' ? excerpts[i % 12] : undefined,
      })
    }
  }
  const scoped = allDays.filter((d) => d.label >= range.start && d.label <= range.end)
  const inRangeNotes = notes.filter((n) => n.date! >= range.start && n.date! <= range.end)
  books.forEach((book) => {
    book.seconds = bookTimes.get(book.id) ?? 0
    book.noteCount = notes.filter((n) => n.bookId === book.id).length
  })
  const seconds = scoped.reduce((a, d) => a + d.value, 0)
  const readDays = scoped.filter((d) => d.value >= 60).length
  const bucket = (date: string) =>
    ['weekly', 'monthly', 'overall'].includes(key) ? range.label : date.slice(0, 7)
  const monthly = group(scoped.map((d) => ({ label: bucket(d.label), value: d.value / 3600 })))
  const monthlyDays = group(
    scoped.map((d) => ({ label: bucket(d.label), value: d.value >= 60 ? 1 : 0 })),
  )
  const prefScope = preferenceScope(range)
  const preferenceBooks = books.map((b) => ({
    ...b,
    seconds: preferenceTimes.get(b.id) ?? 0,
  }))
  const categoryHours = group(
    preferenceBooks.map((b) => ({ label: b.category, value: b.seconds / 3600 })),
  )
  const modules = emptyModules(range)
  const set = (id: number, data: Datum[], description: string, scope?: string) => {
    Object.assign(modules[id - 1], {
      data,
      description,
      status: data.length ? 'ready' : 'empty',
      coverage: { expected: data.length, loaded: data.length, failed: 0, complete: true },
      ...(scope ? { scope } : {}),
    })
  }
  set(
    1,
    [
      { label: '阅读时长', value: seconds / 3600, unit: '小时' },
      { label: '阅读天数', value: readDays, unit: '天' },
    ],
    '原创示例，根据逐日记录汇总。',
  )
  set(
    2,
    monthly,
    ['weekly', 'monthly'].includes(key)
      ? '所选周期的阅读时长。'
      : '每月的阅读时长；点击月份可查看对应笔记。',
  )
  set(3, monthlyDays, '每天阅读满 1 分钟计为一个有效阅读日。')
  set(
    4,
    group(
      scoped
        .filter((d) => d.value >= 60)
        .map((d) => ({
          label:
            d.value < 1800
              ? '不足 30 分钟'
              : d.value < 3600
                ? '30–60 分钟'
                : d.value < 10800
                  ? '1–3 小时'
                  : '3 小时以上',
          value: 1,
        })),
    ),
    '只统计有效阅读日。',
  )
  set(
    5,
    scoped.map((d) => ({ ...d, value: d.value / 60 })),
    '每格代表一天，按周排列；有阅读的日期按时长高亮，浅色为未阅读或统计范围外的日期。',
  )
  let cumulative = 0
  set(
    6,
    monthly.map((d) => ({ label: d.label, value: (cumulative += d.value) })),
    '从所选周期的第一天开始累积。',
  )
  set(7, [], '模拟阅读记录按完整周期汇总；读过、读完未提供，笔记仅指模拟文本条数。')
  modules[6].periods = monthly
    .map((month) => {
      const days = scoped.filter((day) => bucket(day.label) === month.label)
      const start = days[0]?.label ?? range.start,
        end = days.at(-1)?.label ?? range.end
      return {
        label: month.label,
        start,
        end,
        seconds: days.reduce((sum, day) => sum + day.value, 0),
        readDays: days.filter((day) => day.value >= 60).length,
        stats: [
          {
            name: '笔记',
            text: `${inRangeNotes.filter((note) => note.date! >= start && note.date! <= end).length} 条`,
          },
        ],
      }
    })
    .reverse()
  modules[6].status = modules[6].periods.length ? 'ready' : 'empty'
  modules[6].coverage = {
    expected: monthly.length,
    loaded: monthly.length,
    failed: 0,
    complete: true,
  }
  if (['weekly', 'monthly'].includes(key)) {
    modules[1].title = '周期阅读时长'
    modules[2].title = '周期阅读天数'
  }
  if (key === 'overall') {
    for (const id of [2, 3, 6]) {
      modules[id - 1].data = []
      modules[id - 1].status = 'unavailable'
      modules[id - 1].description = '全部历史仅展示汇总，请选择自然年或最近 24 个月查看周期明细。'
    }
  }
  set(
    8,
    group(scoped.map((d) => ({ label: d.label.slice(0, 4), value: d.value / 3600 }))),
    '仅比较所选范围中的年度片段，当前年不是完整年。',
  )
  set(
    9,
    preferenceBooks
      .filter((b) => b.seconds >= 300)
      .map((b) => ({ label: b.title, value: b.seconds / 3600 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    '所示周期单书排行，不将多期 Top 列表相加。',
    `${prefScope} · 前 10 本`,
  )
  set(
    10,
    categoryHours.map((d) => ({
      label: d.label,
      value: (d.value / Math.max(...categoryHours.map((c) => c.value), 1)) * 100,
    })),
    '相对最高分类的权重，不是百分比。',
    prefScope,
  )
  set(11, categoryHours, '分类阅读时长。', prefScope)
  set(12, categoryHours, '面积表示分类时长。', prefScope)
  set(
    13,
    group(preferenceBooks.filter((b) => b.seconds).map((b) => ({ label: b.author, value: 1 }))),
    '作者对应的阅读本数；不解析格式化时长。',
    prefScope,
  )
  set(14, [], '公开书目未核验出版社，不生成虚构出版社偏好。', prefScope)
  const listen = books.filter((b) => b.kind === 'audio').reduce((a, b) => a + (b.seconds ?? 0), 0)
  set(
    15,
    [
      { label: '文字阅读', value: (seconds - listen) / 3600 },
      { label: '听书', value: listen / 3600 },
    ],
    '阅读和收听的时长占比。',
  )
  set(
    16,
    group(books.map((b) => ({ label: b.kind === 'audio' ? '有声书' : '电子书', value: 1 }))),
    '文章收藏仅按一个入口计算。',
  )
  set(17, group(books.map((b) => ({ label: b.category, value: 1 }))), '当前书架的分类快照。')
  set(
    18,
    group(
      books.map((b) => ({
        label: b.finished ? '已读完' : b.kind === 'audio' ? '有声内容 · 进度另计' : '未读完',
        value: 1,
      })),
    ),
    '有声内容完结状态不等于用户读完。',
  )
  set(
    19,
    group(books.map((b) => ({ label: b.secret ? '私密阅读' : '公开阅读', value: 1 }))),
    '按当前书架逐项统计。',
  )
  set(
    20,
    group(books.map((b) => ({ label: b.archive!, value: 1 }))),
    '书单可重叠；这里是示例书单。',
  )
  set(
    21,
    books
      .filter((b) => b.updatedAt)
      .sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))
      .map((b) => ({ label: `${b.title} · ${b.updatedAt}`, value: 1 })),
    '每本书最近一次活动，不代表完整阅读历史。',
  )
  set(
    22,
    books.filter((b) => b.noteCount).map((b) => ({ label: b.title, value: b.noteCount! })),
    '累计笔记，包含划线、想法与书签；示例没有书签。',
    '累计笔记',
  )
  set(
    23,
    group(notes.map((n) => ({ label: n.type === 'highlight' ? '划线' : '想法', value: 1 }))),
    '累计笔记类型；示例书签为 0。',
    '累计笔记',
  )
  set(
    24,
    books.map((b) => ({ label: b.title, value: b.noteCount!, secondary: b.progress })),
    '横轴为 0–100% 阅读进度，纵轴为累计笔记条数。',
    '当前进度 × 累计笔记',
  )
  set(
    25,
    wordFrequency(inRangeNotes),
    '使用中文分词、停用词过滤与词频；仅供回顾，不作为人格或兴趣判断。',
  )
  set(
    26,
    group(inRangeNotes.map((n) => ({ label: n.date!.slice(0, 7), value: 1 }))),
    '区间内已读取内容的创建时间。',
  )
  set(
    27,
    group(
      inRangeNotes
        .filter((n) => n.type === 'highlight')
        .map((n) => ({
          label:
            [...n.text].length < 50
              ? '50 字以内'
              : [...n.text].length < 100
                ? '50–99 字'
                : '100 字以上',
          value: 1,
        })),
    ),
    '按 Unicode 字符计数，不含想法。',
  )
  const selections = inRangeNotes
    .filter((n) => n.type === 'highlight')
    .slice(-20)
    .reverse()
  return {
    meta: {
      version: 1,
      sampleReport: true,
      source: 'sample',
      generatedAt: now.toISOString(),
      timezone: 'Asia/Shanghai',
    },
    range,
    summary: {
      seconds,
      readDays,
      naturalDays: naturalDays(range),
      shelfCount: books.length,
      noteCount: notes.length,
    },
    modules,
    books,
    notes: inRangeNotes.reverse(),
    portrait: {
      title: '把日常，读成自己的风景。',
      text: `在这段时间里，你有 ${readDays} 天与书相伴。最长连续阅读 ${longestStreak(scoped)} 天，零散的片刻，渐渐成为生活里的习惯。`,
      evidence: [
        `${range.start} 至 ${range.end}`,
        `有效阅读 ${readDays} 天`,
        `最长连续 ${longestStreak(scoped)} 天`,
        '由阅纹根据指标归纳 · 原创示例',
      ],
      quote: selections[0] ?? null,
      selections,
    },
    coverage: { expected: notes.length, loaded: notes.length, failed: 0, complete: true },
    issues: [
      `书名、作者和封面取自微信读书公开书目，分类为本站展示分组；阅读记录均为模拟，笔记是原创演示文本，不是书中原文。书架快照日期：${shanghaiDate(now)}。`,
    ],
  }
}
