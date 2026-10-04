import {
  emptyModules,
  getRange,
  group,
  naturalDays,
  shanghaiDate,
  wordFrequency,
  longestStreak,
  preferenceScope,
  bookCategory,
  normalizeNote,
} from '../shared/report'
import type { Book, Datum, Note, RangeKey, ReadingRange, ReadingReport } from '../shared/report'
import { AppError, weread } from './weread'
import type { JsonObject, WeReadEndpoint } from './weread'

export interface Operation {
  id: string
  api: WeReadEndpoint
  params: JsonObject
  attempts?: number
}
export interface CollectorState {
  range: ReadingRange
  queue: Operation[]
  failed: Operation[]
  issues: string[]
  results: Record<string, JsonObject>
  notebookBooks: JsonObject[]
  notes: Note[]
  requests: number
  retryAt?: number
  createdAt: string
}
export const obj = (v: unknown): JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {}
export const arr = (v: unknown): JsonObject[] => (Array.isArray(v) ? v.map(obj) : [])
export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
export const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const timestamp = (date: string) => Math.floor(Date.parse(`${date}T00:00:00+08:00`) / 1000)
const dateOf = (value: unknown) =>
  typeof value === 'number' && value > 0 ? shanghaiDate(new Date(value * 1000)) : undefined
export function newCollector(key: RangeKey, now = new Date()): CollectorState {
  const range = getRange(key, now)
  const queue: Operation[] = [
    { id: 'shelf', api: '/shelf/sync', params: {} },
    ...(!['weekly', 'monthly', 'overall'].includes(key)
      ? [
          {
            id: 'preference',
            api: '/readdata/detail' as const,
            params: { mode: 'annually', baseTime: timestamp(`${range.end.slice(0, 4)}-01-01`) },
          },
        ]
      : []),
    { id: 'notebooks', api: '/user/notebooks', params: { count: 100 } },
  ]
  if (['weekly', 'monthly', 'overall'].includes(key))
    queue.push({
      id: `period:${key}`,
      api: '/readdata/detail',
      params: { mode: key, baseTime: key === 'overall' ? 0 : timestamp(range.start) },
    })
  else {
    // Monthly calls also supply day buckets when annual dailyReadTimes is absent.
    const cursor = new Date(`${range.start}T00:00:00Z`)
    while (cursor.toISOString().slice(0, 10) <= range.end) {
      const start = cursor.toISOString().slice(0, 10)
      queue.push({
        id: `period:${start.slice(0, 7)}`,
        api: '/readdata/detail',
        params: { mode: 'monthly', baseTime: timestamp(start) },
      })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  return {
    range,
    queue,
    failed: [],
    issues: [],
    results: {},
    notebookBooks: [],
    notes: [],
    requests: 0,
    createdAt: now.toISOString(),
  }
}
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()]
}
export async function advanceCollector(
  state: CollectorState,
  key: string,
  call = weread,
): Promise<CollectorState> {
  if (!state.queue.length) return state
  if (state.retryAt && Date.now() < state.retryAt)
    throw new AppError('UPSTREAM_RATE_LIMIT', '请稍后再继续读取。', 429, true)
  if (state.requests >= 600)
    throw new AppError('COLLECTION_BUDGET', '本次采集已达到请求预算，可先下载已有结果。', 409)
  const op = state.queue.shift()!
  state.requests++
  try {
    const result = await call(key, op.api, op.params)
    if (op.api === '/user/notebooks') {
      const books = arr(result.books)
      const previous = new Set(state.notebookBooks.map((b) => str(b.bookId)))
      const unseen = books.filter((b) => str(b.bookId) && !previous.has(str(b.bookId)))
      state.notebookBooks = uniqueBy([...state.notebookBooks, ...books], (b) => str(b.bookId))
      for (const book of unseen) {
        if ((num(book.noteCount) ?? 0) > 0)
          state.queue.push({
            id: `highlights:${str(book.bookId)}`,
            api: '/book/bookmarklist',
            params: { bookId: str(book.bookId) },
          })
        if ((num(book.reviewCount) ?? 0) > 0)
          state.queue.push({
            id: `reviews:${str(book.bookId)}:0`,
            api: '/review/list/mine',
            params: { bookid: str(book.bookId), count: 100, synckey: 0 },
          })
      }
      state.results.notebooks = {
        totalBookCount: result.totalBookCount,
        totalNoteCount: result.totalNoteCount,
      }
      if (result.hasMore === 1) {
        const cursor = num(books.at(-1)?.sort)
        if (!cursor || cursor === op.params.lastSort || !unseen.length)
          throw new AppError('CURSOR_STALLED', '笔记分页没有前进，已保留取得的数据。', 502)
        state.queue.unshift({
          id: `notebooks:${cursor}`,
          api: op.api,
          params: { count: 100, lastSort: cursor },
        })
      }
    } else if (op.api === '/book/bookmarklist' || op.api === '/review/list/mine') {
      const id = str(op.params.bookId ?? op.params.bookid),
        book = obj(state.notebookBooks.find((b) => b.bookId === id)?.book)
      const chapters = new Map(arr(result.chapters).map((c) => [c.chapterUid, str(c.title)]))
      const additions: Note[] =
        op.api === '/book/bookmarklist'
          ? arr(result.updated)
              .filter((n) => n.type === 1 && str(n.bookmarkId) && str(n.markText))
              .map((n) => ({
                id: `h:${str(n.bookmarkId)}`,
                bookId: id,
                title: str(book.title),
                author: str(book.author),
                text: str(n.markText),
                type: 'highlight',
                date: dateOf(n.createTime),
                chapter: chapters.get(n.chapterUid),
                chapterUid: num(n.chapterUid),
              }))
          : arr(result.reviews)
              .map((n) => obj(n.review))
              .filter((n) => str(n.reviewId) && str(n.content))
              .map((n) => ({
                id: `r:${str(n.reviewId)}`,
                bookId: id,
                title: str(book.title),
                author: str(book.author),
                text: str(n.content),
                type: 'thought',
                date: dateOf(n.createTime),
                chapter: str(n.chapterName) || str(n.chapterTitle) || undefined,
                chapterUid: num(n.chapterUid),
                abstract: str(n.abstract) || undefined,
              }))
      state.notes = uniqueBy([...state.notes, ...additions], (n) => n.id)
      if (op.api === '/review/list/mine' && result.hasMore === 1) {
        const cursor = num(result.synckey)
        if (!cursor || cursor === op.params.synckey || !additions.length)
          throw new AppError('CURSOR_STALLED', '想法分页没有前进，已保留取得的数据。', 502)
        state.queue.push({
          id: `reviews:${id}:${cursor}`,
          api: op.api,
          params: { ...op.params, synckey: cursor },
        })
      }
    } else state.results[op.id] = result
  } catch (error) {
    state.failed.push({ ...op, attempts: (op.attempts ?? 0) + 1 })
    const message = error instanceof AppError ? error.message : '部分内容读取失败，可稍后重试。'
    if (!state.issues.includes(message)) state.issues.push(message)
    if (error instanceof AppError && error.code === 'UPSTREAM_RATE_LIMIT')
      state.retryAt = Date.now() + (error.retryAfter ?? 60) * 1000
    if (
      error instanceof AppError &&
      ['WEREAD_KEY_INVALID', 'UPSTREAM_UPGRADE', 'UPSTREAM_RATE_LIMIT'].includes(error.code)
    )
      throw error
  }
  return state
}
export function normalizeShelf(raw: JsonObject, notebooks: JsonObject[] = []): Book[] {
  const lookup = new Map(notebooks.map((n) => [str(n.bookId), n]))
  const books: Book[] = arr(raw.books).map((b) => {
    const note = lookup.get(str(b.bookId)),
      progress = num(note?.readingProgress)
    return {
      id: str(b.bookId),
      title: str(b.title) || '未命名书籍',
      author: str(b.author),
      cover: str(b.cover),
      ...bookCategory(str(b.category)),
      kind: 'book',
      finished: b.finishReading === 1 ? true : b.finishReading === 0 ? false : undefined,
      progress: progress != null && progress >= 0 && progress <= 100 ? progress : undefined,
      secret: b.secret === 0 ? false : b.secret === 1 ? true : undefined,
      updatedAt: dateOf(b.readUpdateTime),
      noteCount:
        note && [note.noteCount, note.reviewCount, note.bookmarkCount].every((n) => num(n) != null)
          ? Number(note.noteCount) + Number(note.reviewCount) + Number(note.bookmarkCount)
          : undefined,
    }
  })
  for (const album of arr(raw.albums)) {
    const b = obj(album.albumInfo),
      extra = obj(album.albumInfoExtra)
    books.push({
      id: `audio:${str(b.albumId)}`,
      title: str(b.name) || '未命名有声内容',
      author: str(b.authorName),
      cover: str(b.cover),
      category: '有声内容',
      kind: 'audio',
      secret: extra.secret === 0 ? false : extra.secret === 1 ? true : undefined,
      updatedAt: dateOf(extra.lectureReadUpdateTime),
    })
  }
  if (Object.keys(obj(raw.mp)).length)
    books.push({
      id: 'article-collection',
      title: '文章收藏',
      author: '',
      category: '文章收藏',
      kind: 'article',
      secret: true,
    })
  return books
}
export function buildReport(state: CollectorState): ReadingReport {
  const { range, results } = state,
    modules = emptyModules(range)
  const periods = Object.entries(results)
    .filter(([key]) => key.startsWith('period:'))
    .sort(([a], [b]) => a.localeCompare(b))
  const periodLabel = (key: string) =>
    ['weekly', 'monthly', 'overall'].includes(range.key) ? range.label : key.slice(7)
  const outstandingPeriods = [...state.queue, ...state.failed].some((op) =>
    op.id.startsWith('period:'),
  )
  const completePeriods = periods.length > 0 && !outstandingPeriods
  const timeKnown = completePeriods && periods.every(([, p]) => num(p.totalReadTime) != null)
  const daysKnown = completePeriods && periods.every(([, p]) => num(p.readDays) != null)
  const seconds = timeKnown
    ? periods.reduce((sum, [, p]) => sum + Number(p.totalReadTime), 0)
    : null
  const readDays = daysKnown ? periods.reduce((sum, [, p]) => sum + Number(p.readDays), 0) : null
  const expected = num(results.notebooks?.totalBookCount) ?? null
  const covered = state.notebookBooks.filter(
    (b) =>
      ![...state.queue, ...state.failed].some(
        (op) => op.params.bookId === b.bookId || op.params.bookid === b.bookId,
      ),
  ).length
  const coverage = {
    expected,
    loaded: covered,
    failed: new Set(
      state.failed
        .filter((op) => op.params.bookId || op.params.bookid)
        .map((op) => op.params.bookId ?? op.params.bookid),
    ).size,
    complete: !state.queue.length && !state.failed.length,
  }
  const notes = state.notes
    .filter((n) => !n.date || ((!range.start || n.date >= range.start) && n.date <= range.end))
    .map(normalizeNote)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const books = normalizeShelf(results.shelf ?? {}, state.notebookBooks)
  const daily: Datum[] = periods
    .flatMap(([, p]) => {
      if (range.key === 'overall') return []
      return Object.entries(obj(p.readTimes))
        .filter(([, v]) => num(v) != null)
        .map(([t, v]) => ({ label: shanghaiDate(new Date(Number(t) * 1000)), value: Number(v) }))
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  const months: Datum[] = periods
    .map(([key, p]) => ({
      label: periodLabel(key),
      value: num(p.totalReadTime) != null ? Number(p.totalReadTime) / 3600 : NaN,
    }))
    .filter((d) => Number.isFinite(d.value))
  const set = (
    id: number,
    data: Datum[] | null,
    description: string,
    scope?: string,
    complete = true,
  ) => {
    Object.assign(modules[id - 1], {
      data: data ?? [],
      description,
      scope: scope ?? modules[id - 1].scope,
      status:
        data === null ? 'unavailable' : data.length ? (complete ? 'ready' : 'partial') : 'empty',
      coverage: {
        expected: data?.length ?? null,
        loaded: data?.length ?? 0,
        failed: 0,
        complete: data !== null && complete,
      },
    })
  }
  set(
    1,
    seconds != null
      ? [
          { label: '阅读时长', value: seconds / 3600, unit: '小时' },
          ...(readDays != null ? [{ label: '阅读天数', value: readDays, unit: '天' }] : []),
        ]
      : null,
    '总量来自不重叠的自然周期 totalReadTime。',
  )
  set(
    2,
    range.key === 'overall' ? null : months,
    range.key === 'overall'
      ? '全部历史未自动逐月采集，请选择最近 24 个月或自然年。'
      : '自然周期总时长；正在读取的月份尚未计入。',
    undefined,
    completePeriods,
  )
  set(
    3,
    range.key === 'overall'
      ? null
      : periods
          .filter(([, p]) => num(p.readDays) != null)
          .map(([key, p]) => ({ label: periodLabel(key), value: Number(p.readDays) })),
    '自然周期的有效阅读天数，每日满 1 分钟。',
    undefined,
    completePeriods,
  )
  set(
    4,
    daily.length
      ? group(
          daily
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
        )
      : null,
    '根据已取得的日明细统计，不从年度汇总推造。',
    undefined,
    completePeriods,
  )
  set(
    5,
    daily.length ? daily.map((d) => ({ ...d, value: d.value / 60 })) : null,
    '每格代表一天，按周排列；仅按已取得的日明细高亮。浅色为未阅读、统计范围外或未取得日明细的日期。',
    undefined,
    completePeriods,
  )
  let cumulative = 0
  set(
    6,
    range.key === 'overall' ? null : months.map((m) => ({ ...m, value: (cumulative += m.value) })),
    '按已取得且不重叠的周期累积。',
    undefined,
    completePeriods,
  )
  set(
    7,
    periods.length ? [] : null,
    '时长和阅读日来自周期统计，摘要保留原始文案；不同单位分别展示。',
    undefined,
    completePeriods,
  )
  modules[6].periods = periods
    .map(([key, p]) => {
      const month = key.slice(7)
      const monthly = /^\d{4}-\d{2}$/.test(month)
      const start = monthly ? `${month}-01` : range.start || dateOf(p.registTime) || ''
      const end = monthly
        ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
            .toISOString()
            .slice(0, 10)
        : range.end
      return {
        label: periodLabel(key),
        start,
        end: end < range.end ? end : range.end,
        seconds: num(p.totalReadTime),
        readDays: num(p.readDays),
        stats: arr(p.readStat).map((stat) => ({ name: str(stat.stat), text: str(stat.counts) })),
      }
    })
    .reverse()
  if (periods.length) modules[6].status = completePeriods ? 'ready' : 'partial'
  modules[6].coverage = {
    expected:
      periods.length +
      [...state.queue, ...state.failed].filter((op) => op.id.startsWith('period:')).length,
    loaded: periods.length,
    failed: state.failed.filter((op) => op.id.startsWith('period:')).length,
    complete: completePeriods,
  }
  if (['weekly', 'monthly'].includes(range.key)) {
    modules[1].title = '周期阅读时长'
    modules[2].title = '周期阅读天数'
  }
  set(
    8,
    range.key === 'overall'
      ? Object.entries(obj(periods[0]?.[1].readTimes))
          .filter(([, v]) => num(v) != null)
          .map(([t, v]) => ({
            label: shanghaiDate(new Date(Number(t) * 1000)).slice(0, 4),
            value: Number(v) / 3600,
          }))
      : group(
          months.map((m) => ({
            label: /^\d{4}/.test(m.label) ? m.label.slice(0, 4) : range.end.slice(0, 4),
            value: m.value,
          })),
        ),
    '范围内的年度片段，当前年不是完整自然年。',
    undefined,
    completePeriods,
  )
  const prefId = ['weekly', 'monthly', 'overall'].includes(range.key)
    ? `period:${range.key}`
    : 'preference'
  const pref = results[prefId],
    prefScope = preferenceScope(
      range.key === 'overall' && dateOf(pref?.registTime)
        ? { ...range, start: dateOf(pref?.registTime)! }
        : range,
    )
  const categories = arr(pref?.preferCategory).filter((c) => num(c.readingTime) != null)
  set(
    9,
    Array.isArray(pref?.readLongest)
      ? arr(pref.readLongest)
          .map((b) => ({
            label: str(obj(b.book).title) || str(obj(b.albumInfo).name),
            value: num(b.readTime) == null ? NaN : Number(b.readTime) / 3600,
          }))
          .filter((b) => Number.isFinite(b.value))
      : null,
    '最多 10 条，低于 5 分钟的条目可能被过滤；不合并跨年榜单。',
    prefScope,
  )
  const categoryData = categories.map((c) => ({
    label: str(c.categoryTitle),
    value: Number(c.readingTime) / 3600,
  }))
  set(
    10,
    Array.isArray(pref?.preferCategory)
      ? arr(pref.preferCategory)
          .filter((c) => num(c.val) != null || num(c.readingTime) != null)
          .map((c) => ({
            label: str(c.categoryTitle),
            value:
              num(c.val) ??
              (Number(c.readingTime) /
                Math.max(1, ...categories.map((x) => Number(x.readingTime)))) *
                100,
          }))
      : null,
    '相对最大分类的时长权重，不是占比；缺少 val 时按已返回的分类时长归一化。',
    prefScope,
  )
  set(
    11,
    Array.isArray(pref?.preferCategory) ? categoryData : null,
    '仅统计已返回且有数值时长的分类。',
    prefScope,
  )
  set(
    12,
    Array.isArray(pref?.preferCategory) ? categoryData : null,
    '分类面积按阅读时长；默认占位分类不补零。',
    prefScope,
  )
  set(
    13,
    Array.isArray(pref?.preferAuthor)
      ? arr(pref.preferAuthor)
          .filter((a) => num(a.count) != null)
          .map((a) => ({
            label: str(a.name),
            value: Number(a.count),
            readTime: str(a.readTime).trim() || undefined,
          }))
          .sort((a, b) => b.value - a.value)
      : null,
    '仅含上游返回的作者，榜单可能截断；未达展示阈值不代表零。',
    prefScope,
  )
  set(
    14,
    Array.isArray(pref?.preferPublisher)
      ? arr(pref.preferPublisher)
          .filter((p) => num(p.count) != null)
          .map((p) => ({ label: str(p.name), value: Number(p.count) }))
      : null,
    '出版社字段有展示阈值，未返回不代表零。',
    prefScope,
  )
  for (const module of modules.slice(8, 14)) {
    if (!pref) {
      module.description = state.queue.some((op) => op.id === prefId)
        ? '正在读取对应周期的排行与偏好。'
        : state.failed.some((op) => op.id === prefId)
          ? '对应周期的排行与偏好读取失败，可重试剩余部分。'
          : '旧报告缺少对应周期的偏好来源，请重新读取。'
    } else if (module.status === 'unavailable') {
      module.description = `此周期未返回该偏好字段，不代表零。${module.description}`
    } else if (module.status === 'empty') {
      const field =
        module.id === 9
          ? 'readLongest'
          : module.id === 13
            ? 'preferAuthor'
            : module.id === 14
              ? 'preferPublisher'
              : 'preferCategory'
      if (arr(pref[field]).length) {
        module.status = 'unavailable'
        module.coverage.complete = false
        module.description = '上游条目未提供可用数值，不以零补齐。'
      }
    }
  }
  set(
    15,
    completePeriods &&
      periods.every(([, p]) => num(p.wrReadTime) != null && num(p.wrListenTime) != null)
      ? [
          {
            label: '文字阅读',
            value: periods.reduce((s, [, p]) => s + Number(p.wrReadTime), 0) / 3600,
          },
          {
            label: '听书',
            value: periods.reduce((s, [, p]) => s + Number(p.wrListenTime), 0) / 3600,
          },
        ]
      : null,
    '上游只在达到展示条件时返回阅读/听书时长；缺失时不推算。',
  )
  set(
    16,
    results.shelf
      ? group(
          books.map((b) => ({
            label: b.kind === 'book' ? '电子书' : b.kind === 'audio' ? '有声书' : '文章收藏入口',
            value: 1,
          })),
        )
      : null,
    '电子书 + 有声专辑 + 非空文章收藏入口。',
  )
  set(
    17,
    results.shelf ? group(books.map((b) => ({ label: b.category, value: 1 }))) : null,
    '按当前快照分类，未知分类单独显示。',
  )
  set(
    18,
    results.shelf
      ? group(
          books.map((b) => ({
            label:
              b.kind !== 'book'
                ? '有声/文章 · 不适用'
                : b.finished === undefined
                  ? '状态未知'
                  : b.finished
                    ? '已读完'
                    : '未读完',
            value: 1,
          })),
        )
      : null,
    '电子书完成状态；有声完结不当作读完。',
  )
  set(
    19,
    results.shelf
      ? group(
          books.map((b) => ({
            label: b.secret === undefined ? '状态未知' : b.secret ? '私密阅读' : '公开阅读',
            value: 1,
          })),
        )
      : null,
    '逐项计算私密与公开；文章收藏入口计入私密。',
  )
  set(
    20,
    results.shelf
      ? arr(results.shelf.archive).map((a) => ({
          label: str(a.name),
          value:
            (Array.isArray(a.bookIds) ? a.bookIds.length : 0) +
            (Array.isArray(a.albumIds) ? a.albumIds.length : 0),
        }))
      : null,
    '书单成员可能重叠，不作为书架总数。',
  )
  set(
    21,
    results.shelf
      ? books
          .filter((b) => b.updatedAt)
          .sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))
          .slice(0, 20)
          .map((b) => ({ label: `${b.title} · ${b.updatedAt}`, value: 1 }))
      : null,
    '每本书最近一次活动，最多显示 20 条，不代表完整历史。',
  )
  const notebooksComplete = ![...state.queue, ...state.failed].some(
    (op) => op.api === '/user/notebooks',
  )
  set(
    22,
    results.notebooks
      ? state.notebookBooks
          .map((b) => ({
            label: str(obj(b.book).title),
            value:
              (num(b.noteCount) ?? 0) + (num(b.reviewCount) ?? 0) + (num(b.bookmarkCount) ?? 0),
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 20)
      : null,
    '累计笔记最多的 20 本书；包含书签。',
    '累计笔记',
    notebooksComplete,
  )
  set(
    23,
    results.notebooks
      ? ['noteCount', 'reviewCount', 'bookmarkCount'].map((key, i) => ({
          label: ['划线', '想法/点评', '书签'][i],
          value: state.notebookBooks.reduce((s, b) => s + (num(b[key]) ?? 0), 0),
        }))
      : null,
    '想法已含点评，不重复计数；书签只有数量。',
    '已读取笔记本的累计笔记',
    notebooksComplete,
  )
  set(
    24,
    results.notebooks
      ? state.notebookBooks
          .filter((b) => num(b.readingProgress) != null)
          .map((b) => ({
            label: str(obj(b.book).title),
            value:
              (num(b.noteCount) ?? 0) + (num(b.reviewCount) ?? 0) + (num(b.bookmarkCount) ?? 0),
            secondary: Number(b.readingProgress),
          }))
      : null,
    '进度 1 表示 1%；横轴为进度，纵轴为累计笔记。',
    '当前进度 × 累计笔记',
    notebooksComplete,
  )
  set(
    25,
    notes.length || coverage.complete ? wordFrequency(notes) : null,
    '中文分词去除常见停用词；只代表已读取文本的词频。',
    '区间内已读取文本',
    coverage.complete,
  )
  set(
    26,
    notes.length || coverage.complete
      ? group(
          notes.filter((n) => n.date).map((n) => ({ label: n.date!.slice(0, 7), value: 1 })),
        ).sort((a, b) => a.label.localeCompare(b.label))
      : null,
    '创建日期未知的笔记不纳入时间线。',
    '区间内已读取文本',
    coverage.complete,
  )
  set(
    27,
    notes.length || coverage.complete
      ? group(
          notes
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
        )
      : null,
    '按 Unicode 字符计数，包含标点，不含个人想法。',
    '区间内已读取划线',
    coverage.complete,
  )
  const selections = notes.filter((n) => n.type === 'highlight').slice(0, 20)
  const effectiveRange =
    range.key === 'overall' && num(periods[0]?.[1].registTime)
      ? { ...range, start: dateOf(periods[0][1].registTime)! }
      : range
  return {
    meta: {
      version: 1,
      sampleReport: false,
      source: 'account',
      generatedAt: state.createdAt,
      timezone: 'Asia/Shanghai',
    },
    range: effectiveRange,
    summary: {
      seconds,
      readDays,
      naturalDays: naturalDays(effectiveRange),
      shelfCount: results.shelf ? books.length : null,
      noteCount: num(results.notebooks?.totalNoteCount) ?? null,
    },
    modules,
    books,
    notes,
    portrait: {
      title: '阅读，留下自己的纹理。',
      text:
        readDays != null
          ? `在所选周期里，你有 ${readDays} 个有效阅读日。${completePeriods && daily.length ? `已取得日明细中，最长连续阅读 ${longestStreak(daily)} 天。` : '完整的日节律仍需更多明细。'}`
          : '阅读数据正在逐步补齐。每一个安静读书的片刻，都值得被看见。',
      evidence: [
        `范围：${effectiveRange.start || '起始日期未知'} — ${range.end}`,
        '总时长使用不重叠周期的官方汇总',
        '画像由阅纹按已取得的指标归纳',
      ],
      quote: selections[0] ?? null,
      selections,
    },
    coverage,
    issues: [
      ...state.issues,
      `${preferenceScope(range)}；偏好榜单有截断与展示阈值，当前书架与累计笔记不受时间筛选限制。`,
      ...(notes.some((n) => !n.date)
        ? ['部分笔记没有创建日期，保留在检索中，但未纳入笔记时间线。']
        : []),
    ],
  }
}
