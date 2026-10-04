import { weread } from '../server/weread.ts'
const key = process.env.WEREAD_API_KEY
if (!key) throw new Error('请先在本地 .env 配置 WEREAD_API_KEY。')
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value))
    return {
      type: 'array',
      length: value.length,
      item: depth < 4 ? shape(value[0], depth + 1) : undefined,
    }
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([k, v]) => [
          /^\d+$/.test(k) ? '<timestamp>' : k,
          depth < 4 ? shape(v, depth + 1) : typeof v,
        ]),
    )
  return typeof value
}
const shelfOnly = process.argv.includes('--shelf')
const requests = [
  ['/shelf/sync', {}],
  ['/readdata/detail', { mode: 'annually' }],
  ['/readdata/detail', { mode: 'monthly' }],
  ['/readdata/detail', { mode: 'weekly' }],
  ['/readdata/detail', { mode: 'overall', baseTime: 0 }],
  ['/user/notebooks', { count: 10 }],
] as const
for (const [api, params] of shelfOnly ? requests.slice(0, 1) : requests) {
  const start = Date.now()
  try {
    const data = await weread(key, api, params)
    console.log(JSON.stringify({ api, params, elapsedMs: Date.now() - start, shape: shape(data) }))
    if (shelfOnly && Array.isArray(data.books)) {
      const books = data.books as Record<string, unknown>[]
      console.log(JSON.stringify({ categories: [...new Set(books.map((b) => b.category))] }))
      for (const imported of [false, true]) {
        const book = books.find((b) => !String(b.category ?? '').trim() === imported)
        if (!book) continue
        for (const endpoint of ['/book/info', '/book/getprogress'] as const) {
          try {
            const detail = await weread(key, endpoint, { bookId: book.bookId })
            console.log(
              JSON.stringify({
                api: endpoint,
                imported,
                category: detail.category,
                shape: shape(detail),
              }),
            )
          } catch (error) {
            process.exitCode = 1
            console.log(
              JSON.stringify({
                api: endpoint,
                imported,
                error: error instanceof Error ? error.message : '读取失败',
              }),
            )
          }
        }
      }
    }
    if (api === '/user/notebooks' && Array.isArray(data.books) && data.books.length) {
      const first = (data.books.find((b) => Number((b as Record<string, unknown>).noteCount) > 0) ??
        data.books[0]) as Record<string, unknown>
      for (const endpoint of [
        '/book/bookmarklist',
        '/review/list/mine',
        '/book/getprogress',
      ] as const) {
        const detail = await weread(
          key,
          endpoint,
          endpoint === '/review/list/mine'
            ? { bookid: first.bookId, count: 2 }
            : { bookId: first.bookId },
        )
        console.log(JSON.stringify({ api: endpoint, shape: shape(detail) }))
      }
      if (data.hasMore === 1) {
        const last = data.books.at(-1) as Record<string, unknown>
        const page = await weread(key, '/user/notebooks', { count: 2, lastSort: last.sort })
        console.log(
          JSON.stringify({
            api: '/user/notebooks page 2',
            shape: shape(page),
            cursorAdvanced:
              Array.isArray(page.books) &&
              (page.books[0] as Record<string, unknown>)?.bookId !==
                (data.books[0] as Record<string, unknown>).bookId,
          }),
        )
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ api, error: error instanceof Error ? error.message : '读取失败' }))
    process.exitCode = 1
    break
  }
}
