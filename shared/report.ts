export type RangeKey = 'recent' | 'weekly' | 'monthly' | 'overall' | `${number}`
export interface ReadingRange {
  key: RangeKey
  start: string
  end: string
  label: string
}
export interface Book {
  id: string
  title: string
  author: string
  category: string
  publisher?: string
  cover?: string
  kind: 'book' | 'audio' | 'article'
  progress?: number
  finished?: boolean
  secret?: boolean
  updatedAt?: string
  seconds?: number
  noteCount?: number
  archive?: string
  description?: string
}
export interface Note {
  id: string
  bookId: string
  title: string
  author: string
  chapter?: string
  date?: string
  text: string
  type: 'highlight' | 'thought'
  abstract?: string
  chapterUid?: number
  range?: string
  page?: number
  demoText?: boolean
}
export interface Datum {
  label: string
  value: number
  secondary?: number
  group?: string
  unit?: string
}
export interface Coverage {
  expected: number | null
  loaded: number
  failed: number
  complete: boolean
  reason?: string
}
export interface PeriodStatistics {
  label: string
  start: string
  end: string
  seconds?: number
  readDays?: number
  stats: { name: string; text: string }[]
}
export interface ReportModule {
  id: number
  title: string
  section: '时间' | '偏好' | '书架' | '笔记'
  unit: string
  kind: 'line' | 'bar' | 'donut' | 'radar' | 'treemap' | 'heatmap' | 'scatter' | 'words' | 'table'
  scope: string
  status: 'ready' | 'empty' | 'unavailable' | 'partial'
  description: string
  data: Datum[]
  periods?: PeriodStatistics[]
  coverage: Coverage
}
export interface ReadingReport {
  meta: {
    version: 1
    sampleReport: boolean
    source?: 'sample' | 'development' | 'account'
    generatedAt: string
    timezone: 'Asia/Shanghai'
  }
  range: ReadingRange
  summary: {
    seconds: number | null
    readDays: number | null
    naturalDays: number
    shelfCount: number | null
    noteCount: number | null
  }
  modules: ReportModule[]
  books: Book[]
  notes: Note[]
  portrait: {
    title: string
    text: string
    evidence: string[]
    quote: Note | null
    selections: Note[]
  }
  coverage: Coverage
  issues: string[]
}
export function shanghaiDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
export function getRange(key: RangeKey, now = new Date()): ReadingRange {
  const end = shanghaiDate(now)
  const [year, month] = end.split('-').map(Number)
  let start: string
  let label: string
  if (key === 'recent') {
    start = new Date(Date.UTC(year, month - 24, 1)).toISOString().slice(0, 10)
    label = '最近 24 个月'
  } else if (key === 'monthly') {
    start = `${end.slice(0, 7)}-01`
    label = '本月'
  } else if (key === 'weekly') {
    const date = new Date(`${end}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    start = date.toISOString().slice(0, 10)
    label = '本周'
  } else if (key === 'overall') {
    start = ''
    label = '全部历史'
  } else {
    start = `${key}-01-01`
    label = `${key} 年`
  }
  return {
    key,
    start,
    end: /^\d{4}$/.test(key) && Number(key) < year ? `${key}-12-31` : end,
    label,
  }
}
export function naturalDays(range: ReadingRange): number {
  return range.start
    ? Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1)
    : 0
}
export function duration(seconds: number | null | undefined): string {
  return seconds == null
    ? '暂无数据'
    : `${(seconds / 3600).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 小时`
}
export function group(items: Datum[]): Datum[] {
  const values = new Map<string, number>()
  for (const item of items) values.set(item.label, (values.get(item.label) ?? 0) + item.value)
  return [...values].map(([label, value]) => ({ label, value }))
}
export function longestStreak(days: Datum[]): number {
  let longest = 0,
    current = 0,
    previous = 0
  for (const day of [...days].sort((a, b) => a.label.localeCompare(b.label))) {
    const stamp = Date.parse(day.label)
    current = day.value >= 60 ? (stamp - previous === 86400000 ? current + 1 : 1) : 0
    previous = stamp
    longest = Math.max(longest, current)
  }
  return longest
}

export const catalog = [
  ['核心指标', '时间', '各项单位', 'table'],
  ['月度阅读时长', '时间', '小时', 'bar'],
  ['月度阅读天数', '时间', '天', 'bar'],
  ['阅读日时长分布', '时间', '天', 'bar'],
  ['全年阅读日历', '时间', '分钟', 'heatmap'],
  ['累计阅读时长', '时间', '小时', 'line'],
  ['周期阅读统计', '时间', '各项单位', 'table'],
  ['年度时长比较', '时间', '小时', 'bar'],
  ['单书时长排行', '偏好', '小时', 'bar'],
  ['分类偏好雷达', '偏好', '相对权重', 'radar'],
  ['分类时长排行', '偏好', '小时', 'bar'],
  ['分类阅读树图', '偏好', '小时', 'treemap'],
  ['作者偏好', '偏好', '本', 'bar'],
  ['出版社偏好', '偏好', '本', 'bar'],
  ['阅读与听书', '时间', '小时', 'donut'],
  ['书架内容类型', '书架', '项', 'donut'],
  ['书架分类', '书架', '项', 'bar'],
  ['已读与未读', '书架', '项', 'donut'],
  ['公开与私密', '书架', '项', 'donut'],
  ['归档与书单', '书架', '项', 'bar'],
  ['最近书架活动', '书架', '日期', 'table'],
  ['笔记书籍排行', '笔记', '条', 'bar'],
  ['笔记类型构成', '笔记', '条', 'donut'],
  ['阅读进度与笔记量', '笔记', '条', 'scatter'],
  ['划线与想法词频', '笔记', '次', 'words'],
  ['笔记时间线', '笔记', '条', 'line'],
  ['划线长度分布', '笔记', '条', 'bar'],
] as const

export function emptyModules(range: ReadingRange): ReportModule[] {
  return catalog.map(([title, section, unit, kind], index) => ({
    id: index + 1,
    title,
    section,
    unit,
    kind,
    scope:
      section === '书架'
        ? '当前书架快照'
        : section === '偏好'
          ? '自然年偏好 · 有展示阈值'
          : section === '笔记'
            ? '已读取笔记'
            : `${range.start || '起始日期未知'} — ${range.end}`,
    status: 'unavailable',
    description: '尚未取得该维度的数据。',
    data: [],
    coverage: { expected: null, loaded: 0, failed: 0, complete: false },
  }))
}

const stopWords = new Set([
  '我们',
  '自己',
  '一个',
  '这个',
  '没有',
  '可以',
  '因为',
  '所以',
  '如果',
  '还是',
  '不是',
  '就是',
  '那些',
  '什么',
  '这样',
  '时候',
  '一次',
  '一种',
])
export function wordFrequency(notes: Note[]): Datum[] {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  return group(
    notes.flatMap((note) =>
      [...segmenter.segment(note.text)]
        .filter((w) => w.isWordLike && [...w.segment].length > 1 && !stopWords.has(w.segment))
        .map((w) => ({ label: w.segment, value: 1 })),
    ),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 40)
}

export function noteLocation(note: Note): string {
  return [note.chapter, note.page != null ? `第 ${note.page} 页` : positionLabel(note.range)]
    .filter(Boolean)
    .join(' · ')
}
function positionLabel(range?: string): string {
  return range ? `位置 ${range.replace(/^(\d+)-(\d+)$/, '$1–$2')}` : ''
}
export function periodCells(period: PeriodStatistics) {
  return [
    period.seconds == null ? '—' : duration(period.seconds),
    period.readDays == null ? '—' : `${period.readDays} 天`,
    ...['读过', '读完', '笔记'].map(
      (name) => period.stats.find((stat) => stat.name === name)?.text ?? '—',
    ),
  ]
}
