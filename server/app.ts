import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createDemo } from '../shared/demo'
import { isRangeKey, type RangeKey } from '../shared/report'
import { ARCHIVE_LIMIT, ARCHIVE_MAX_BYTES, type ArchivedReport } from '../shared/archive'
import type { ReportTask } from '../shared/connection'
import { protect, type Bindings } from './access'
import {
  advanceCollector,
  buildReport,
  collectionProgress,
  continueCollector,
  newCollector,
  type CollectorState,
} from './collector'
import { read, save } from './storage'
import { AppError } from './weread'

type Current = {
  id: string
  credentialTag: string
  version: number
  requestId: string
  status: ReportTask['status']
  state: CollectorState
  expiresAt: string
}
async function credentialTag(key: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')
}
export const app = new Hono<{ Bindings: Bindings }>()
export function parseRange(value: unknown): RangeKey {
  if (!isRangeKey(value)) throw new AppError('INVALID_INPUT', '请选择有效的时间范围。', 400)
  return value
}
function dto(value: Current): ReportTask {
  const report = buildReport(value.state)
  report.meta.source = 'instance'
  const noteTotal = report.notes.length
  report.notes = report.notes.slice(0, 200)
  return {
    id: value.id,
    version: value.version,
    keyVersion: 1,
    status: value.status,
    stage: value.status === 'running' ? '正在读取阅读数据' : '已有结果已保留',
    report,
    noteTotal,
    notesComplete: noteTotal <= 200,
    expiresAt: value.expiresAt,
    idleExpiresAt: value.expiresAt,
    serverTime: new Date().toISOString(),
    ...collectionProgress(value.state),
    issueCode: value.state.issueCode,
  }
}
async function current(db: D1Database, id?: string) {
  const row = await read<Current>(db, 'current')
  if (!row || (id && row.value.id !== id) || Date.parse(row.value.expiresAt) <= Date.now())
    throw new AppError('REPORT_EXPIRED', '当前报告已到期或被替换，请重新生成。', 404)
  return row
}
const target = (value?: Current) => ({ id: value?.id ?? null, keyVersion: 1 })
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  if (!['/api/health', '/api/demo'].includes(c.req.path)) await protect(c.req.raw, c.env)
  await next()
})
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 8192,
    onError: (c) => c.json({ code: 'INVALID_INPUT', message: '请求过大。' }, 413),
  }),
)
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.get('/api/demo', (c) => c.json(createDemo(parseRange(c.req.query('range') ?? 'recent'))))
app.get('/api/connections', (c) =>
  c.json({
    serverTime: new Date().toISOString(),
    instance: {
      status: c.env.WEREAD_API_KEY ? 'valid' : 'missing',
      context: 'instance',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  }),
)
app.get('/api/session/reports', async (c) => {
  const row = await read<Current>(c.env.DB, 'current')
  return c.json(row && Date.parse(row.value.expiresAt) > Date.now() ? [dto(row.value)] : [])
})
app.delete('/api/session/reports', async (c) => {
  await c.env.DB.prepare("DELETE FROM entity WHERE id='current'").run()
  return c.body(null, 204)
})
app.get('/api/reports/target', async (c) => {
  const row = await read<Current>(c.env.DB, 'current')
  return c.json(target(row && Date.parse(row.value.expiresAt) > Date.now() ? row.value : undefined))
})
app.post('/api/reports', async (c) => {
  if (!c.env.WEREAD_API_KEY)
    throw new AppError('WEREAD_KEY_MISSING', '请在部署环境设置微信读书读取授权。', 409)
  const body = await c.req.json<{
    range: unknown
    requestId: string
    expected?: { id: string | null }
    replace?: boolean
  }>()
  const range = parseRange(body.range)
  if (!/^[\da-f-]{36}$/i.test(body.requestId ?? ''))
    throw new AppError('INVALID_INPUT', '请求标识无效。', 400)
  const row = await read<Current>(c.env.DB, 'current')
  const active = row && Date.parse(row.value.expiresAt) > Date.now() ? row.value : undefined
  if (active?.requestId === body.requestId) return c.json(dto(active))
  if (body.expected?.id !== target(active).id || (active && !body.replace))
    throw new AppError(
      'REPORT_CONFLICT',
      '生成将替换当前报告，请先下载或保存。',
      409,
      false,
      undefined,
      target(active),
    )
  const value: Current = {
    id: crypto.randomUUID(),
    credentialTag: await credentialTag(c.env.WEREAD_API_KEY),
    version: 1,
    requestId: body.requestId,
    status: 'queued',
    state: newCollector(range),
    expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
  }
  await save(
    c.env.DB,
    'current',
    row?.version ?? 0,
    value,
    { expiresAt: value.expiresAt },
    row?.token,
  )
  return c.json(dto(value))
})
app.get('/api/reports/:id', async (c) =>
  c.json(dto((await current(c.env.DB, c.req.param('id'))).value)),
)
app.get('/api/reports/:id/notes', async (c) => {
  const { value } = await current(c.env.DB, c.req.param('id'))
  const cursor = Number(c.req.query('cursor') ?? 0)
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new AppError('INVALID_INPUT', '分页无效。', 400)
  const notes = buildReport(value.state).notes
  return c.json({
    notes: notes.slice(cursor, cursor + 200),
    nextCursor: cursor + 200 < notes.length ? cursor + 200 : null,
    version: value.version,
  })
})
app.use('/api/reports/:id/:action', async (c, next) => {
  if (c.req.method !== 'POST' || c.req.param('action') !== 'advance') return next()
  const token = crypto.randomUUID(),
    now = Date.now()
  const result = await c.env.DB.prepare(
    'INSERT INTO collection_lease(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE collection_lease.expires_at<=?',
  )
    .bind(token, now + 30000, now)
    .run()
  if (!result.meta.changes) throw new AppError('REPORT_BUSY', '已有读取正在进行，请稍后恢复。', 409)
  try {
    await next()
  } finally {
    await c.env.DB.prepare('DELETE FROM collection_lease WHERE id=1 AND token=?').bind(token).run()
  }
})
app.post('/api/reports/:id/:action', async (c) => {
  const row = await current(c.env.DB, c.req.param('id')),
    value = row.value,
    action = c.req.param('action')
  if (action === 'touch') return c.json(dto(value))
  if (action === 'cancel') value.status = 'cancelled'
  else if (action === 'retry') {
    if (!collectionProgress(value.state).retryAllowed)
      throw new AppError('COLLECTION_BUDGET', '请下载已有结果或继续下一段。', 409)
    value.state.queue.push(...value.state.failed)
    value.state.failed = []
    value.status = 'running'
  } else if (action === 'continue') {
    continueCollector(value.state)
    value.status = 'running'
  } else if (action === 'advance') {
    const body = await c.req.json<{ version: number }>()
    if (body.version !== value.version)
      throw new AppError('REPORT_CHANGED', '报告已更新，请重新读取。', 409)
    if (!['queued', 'running'].includes(value.status)) return c.json(dto(value))
    if (!c.env.WEREAD_API_KEY)
      throw new AppError('WEREAD_KEY_MISSING', '未配置微信读书读取授权。', 409)
    if (value.credentialTag !== (await credentialTag(c.env.WEREAD_API_KEY)))
      throw new AppError('KEY_CHANGED', '上游授权已变化，请重新生成报告以避免混合数据。', 409)
    // One bounded upstream operation per invocation; CAS rejects late writes.
    try {
      value.state = await advanceCollector(value.state, c.env.WEREAD_API_KEY)
      value.state.issueCode = undefined
      value.status =
        value.state.budgetReached || (value.state.failed.length && !value.state.queue.length)
          ? 'partial'
          : value.state.queue.length
            ? 'running'
            : 'completed'
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      // Collector mutates cursors, request budgets and backoff before throwing.
      // Persist that progress, otherwise retries could exceed the bounded budget.
      value.state.issueCode = error.code
      if (!value.state.issues.includes(error.message)) value.state.issues.push(error.message)
      value.status = 'partial'
    }
  } else throw new AppError('NOT_FOUND', '接口不存在。', 404)
  value.version++
  if (Date.parse(value.expiresAt) <= Date.now())
    throw new AppError('REPORT_EXPIRED', '报告已到期。', 404)
  await save(c.env.DB, 'current', row.version, value, { expiresAt: value.expiresAt }, row.token)
  return c.json(dto(value))
})
app.get('/api/books/:id', async (c) => {
  const { value } = await current(c.env.DB)
  const book = buildReport(value.state).books.find((x) => x.id === c.req.param('id'))
  if (!book) throw new AppError('NOT_FOUND', '书籍不在当前报告中。', 404)
  return c.json(book)
})
app.get('/api/archives', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT summary FROM entity WHERE id!='current' ORDER BY rowid DESC",
  ).all<{ summary: string }>()
  return c.json({
    items: results.map((x) => JSON.parse(x.summary)),
    limit: ARCHIVE_LIMIT,
    maxBytes: ARCHIVE_MAX_BYTES,
  })
})
app.post('/api/archives', async (c) => {
  const body = await c.req.json<{ reportId: string; version: number; includeNotes: boolean }>()
  if (typeof body.includeNotes !== 'boolean')
    throw new AppError('INVALID_INPUT', '请选择正文保存选项。', 400)
  const { value } = await current(c.env.DB, body.reportId)
  if (body.version !== value.version || ['queued', 'running'].includes(value.status))
    throw new AppError('REPORT_CHANGED', '请停止或完成采集后重新保存。', 409)
  const report = buildReport(value.state)
  report.meta.source = 'instance'
  if (!body.includeNotes) {
    report.notes = []
    report.portrait.quote = null
    report.portrait.selections = []
  }
  const bytes = new TextEncoder().encode(JSON.stringify(report)).length
  if (bytes > ARCHIVE_MAX_BYTES)
    throw new AppError('ARCHIVE_TOO_LARGE', '超过 2 MiB，请取消正文或下载到本地。', 413)
  // Deterministic snapshot ID makes retries idempotent without account/session records.
  const id = `${value.id}-${value.version}-${body.includeNotes ? 'notes' : 'summary'}`
  const existing = await read<ArchivedReport>(c.env.DB, id)
  if (existing) {
    const summary = { ...existing.value, report: undefined }
    return c.json(summary)
  }
  const summary = {
    id,
    createdAt: new Date().toISOString(),
    generatedAt: report.meta.generatedAt,
    range: report.range,
    summary: report.summary,
    coverage: report.coverage,
    sourceStatus: value.status,
    includeNotes: body.includeNotes,
    bytes,
  }
  await save(c.env.DB, id, 0, { ...summary, report }, summary)
  return c.json(summary)
})
app.get('/api/archives/:id', async (c) => {
  const id = c.req.param('id')
  const row = id === 'current' ? null : await read<ArchivedReport>(c.env.DB, id)
  if (!row) throw new AppError('ARCHIVE_NOT_FOUND', '存档不存在或已删除。', 404)
  return c.json(row.value)
})
app.delete('/api/archives/:id', async (c) => {
  if (c.req.param('id') === 'current') throw new AppError('INVALID_INPUT', '无效的存档。', 400)
  await c.env.DB.prepare('DELETE FROM entity WHERE id=?').bind(c.req.param('id')).run()
  return c.body(null, 204)
})
app.notFound((c) => c.json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404))
app.onError((error, c) => {
  if (error instanceof AppError)
    return c.json(
      { code: error.code, message: error.message, details: error.details },
      error.status as 400,
    )
  if (error instanceof SyntaxError)
    return c.json({ code: 'INVALID_INPUT', message: '请求格式无效。' }, 400)
  return c.json({ code: 'SERVICE_ERROR', message: '服务暂时不可用，请检查实例配置。' }, 500)
})
