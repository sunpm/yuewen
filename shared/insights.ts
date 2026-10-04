import { naturalDays, longestStreak, shanghaiDate } from './report'
import type { ReadingReport, Datum, PeriodStatistics } from './report'
export interface Metric {
  label: string
  value: number | null
  unit: string
  reason: string
  numerator?: number
  denominator?: number
}
export interface Insights {
  months: {
    month: string
    period: PeriodStatistics
    books: { title: string; seconds: number }[] | null
  }[]
  scope: string
  metrics: Metric[]
  hourly: { scope: string; data: Datum[]; reason: string }
  comparison: { periods: PeriodStatistics[]; metrics: Metric[]; reason: string }
  density: {
    bookId: string
    title: string
    value: number | null
    count: number
    seconds: number | null
    partial: boolean
    reason: string
  }[]
}
export function buildInsights(
  report: ReadingReport,
  input: {
    daily: Datum[]
    hourly?: number[]
    hourlyScope: string
    bookTimes: Map<string, number>
    loadedBooks: Set<string>
    monthlyBooks?: Record<string, { title: string; seconds: number }[]>
  },
): Insights {
  const { range, summary } = report
  const days = naturalDays(range)
  const scope = `${range.start || '起始日期未知'} — ${range.end}`
  const daily = [
    ...new Map(
      input.daily
        .filter((d) => d.label >= range.start && d.label <= range.end)
        .map((d) => [d.label, d]),
    ).values(),
  ]
  const completeDays =
    !!range.start && days > 0 && daily.length === days && report.modules[4].coverage.complete
  const metrics: Metric[] = [
    {
      label: '自然日均阅读时长',
      value: days && summary.seconds != null ? summary.seconds / 60 / days : null,
      unit: '分钟／天',
      numerator: summary.seconds == null ? undefined : summary.seconds / 60,
      denominator: days || undefined,
      reason: days
        ? '官方总分钟数 ÷ 范围内自然日数，含起止日。'
        : '起始日期未知，无法确定自然日分母。',
    },
    {
      label: '阅读日均时长',
      value:
        summary.seconds != null && summary.readDays != null && summary.readDays > 0
          ? summary.seconds / 60 / summary.readDays
          : null,
      unit: '分钟／阅读日',
      numerator: summary.seconds == null ? undefined : summary.seconds / 60,
      denominator: summary.readDays ?? undefined,
      reason:
        summary.readDays === 0
          ? '无有效阅读日。'
          : summary.readDays == null
            ? '官方有效阅读日数未取得。'
            : '官方总分钟数 ÷ 同范围官方有效阅读日数。',
    },
    {
      label: '阅读活跃率',
      value: days && summary.readDays != null ? (summary.readDays / days) * 100 : null,
      unit: '%',
      numerator: summary.readDays ?? undefined,
      denominator: days || undefined,
      reason: '同范围官方有效阅读日数 ÷ 自然日数；未知字段不计为零。',
    },
    {
      label: '最长连续阅读',
      value: completeDays ? longestStreak(daily) : null,
      unit: '天',
      reason: completeDays
        ? '完整日明细中，每日满 60 秒，按上海相邻日期计算。'
        : '当前范围日明细不完整，无法确定整个周期的最长连续值。',
    },
  ]
  if (summary.seconds == null)
    for (const metric of metrics.slice(0, 2)) metric.reason = '同范围官方总时长尚未取得。'
  const end = new Date(`${range.end}T00:00:00Z`)
  const currentMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10)
  const latest =
    range.end === monthEnd && range.end < shanghaiDate(new Date(report.meta.generatedAt))
      ? currentMonth
      : Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)
  const latestDate = new Date(latest)
  const stamps = [Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - 1, 1), latest]
  const periods = stamps.map((stamp) => {
    const date = new Date(stamp),
      start = date.toISOString().slice(0, 10),
      finish = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10)
    return report.modules[6].periods?.find(
      (p) => p.start === start && p.end === finish && start >= range.start && finish <= range.end,
    )
  })
  const comparable =
    !['weekly', 'monthly', 'overall'].includes(range.key) && periods.every((p) => p != null)
  const changes: Metric[] = []
  if (comparable)
    for (const [field, label, unit, divisor] of [
      ['seconds', '阅读时长', '小时', 3600],
      ['readDays', '有效阅读日', '天', 1],
    ] as const) {
      const previous = periods[0]![field],
        current = periods[1]![field]
      const known = previous != null && current != null
      changes.push({
        label: `${label}变化量`,
        value: known ? (current - previous) / divisor : null,
        unit,
        reason: known ? '本期 − 上期。' : '相邻月份缺少该字段，无法比较。',
      })
      changes.push({
        label: `${label}变化率`,
        value: known && previous > 0 ? ((current - previous) / previous) * 100 : null,
        unit: '%',
        reason: !known
          ? '相邻月份缺少该字段。'
          : previous === 0
            ? '基期为零，不计算百分比。'
            : '变化量 ÷ 上期 × 100%。',
      })
    }
  const notes = [...new Map(report.notes.map((n) => [n.id, n])).values()]
  const density = report.books.map((book) => {
    const seconds = input.bookTimes.get(book.id) ?? null
    const all = notes.filter((n) => n.bookId === book.id)
    const count = all.filter((n) => n.date && n.date >= range.start && n.date <= range.end).length
    const loaded = input.loadedBooks.has(book.id)
    const partial = !report.coverage.complete || !loaded || all.some((n) => !n.date)
    const reason =
      seconds == null
        ? '缺少同书、同范围的官方数值时长；不使用其他周期榜单。'
        : seconds === 0
          ? '同范围阅读时长为零，无法计算密度。'
          : !loaded && count === 0
            ? '该书正文尚未读取完整，不将暂时空列表计为零。'
            : partial
              ? '仅计算日期可定位的已采集条目，属于部分覆盖。'
              : '按稳定 ID 去重的划线与想法 ÷ 同范围阅读小时，不包含书签或重复引用原文。'
    return {
      bookId: book.id,
      title: book.title,
      value:
        seconds != null && seconds > 0 && (loaded || count > 0) ? count / (seconds / 3600) : null,
      count,
      seconds,
      partial,
      reason,
    }
  })
  return {
    scope,
    months: (report.modules[6].periods ?? [])
      .filter((p) => p.start.endsWith('-01') && p.start.slice(0, 7) === p.end.slice(0, 7))
      .map((period) => ({
        month: period.start.slice(0, 7),
        period,
        books: input.monthlyBooks?.[period.start.slice(0, 7)] ?? null,
      })),
    metrics,
    hourly: {
      scope: input.hourlyScope,
      data:
        input.hourly?.map((value, i) => ({ label: `${(i + 6) % 24} 时`, value: value / 3600 })) ??
        [],
      reason: input.hourly
        ? '按 6 时至次日 5 时排列，单位：小时。'
        : '对应周期未返回完整的 24 项时段分布，不从日汇总推算。',
    },
    comparison: {
      periods: comparable ? (periods as PeriodStatistics[]) : [],
      metrics: changes,
      reason: comparable
        ? '当前范围内最近两个相邻、完整自然月；月长按真实自然日。'
        : '当前范围内没有两个可比的完整月份。',
    },
    density,
  }
}
