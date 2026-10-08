import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { app, handleError, parseRange } from './app'
import type { AppEnv } from './connections'
import { advanceCollector, buildReport, newCollector, num, obj, str } from './collector'
import type { CollectorState } from './collector'
import { AppError, weread } from './weread'
import { bookCategory } from '../shared/report'

// This router is never imported by the production Functions entry.
const local = new Hono<AppEnv>()
const reports = new Map<
  string,
  { state: CollectorState; id: string; version: number; stopped: boolean; expires: number }
>()
let advancing = false
local.use('/api/dev/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  const origin = c.req.header('origin')
  if (
    c.req.header('x-yuewen-local') !== '1' ||
    (origin && origin !== (process.env.APP_URL ?? 'http://127.0.0.1:5173'))
  )
    throw new AppError('UNTRUSTED_ORIGIN', '请从本地阅纹页面访问开发数据。', 403)
  if (process.env.WEREAD_DEMO_MODE === 'mock')
    throw new AppError('DEV_MOCK_MODE', '当前为模拟演示模式。', 409)
  if (!process.env.WEREAD_API_KEY)
    throw new AppError('DEV_KEY_REQUIRED', '本地尚未配置微信读书 Key，可手动切换模拟示例。', 409)
  for (const [range, entry] of reports) if (entry.expires < Date.now()) reports.delete(range)
  await next()
})
local.get('/api/dev/source', (c) => c.json({ source: 'development' }))
local.post('/api/dev/report', async (c) => {
  const body = await c.req.json()
  const range = parseRange(body.range)
  if (advancing) throw new AppError('REPORT_BUSY', '这一批正在读取，请稍后重试。', 409)
  let entry = reports.get(range)
  if (!entry || body.fresh === true) {
    entry = {
      state: newCollector(range),
      id: randomUUID(),
      version: 0,
      stopped: false,
      expires: Date.now() + 7200000,
    }
    reports.set(range, entry)
  }
  if (body.action === 'cancel') entry.stopped = true
  if (body.action === 'retry') {
    if (entry.state.budgetReached || entry.state.requests >= 600)
      throw new AppError('COLLECTION_BUDGET', '已达到请求预算，请下载已有结果。', 409)
    entry.state.queue.push(...entry.state.failed)
    entry.state.failed = []
    entry.state.issues = []
    entry.state.issueCode = undefined
    entry.stopped = false
  }
  if (!entry.stopped && entry.state.queue.length) {
    advancing = true
    const previous = structuredClone(entry.state)
    try {
      await advanceCollector(entry.state, process.env.WEREAD_API_KEY!)
      if (
        Buffer.byteLength(JSON.stringify(entry.state)) > 1500000 ||
        entry.state.notes.length > 10000
      ) {
        const requests = entry.state.requests
        entry.state = { ...previous, requests, budgetReached: true }
        throw new AppError('COLLECTION_BUDGET', '达到本次内容预算，已保留取得的结果。', 409)
      }
    } catch (error) {
      entry.stopped = true
      entry.state.issueCode = error instanceof AppError ? error.code : 'COLLECTION_ERROR'
      if (entry.state.issueCode === 'COLLECTION_BUDGET') entry.state.budgetReached = true
      const message = error instanceof AppError ? error.message : '采集暂停，请重试。'
      if (!entry.state.issues.includes(message)) entry.state.issues.push(message)
    } finally {
      advancing = false
    }
    entry.version++
  }
  const report = buildReport(entry.state)
  report.meta.source = 'development'
  const status =
    entry.stopped || (!entry.state.queue.length && entry.state.failed.length)
      ? 'partial'
      : entry.state.queue.length
        ? 'running'
        : 'completed'
  return c.json({
    id: entry.id,
    version: entry.version,
    keyVersion: 0,
    status,
    report,
    notesComplete: true,
    retryAllowed:
      !entry.state.budgetReached &&
      entry.state.requests < 600 &&
      entry.state.issueCode !== 'WEREAD_KEY_INVALID',
    issueCode: entry.state.issueCode,
    noteTotal: report.notes.length,
    stage:
      status === 'running'
        ? `正在读取 · 笔记已读取 ${report.coverage.loaded}/${report.coverage.expected ?? '未知'} 本`
        : status === 'completed'
          ? '采集完成'
          : '已有结果已保留',
  })
})
local.get('/api/dev/books/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^[\w-]{1,100}$/.test(id)) throw new AppError('INVALID_INPUT', '书籍标识无效。', 400)
  const [info, progress] = await Promise.all([
    weread(process.env.WEREAD_API_KEY!, '/book/info', { bookId: id }),
    weread(process.env.WEREAD_API_KEY!, '/book/getprogress', { bookId: id }),
  ])
  return c.json({
    title: str(info.title),
    author: str(info.author),
    cover: str(info.cover) || undefined,
    publisher: str(info.publisher),
    description: str(info.intro),
    ...(str(info.category).trim() ? bookCategory(str(info.category)) : {}),
    progress: num(obj(progress.book).progress),
  })
})
local.route('/', app)
local.onError(handleError)
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: local.fetch, hostname: '127.0.0.1', port }, () =>
  console.log(`阅纹 API：http://127.0.0.1:${port}`),
)
