import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { and, eq, gt, lt, or, sql, isNull, exists } from 'drizzle-orm'
import { z } from 'zod'
import { authConfigured, getAuth } from './auth'
import { getDb } from './db'
import {
  credential,
  guest,
  report,
  reportReplacement,
  user,
  session as authSession,
} from './db/schema'
import { encryptKey, keyring } from './crypto'
import { AppError, weread } from './weread'
import { advanceCollector, buildReport, newCollector, num, obj, str } from './collector'
import { createDemo } from '../shared/demo'
import { bookCategory, isRangeKey } from '../shared/report'
import type { RangeKey, ReportTarget } from '../shared/report'

import {
  connections,
  resolveAccess,
  accountSession,
  limit,
  limitSource,
  ownerReports,
  sessionReports,
  lockOwner,
  readCredential,
  decryptConnection,
  invalidateConnection,
  liveGuest,
} from './connections'
import type { Access, AppEnv } from './connections'
type Row = typeof report.$inferSelect
export const app = new Hono<AppEnv>()
app.use('/api/*', async (c, next) => {
  c.set('requestId', randomUUID())
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin')
    if (!origin || origin !== (process.env.APP_URL ?? 'http://127.0.0.1:5173'))
      throw new AppError('UNTRUSTED_ORIGIN', '请求来源不受支持，请回到本站操作。', 403)
    if (c.req.method !== 'DELETE' && !c.req.header('content-type')?.startsWith('application/json'))
      throw new AppError('INVALID_INPUT', '请求格式不正确。', 415)
  }
  await next()
})
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 16384,
    onError: (c) =>
      c.json(
        {
          code: 'INVALID_INPUT',
          message: '提交内容过大。',
          retryable: false,
          requestId: c.get('requestId'),
        },
        413,
      ),
  }),
)
app.get('/api/health', (c) => c.json({ status: 'ok', auth: authConfigured() }))
app.get('/api/demo', (c) => c.json(createDemo(parseRange(c.req.query('range') ?? 'recent'))))
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  if (!authConfigured())
    throw new AppError('AUTH_UNAVAILABLE', '邮箱登录服务暂不可用，你仍可临时连接和下载报告。', 503)
  return getAuth().handler(c.req.raw)
})
app.route('/api', connections)
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/account')) {
    const session = await accountSession(c)
    if (!session) throw new AppError('AUTH_REQUIRED', '请先登录阅纹。', 401)
    c.set('access', { kind: 'account', ownerId: session.user.id, sessionId: session.session.id })
  } else c.set('access', await resolveAccess(c))
  if (c.req.method === 'POST' && c.req.path === '/api/reports') await limitSource(c, 'report', 12)
  if (c.req.path.startsWith('/api/books/')) await limitSource(c, 'book', 60)
  await next()
})
export function parseRange(value: unknown): RangeKey {
  if (isRangeKey(value)) return value
  throw new AppError('INVALID_INPUT', '请选择有效的统计周期。', 400)
}
function publicTask(row: Row) {
  const data = buildReport(row.state)
  data.meta.source = row.guestId ? 'guest' : 'account'
  const noteTotal = data.notes.length
  data.notes = data.notes.slice(0, 200)
  return {
    id: row.id,
    version: row.version,
    keyVersion: row.keyVersion,
    status: row.status,
    stage: row.state.queue.length
      ? `正在读取${row.state.queue[0].api.includes('readdata') ? '阅读统计' : row.state.queue[0].api.includes('shelf') ? '当前书架' : '划线与想法'} · 笔记已读取 ${data.coverage.loaded}/${data.coverage.expected ?? '未知'} 本`
      : row.status === 'completed'
        ? '采集完成'
        : '已有结果已保留',
    report: data,
    noteTotal,
    notesComplete: noteTotal <= 200,
    retryAllowed:
      !row.state.budgetReached &&
      row.state.requests < 600 &&
      row.state.issueCode !== 'WEREAD_KEY_INVALID',
    issueCode: row.state.issueCode,
  }
}
const active = (id: string, session: Access) =>
  and(
    eq(report.id, id),
    sessionReports(session),
    session.kind === 'guest'
      ? exists(getDb().select({ id: guest.id }).from(guest).where(liveGuest(session.ownerId)))
      : exists(
          getDb()
            .select({ id: authSession.id })
            .from(authSession)
            .where(
              and(eq(authSession.id, session.sessionId), gt(authSession.expiresAt, new Date())),
            ),
        ),
    gt(report.expiresAt, new Date()),
    gt(report.idleExpiresAt, new Date()),
  )
async function readTask(id: string, session: Access) {
  const [row] = await getDb().select().from(report).where(active(id, session))
  if (!row) {
    const [replaced] = await getDb()
      .select({ id: reportReplacement.id })
      .from(reportReplacement)
      .where(
        and(
          eq(reportReplacement.id, id),
          eq(reportReplacement.userId, session.ownerId),
          eq(reportReplacement.sessionId, session.sessionId),
          gt(reportReplacement.expiresAt, new Date()),
        ),
      )
    if (replaced)
      throw new AppError('REPORT_REPLACED', '该临时报告已被替换。已停止读取，可主动重新生成。', 409)
    throw new AppError('REPORT_EXPIRED', '临时报告已清除或过期，请重新生成。', 404)
  }
  const key = await readCredential(session)
  if (!key || key.version !== row.keyVersion)
    throw new AppError('KEY_CHANGED', '微信读书连接已更新，请重新生成报告。', 409)
  return row
}
async function getKey(session: Access) {
  const key = await readCredential(session)
  if (!key) throw new AppError('WEREAD_KEY_REQUIRED', '请先连接你的微信读书。', 409)
  if (key.status === 'invalid')
    throw new AppError('WEREAD_KEY_INVALID', '微信读书 API Key 已失效，请重新配置。', 409)
  return key
}
app.get('/api/account/weread-key', async (c) => {
  const [key] = await getDb()
    .select()
    .from(credential)
    .where(eq(credential.userId, c.get('access').ownerId))
  return c.json({
    status: key?.status ?? 'missing',
    updatedAt: key?.updatedAt,
    validatedAt: key?.validatedAt,
  })
})
app.put('/api/account/weread-key', async (c) => {
  const { apiKey } = z
    .object({
      apiKey: z
        .string()
        .trim()
        .min(8)
        .max(512)
        .regex(/^wrk-[A-Za-z0-9_-]+$/),
    })
    .parse(await c.req.json())
  const userId = c.get('access').ownerId,
    db = getDb()
  await limit(`key:${userId}`, 5, 60)
  const [before] = await db.select().from(credential).where(eq(credential.userId, userId))
  const ring = keyring()
  await weread(apiKey, '/shelf/sync')
  await db.transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, userId)).for('update')
    const [current] = await tx.select().from(credential).where(eq(credential.userId, userId))
    if (current?.version !== before?.version)
      throw new AppError('KEY_CHANGED', '连接已在另一处更新，请重新提交。', 409)
    const now = new Date()
    await tx
      .insert(credential)
      .values({
        userId,
        encryptedKey: encryptKey(apiKey, userId, ring.keys[ring.version]),
        encryptionVersion: ring.version,
        version: (current?.version ?? 0) + 1,
      })
      .onConflictDoUpdate({
        target: credential.userId,
        set: {
          encryptedKey: encryptKey(apiKey, userId, ring.keys[ring.version]),
          encryptionVersion: ring.version,
          version: (current?.version ?? 0) + 1,
          status: 'valid',
          updatedAt: now,
          validatedAt: now,
        },
      })
    await tx.delete(report).where(eq(report.userId, userId))
  })
  return c.json({ status: 'valid', updatedAt: new Date().toISOString() })
})
app.delete('/api/account/weread-key', async (c) => {
  const id = c.get('access').ownerId
  await getDb().transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, id)).for('update')
    await tx.delete(report).where(eq(report.userId, id))
    await tx.delete(credential).where(eq(credential.userId, id))
  })
  return c.body(null, 204)
})
app.delete('/api/account', async (c) => {
  const session = c.get('access')
  const login = await accountSession(c)
  if (!login || Date.now() - login.session.createdAt.getTime() > 600000)
    throw new AppError('REAUTH_REQUIRED', '删除账号前，请先退出并重新登录。', 403)
  const response = await getAuth().api.signOut({ headers: c.req.raw.headers, asResponse: true })
  await getDb().delete(user).where(eq(user.id, session.ownerId))
  return response
})
app.get('/api/session/reports', async (c) => {
  const session = c.get('access'),
    now = new Date()
  const rows = await getDb()
    .select()
    .from(report)
    .where(and(sessionReports(session), gt(report.expiresAt, now), gt(report.idleExpiresAt, now)))
  const key = await readCredential(session)
  return c.json(rows.filter((r) => r.keyVersion === key?.version).map((r) => publicTask(r)))
})
app.delete('/api/session/reports', async (c) => {
  await getDb()
    .delete(report)
    .where(sessionReports(c.get('access')))
  return c.body(null, 204)
})
const validReport = (session: Access) =>
  and(ownerReports(session), gt(report.expiresAt, new Date()), gt(report.idleExpiresAt, new Date()))
function reportTarget(row: Row | undefined, session: Access, keyVersion: number): ReportTarget {
  return {
    id: row?.id ?? null,
    keyVersion,
    otherSession: session.kind === 'account' && !!row && row.sessionId !== session.sessionId,
  }
}
app.get('/api/reports/target', async (c) => {
  const session = c.get('access'),
    key = await getKey(session)
  const [row] = await getDb()
    .select()
    .from(report)
    .where(and(validReport(session), eq(report.keyVersion, key.version)))
  return c.json(reportTarget(row, session, key.version))
})
app.post('/api/reports', async (c) => {
  const body = z
    .object({
      range: z.string(),
      requestId: z.string().uuid(),
      expected: z.object({
        id: z.string().uuid().nullable(),
        keyVersion: z.number().int().positive(),
      }),
      replace: z.boolean().default(false),
    })
    .parse(await c.req.json())
  const range = parseRange(body.range),
    session = c.get('access'),
    db = getDb()
  await limit(`report:${session.ownerId}`, 6, 60)
  const row = await db.transaction(async (tx) => {
    await lockOwner(tx, session)
    const current = await readCredential(session, tx)
    if (!current) throw new AppError('WEREAD_KEY_REQUIRED', '请先连接你的微信读书。', 409)
    if (current.status === 'invalid')
      throw new AppError('WEREAD_KEY_INVALID', '微信读书 API Key 已失效，请重新配置。', 409)
    const [existing] = await tx
      .select()
      .from(report)
      .where(
        and(
          sessionReports(session),
          eq(report.requestId, body.requestId),
          gt(report.expiresAt, new Date()),
          gt(report.idleExpiresAt, new Date()),
        ),
      )
    if (existing) return existing
    const [receipt] = await tx
      .select()
      .from(reportReplacement)
      .where(
        and(
          eq(reportReplacement.userId, session.ownerId),
          eq(reportReplacement.sessionId, session.sessionId),
          eq(reportReplacement.requestId, body.requestId),
          gt(reportReplacement.expiresAt, new Date()),
        ),
      )
    if (receipt)
      throw new AppError('REPORT_REPLACED', '该生成请求的报告已被替换，请重新选择范围。', 409)
    const [previous] = await tx.select().from(report).where(validReport(session))
    const target = reportTarget(previous, session, current.version)
    if (
      body.expected.id !== target.id ||
      body.expected.keyVersion !== target.keyVersion ||
      (target.otherSession && !body.replace)
    )
      throw new AppError(
        target.otherSession ? 'REPORT_CONFLICT' : 'REPORT_TARGET_CHANGED',
        target.otherSession
          ? '继续生成会替换此账号在其他会话中的临时报告。'
          : '当前报告或连接已变化，请核对后重新生成。',
        409,
        false,
        undefined,
        target,
      )
    if (previous?.userId && previous.sessionId)
      await tx.insert(reportReplacement).values({
        id: previous.id,
        userId: previous.userId,
        sessionId: previous.sessionId,
        requestId: previous.requestId,
        expiresAt: previous.expiresAt,
      })
    await tx.delete(report).where(ownerReports(session))
    const [created] = await tx
      .insert(report)
      .values({
        id: randomUUID(),
        userId: session.kind === 'account' ? session.ownerId : null,
        sessionId: session.kind === 'account' ? session.sessionId : null,
        guestId: session.kind === 'guest' ? session.ownerId : null,
        keyVersion: current.version,
        requestId: body.requestId,
        state: newCollector(range),
        idleExpiresAt: new Date(
          Math.min(
            Date.now() + 1800000,
            'idleExpiresAt' in current ? current.idleExpiresAt.getTime() : Infinity,
          ),
        ),
        expiresAt: new Date(
          Math.min(
            Date.now() + 7200000,
            'expiresAt' in current ? current.expiresAt.getTime() : Infinity,
          ),
        ),
      })
      .returning()
    return created
  })
  return c.json(publicTask(row), 202)
})
app.get('/api/reports/:id', async (c) =>
  c.json(publicTask(await readTask(c.req.param('id'), c.get('access')))),
)
app.get('/api/reports/:id/notes', async (c) => {
  const row = await readTask(c.req.param('id'), c.get('access'))
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .parse(c.req.query('cursor') ?? 0)
  const query = (c.req.query('q') ?? '').slice(0, 200),
    bookId = c.req.query('bookId'),
    type = c.req.query('type')
  const notes = buildReport(row.state).notes.filter(
    (n) =>
      (!query || `${n.text}${n.title}${n.abstract ?? ''}`.includes(query)) &&
      (!bookId || n.bookId === bookId) &&
      (!type || n.type === type),
  )
  return c.json({
    notes: notes.slice(offset, offset + 200),
    nextCursor: offset + 200 < notes.length ? offset + 200 : null,
    total: notes.length,
    version: row.version,
  })
})
app.post('/api/reports/:id/touch', async (c) => {
  const session = c.get('access'),
    row = await readTask(c.req.param('id'), session)
  const [updated] = await getDb()
    .update(report)
    .set({ idleExpiresAt: new Date(Math.min(Date.now() + 1800000, row.expiresAt.getTime())) })
    .where(active(row.id, session))
    .returning({ id: report.id })
  if (!updated) await readTask(row.id, session)
  if (session.kind === 'guest')
    await getDb()
      .update(guest)
      .set({ idleExpiresAt: new Date(Math.min(Date.now() + 1800000, row.expiresAt.getTime())) })
      .where(liveGuest(session.ownerId))
  return c.body(null, 204)
})
app.post('/api/reports/:id/cancel', async (c) => {
  const session = c.get('access'),
    row = await readTask(c.req.param('id'), session)
  const [updated] = await getDb()
    .update(report)
    .set({
      status: 'cancelled',
      leaseId: null,
      leaseUntil: null,
      version: sql`${report.version} + 1`,
    })
    .where(active(row.id, session))
    .returning()
  if (!updated) await readTask(row.id, session)
  if (!updated) throw new AppError('REPORT_CHANGED', '报告状态已更新，请重新读取。', 409)
  return c.json(publicTask(updated))
})
app.post('/api/reports/:id/retry', async (c) => {
  const session = c.get('access'),
    row = await readTask(c.req.param('id'), session)
  await getKey(session)
  if (!['partial', 'cancelled', 'failed'].includes(row.status)) return c.json(publicTask(row))
  if (row.state.retryAt && row.state.retryAt > Date.now())
    throw new AppError('UPSTREAM_RATE_LIMIT', '请稍后再继续读取。', 429, true)
  if (row.state.budgetReached || row.state.requests >= 600)
    throw new AppError('COLLECTION_BUDGET', '本次采集已达到请求预算，请下载已有结果。', 409)
  row.state.queue.push(...row.state.failed)
  row.state.failed = []
  row.state.issues = []
  row.state.issueCode = undefined
  const [updated] = await getDb()
    .update(report)
    .set({
      state: row.state,
      status: 'queued',
      version: row.version + 1,
      leaseId: null,
      leaseUntil: null,
    })
    .where(and(active(row.id, session), eq(report.version, row.version)))
    .returning()
  if (!updated) {
    await readTask(row.id, session)
    throw new AppError('REPORT_CHANGED', '报告状态已更新，请刷新后重试。', 409, true)
  }
  return c.json(publicTask(updated))
})
app.post('/api/reports/:id/advance', async (c) => {
  const body = z
    .object({ version: z.number().int().min(0), requestId: z.string().uuid() })
    .parse(await c.req.json())
  const session = c.get('access'),
    db = getDb(),
    row = await readTask(c.req.param('id'), session)
  if (row.version !== body.version || !['queued', 'running'].includes(row.status))
    return c.json(publicTask(row))
  const key = await getKey(session),
    leaseId = randomUUID()
  const leased = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7263104)`)
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(report)
      .where(gt(report.leaseUntil, new Date()))
    if (count >= 8) throw new AppError('REPORT_BUSY', '当前阅读请求较多，请稍后继续。', 429, true)
    const [updated] = await tx
      .update(report)
      .set({ leaseId, leaseUntil: new Date(Date.now() + 25000), status: 'running' })
      .where(
        and(
          active(row.id, session),
          eq(report.version, body.version),
          or(isNull(report.leaseUntil), lt(report.leaseUntil, new Date())),
        ),
      )
      .returning()
    if (!updated) throw new AppError('REPORT_BUSY', '这一批正在读取，请稍后继续。', 409, true)
    return updated
  })
  let issue: AppError | undefined
  const previous = structuredClone(leased.state)
  try {
    await advanceCollector(leased.state, decryptConnection(key))
  } catch (error) {
    issue =
      error instanceof AppError
        ? error
        : new AppError('COLLECTION_ERROR', '读取暂时中断，请稍后继续。', 502, true)
  }
  if (
    Buffer.byteLength(JSON.stringify(leased.state)) > 1500000 ||
    leased.state.notes.length > 10000
  ) {
    const requests = leased.state.requests
    leased.state = { ...previous, requests, budgetReached: true }
    issue = new AppError(
      'COLLECTION_BUDGET',
      '本次报告达到内容预算，已保留现有结果，请先下载。',
      409,
    )
  }
  leased.state.issueCode = issue?.code
  if (issue?.code === 'COLLECTION_BUDGET') leased.state.budgetReached = true
  if (issue && !leased.state.issues.includes(issue.message)) leased.state.issues.push(issue.message)
  const status =
    issue || (!leased.state.queue.length && leased.state.failed.length)
      ? 'partial'
      : leased.state.queue.length
        ? 'running'
        : 'completed'
  const [updated] = await db
    .update(report)
    .set({
      state: leased.state,
      status,
      version: row.version + 1,
      leaseId: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        active(row.id, session),
        eq(report.leaseId, leaseId),
        eq(report.version, row.version),
        eq(report.keyVersion, key.version),
      ),
    )
    .returning()
  if (!updated) {
    await readTask(row.id, session)
    throw new AppError('REPORT_CHANGED', '采集已停止或连接已更新，旧结果未写入。', 409)
  }
  if (issue?.code === 'WEREAD_KEY_INVALID') await invalidateConnection(session, key.version)
  return c.json(publicTask(updated))
})
app.get('/api/books/:id', async (c) => {
  const id = z
      .string()
      .regex(/^[\w-]{1,100}$/)
      .parse(c.req.param('id')),
    session = c.get('access')
  await limit(`book:${session.ownerId}`, 30, 60)
  const key = await getKey(session),
    secret = decryptConnection(key)
  const [info, progress] = await Promise.all([
    weread(secret, '/book/info', { bookId: id }),
    weread(secret, '/book/getprogress', { bookId: id }),
  ]).catch(async (error) => {
    if (error instanceof AppError && error.code === 'WEREAD_KEY_INVALID') {
      await invalidateConnection(session, key.version)
    }
    throw error
  })
  // Recheck after the upstream call so a removed/replaced key cannot release stale data.
  const access = await resolveAccess(c)
  if (access.ownerId !== session.ownerId || access.sessionId !== session.sessionId)
    throw new AppError('KEY_CHANGED', '连接已更新，请重新打开书籍。', 409)
  const current = await getKey(session)
  if (current.version !== key.version)
    throw new AppError('KEY_CHANGED', '连接已更新，请重新打开书籍。', 409)
  return c.json({
    title: str(info.title),
    author: str(info.author),
    publisher: str(info.publisher),
    cover: str(info.cover) || undefined,
    ...(str(info.category).trim() ? bookCategory(str(info.category)) : {}),
    description: str(info.intro),
    progress: num(obj(progress.book).progress),
  })
})
app.notFound((c) =>
  c.json(
    {
      code: 'NOT_FOUND',
      message: '没有找到这个接口。',
      retryable: false,
      requestId: c.get('requestId'),
    },
    404,
  ),
)
app.onError((error, c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return c.json(
      {
        code: 'INVALID_INPUT',
        message: '提交内容不正确，请检查后重试。',
        retryable: false,
        requestId: c.get('requestId'),
      },
      400,
    )
  const known = error instanceof AppError
  if (known && error.retryAfter) c.header('Retry-After', String(error.retryAfter))
  return c.json(
    {
      code: known ? error.code : 'SERVICE_ERROR',
      message: known ? error.message : '服务暂时无法完成操作，请稍后重试。',
      retryable: known ? error.retryable : true,
      ...(known && error.details ? { details: error.details } : {}),
      requestId: c.get('requestId'),
    },
    (known ? error.status : 503) as 400,
  )
})
