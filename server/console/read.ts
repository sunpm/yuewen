import { Hono, type Context } from 'hono'
import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AppEnv } from '../connections'
import { getDb } from '../db'
import { consoleAudit, credential, feedback, guest, report, session, user } from '../db/schema'
import { AppError } from '../weread'
import { checkConsoleSession, maskEmail, requireDataAccess } from './access'

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
const id = z.string().trim().min(1).max(128)
const userFilter = pagination.extend({ userId: id.optional() }).strict()
const count = sql<number>`count(*)::int`

async function pageResponse<T>(
  c: Context<AppEnv>,
  query: z.infer<typeof pagination>,
  items: PromiseLike<T[]>,
  total: PromiseLike<{ count: number }[]>,
) {
  const [rows, [summary]] = await Promise.all([items, total])
  await checkConsoleSession(c)
  return c.json({ items: rows, total: summary.count, page: query.page, pageSize: query.pageSize })
}

const userFields = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  connectionStatus: sql<string>`coalesce(${credential.status}, 'unconfigured')`,
  latestSessionCreatedAt: sql<string | null>`(select max(${session.createdAt}) from ${session}
    where ${session.userId} = ${user.id} and ${session.expiresAt} > now())`.mapWith(
    session.createdAt,
  ),
  feedbackCount: sql<number>`(select count(*)::int from ${feedback}
    where ${feedback.userId} = ${user.id} and ${feedback.submittedAt} is not null
      and ${feedback.expiresAt} > now())`,
}

export const consoleUsers = new Hono<AppEnv>()
consoleUsers.use('*', requireDataAccess)
consoleUsers.get('/', async (c) => {
  const query = pagination
    .extend({
      search: z.string().trim().min(1).max(254).optional(),
      verified: z.enum(['true', 'false']).optional(),
      connection: z.enum(['unconfigured', 'valid', 'invalid']).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    })
    .strict()
    .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to))
    .parse(c.req.query())
  // Literal substring search: %, _ and backslashes never become SQL wildcards.
  const where = and(
    query.search
      ? or(
          sql`strpos(lower(${user.id}), lower(${query.search})) > 0`,
          sql`strpos(lower(${user.email}), lower(${query.search})) > 0`,
        )
      : undefined,
    query.verified ? eq(user.emailVerified, query.verified === 'true') : undefined,
    query.connection ? eq(userFields.connectionStatus, query.connection) : undefined,
    query.from ? gte(user.createdAt, new Date(query.from)) : undefined,
    query.to ? lte(user.createdAt, new Date(query.to)) : undefined,
  )
  const db = getDb()
  const items = db
    .select(userFields)
    .from(user)
    .leftJoin(credential, eq(credential.userId, user.id))
    .where(where)
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .then((rows) => rows.map((row) => ({ ...row, email: maskEmail(row.email) })))
  return pageResponse(
    c,
    query,
    items,
    db
      .select({ count })
      .from(user)
      .leftJoin(credential, eq(credential.userId, user.id))
      .where(where),
  )
})
consoleUsers.get('/:id', async (c) => {
  z.object({}).strict().parse(c.req.query())
  const [row] = await getDb()
    .select(userFields)
    .from(user)
    .leftJoin(credential, eq(credential.userId, user.id))
    .where(eq(user.id, id.parse(c.req.param('id'))))
  await checkConsoleSession(c)
  if (!row) throw new AppError('USER_NOT_FOUND', '用户不存在或已删除。', 404)
  return c.json(row)
})

export const consoleData = new Hono<AppEnv>()
consoleData.use('*', requireDataAccess)
consoleData.get('/credentials', (c) => {
  const query = userFilter.parse(c.req.query())
  const where = query.userId ? eq(credential.userId, query.userId) : undefined
  const db = getDb()
  return pageResponse(
    c,
    query,
    db
      .select({
        userId: credential.userId,
        status: credential.status,
        version: credential.version,
        validatedAt: credential.validatedAt,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      })
      .from(credential)
      .where(where)
      .orderBy(desc(credential.updatedAt), desc(credential.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count }).from(credential).where(where),
  )
})
consoleData.get('/guests', (c) => {
  const query = pagination.extend({ guestId: id.optional() }).strict().parse(c.req.query())
  const where = query.guestId ? eq(guest.id, query.guestId) : undefined
  const db = getDb()
  return pageResponse(
    c,
    query,
    db
      .select({
        id: guest.id,
        status: guest.status,
        version: guest.version,
        idleExpiresAt: guest.idleExpiresAt,
        expiresAt: guest.expiresAt,
        createdAt: guest.createdAt,
        updatedAt: guest.updatedAt,
      })
      .from(guest)
      .where(where)
      .orderBy(desc(guest.createdAt), desc(guest.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count }).from(guest).where(where),
  )
})
consoleData.get('/reports', (c) => {
  const query = userFilter.extend({ guestId: id.optional() }).strict().parse(c.req.query())
  const where = and(
    query.userId ? eq(report.userId, query.userId) : undefined,
    query.guestId ? eq(report.guestId, query.guestId) : undefined,
  )
  const db = getDb()
  return pageResponse(
    c,
    query,
    db
      .select({
        id: report.id,
        userId: report.userId,
        guestId: report.guestId,
        status: report.status,
        version: report.version,
        keyVersion: report.keyVersion,
        rangeKey: sql<string>`${report.state}->'range'->>'key'`,
        rangeStart: sql<string>`${report.state}->'range'->>'start'`,
        rangeEnd: sql<string>`${report.state}->'range'->>'end'`,
        requests: sql<number>`(${report.state}->>'requests')::int`,
        noteCount: sql<number>`jsonb_array_length(${report.state}->'notes')`,
        notebookCount: sql<number>`jsonb_array_length(${report.state}->'notebookBooks')`,
        pendingCount: sql<number>`jsonb_array_length(${report.state}->'queue')`,
        failedCount: sql<number>`jsonb_array_length(${report.state}->'failed')`,
        idleExpiresAt: report.idleExpiresAt,
        expiresAt: report.expiresAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      })
      .from(report)
      .where(where)
      .orderBy(desc(report.createdAt), desc(report.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count }).from(report).where(where),
  )
})
consoleData.get('/sessions', (c) => {
  const query = userFilter.parse(c.req.query())
  const where = query.userId ? eq(session.userId, query.userId) : undefined
  const db = getDb()
  return pageResponse(
    c,
    query,
    db
      .select({
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .where(where)
      .orderBy(desc(session.createdAt), desc(session.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count }).from(session).where(where),
  )
})
consoleData.get('/audit', (c) => {
  const query = pagination.strict().parse(c.req.query())
  const where = sql`${consoleAudit.expiresAt} > now()`
  const db = getDb()
  return pageResponse(
    c,
    query,
    db
      .select({
        id: consoleAudit.id,
        actorId: consoleAudit.actorId,
        action: consoleAudit.action,
        targetId: consoleAudit.targetId,
        result: consoleAudit.result,
        reason: consoleAudit.reason,
        createdAt: consoleAudit.createdAt,
        expiresAt: consoleAudit.expiresAt,
      })
      .from(consoleAudit)
      .where(where)
      .orderBy(desc(consoleAudit.createdAt), desc(consoleAudit.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count }).from(consoleAudit).where(where),
  )
})
consoleData.get('/cleanup-stats', async (c) => {
  z.object({}).strict().parse(c.req.query())
  // Fixed aggregate-only queries; keys, verification values and receipts never leave the DB.
  const rows = await getDb().execute(sql`
    select 'auth_rate_limit' as resource, count(*)::int as total,
      count(*) filter (where last_request < extract(epoch from now()) * 1000 - 86400000)::int as expired
      from auth_rate_limit
    union all select 'request_limit', count(*)::int, count(*) filter (where expires_at <= now())::int
      from request_limit
    union all select 'connection_save', count(*)::int, count(*) filter (where expires_at <= now())::int
      from connection_save
    union all select 'report_replacement', count(*)::int, count(*) filter (where expires_at <= now())::int
      from report_replacement
  `)
  await checkConsoleSession(c)
  return c.json({ items: Array.from(rows) })
})
