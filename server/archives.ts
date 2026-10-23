import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { ARCHIVE_LIMIT, ARCHIVE_MAX_BYTES } from '../shared/archive'
import type { ReadingReport } from '../shared/report'
import { buildReport } from './collector'
import {
  checkAccountSession,
  guestSession,
  limit,
  lockOwner,
  readCredential,
  sessionReports,
} from './connections'
import type { AppEnv } from './connections'
import { getDb } from './db'
import { report, reportArchive } from './db/schema'
import { recordRecoveryIntent } from './recovery/journal'
import { AppError } from './weread'

const fields = {
  id: reportArchive.id,
  createdAt: reportArchive.createdAt,
  generatedAt: sql<string>`${reportArchive.snapshot}->'meta'->>'generatedAt'`,
  range: sql<ReadingReport['range']>`${reportArchive.snapshot}->'range'`,
  summary: sql<ReadingReport['summary']>`${reportArchive.snapshot}->'summary'`,
  coverage: sql<ReadingReport['coverage']>`${reportArchive.snapshot}->'coverage'`,
  sourceStatus: reportArchive.sourceStatus,
  includeNotes: reportArchive.includeNotes,
  bytes: reportArchive.bytes,
}
const input = z
  .object({
    reportId: z.uuid(),
    version: z.number().int().nonnegative(),
    includeNotes: z.boolean(),
  })
  .strict()

// Mounted after the account-only middleware; no Key or temporary connection is needed to read.
export const archives = new Hono<AppEnv>()
archives.get('/', async (c) => {
  const items = await getDb()
    .select(fields)
    .from(reportArchive)
    .where(eq(reportArchive.userId, c.get('access').ownerId))
    .orderBy(desc(reportArchive.createdAt), desc(reportArchive.id))
    .limit(ARCHIVE_LIMIT)
  return c.json({ items, limit: ARCHIVE_LIMIT, maxBytes: ARCHIVE_MAX_BYTES })
})
archives.post('/', async (c) => {
  const body = input.parse(await c.req.json())
  const connection = z
    .enum(['account', 'guest'])
    .parse(c.req.header('X-Yuewen-Connection') ?? 'account')
  const access = c.get('access')
  await limit(`archive:${access.ownerId}`, 10, 60)
  const saved = await getDb().transaction(async (tx) => {
    // Serialize quota, source replacement and account deletion with the existing owner lock.
    await lockOwner(tx, access)
    const [existing] = await tx
      .select(fields)
      .from(reportArchive)
      .where(
        and(
          eq(reportArchive.userId, access.ownerId),
          eq(reportArchive.sourceReportId, body.reportId),
          eq(reportArchive.sourceVersion, body.version),
          eq(reportArchive.includeNotes, body.includeNotes),
        ),
      )
    // Recover an uncertain save even after its temporary source has expired.
    if (existing) {
      await checkAccountSession(tx, access)
      return existing
    }
    const anonymous = connection === 'guest' ? await guestSession(c, tx) : undefined
    if (connection === 'guest' && !anonymous)
      throw new AppError('GUEST_EXPIRED', '临时连接已到期，无法保存报告。', 401)
    const sourceAccess = anonymous
      ? { kind: 'guest' as const, ownerId: anonymous.id, sessionId: anonymous.id }
      : access
    const guestOwner = anonymous ? await lockOwner(tx, sourceAccess) : undefined
    const [source] = await tx
      .select()
      .from(report)
      .where(and(eq(report.id, body.reportId), sessionReports(sourceAccess)))
      .for('update')
    if (
      !source ||
      Math.min(source.expiresAt.getTime(), source.idleExpiresAt.getTime()) <= Date.now()
    )
      throw new AppError('REPORT_EXPIRED', '临时报告已到期或清除，无法存档。', 404)
    const key = await readCredential(sourceAccess, tx)
    if (!key || key.version !== source.keyVersion)
      throw new AppError('KEY_CHANGED', '连接已更新，请重新读取报告后保存。', 409)
    if (source.version !== body.version)
      throw new AppError('REPORT_CHANGED', '报告已更新，请核对最新结果后保存。', 409)
    if (['queued', 'running'].includes(source.status))
      throw new AppError('REPORT_BUSY', '请等待采集结束，或停止采集后保存已有结果。', 409)
    const [total] = await tx
      .select({ value: count() })
      .from(reportArchive)
      .where(eq(reportArchive.userId, access.ownerId))
    if (total.value >= ARCHIVE_LIMIT)
      throw new AppError(
        'ARCHIVE_LIMIT',
        `最多保存 ${ARCHIVE_LIMIT} 份报告，请先删除不再需要的存档。`,
        409,
      )
    const snapshot = buildReport(source.state)
    snapshot.meta.source = 'account'
    if (!body.includeNotes) {
      snapshot.notes = []
      snapshot.portrait.quote = null
      snapshot.portrait.selections = []
    }
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
    if (bytes > ARCHIVE_MAX_BYTES)
      throw new AppError(
        'ARCHIVE_TOO_LARGE',
        '报告超过 2 MiB，请取消保存笔记正文，或下载到本地。',
        413,
      )
    const [created] = await tx
      .insert(reportArchive)
      .values({
        id: randomUUID(),
        userId: access.ownerId,
        sourceReportId: source.id,
        sourceVersion: source.version,
        sourceStatus: source.status as typeof reportArchive.$inferInsert.sourceStatus,
        includeNotes: body.includeNotes,
        bytes,
        snapshot,
      })
      .returning(fields)
    await checkAccountSession(tx, access)
    if (
      guestOwner &&
      Math.min(guestOwner.expiresAt.getTime(), guestOwner.idleExpiresAt.getTime()) <= Date.now()
    )
      throw new AppError('GUEST_EXPIRED', '临时连接已到期，未保存存档。', 401)
    if (Math.min(source.expiresAt.getTime(), source.idleExpiresAt.getTime()) <= Date.now())
      throw new AppError('REPORT_EXPIRED', '临时报告已到期，未保存存档。', 404)
    return created
  })
  return c.json(saved)
})
archives.get('/:id', async (c) => {
  const id = z.uuid().parse(c.req.param('id'))
  const [saved] = await getDb()
    .select({ ...fields, report: reportArchive.snapshot })
    .from(reportArchive)
    .where(and(eq(reportArchive.id, id), eq(reportArchive.userId, c.get('access').ownerId)))
  if (!saved) throw new AppError('ARCHIVE_NOT_FOUND', '存档不存在或已删除。', 404)
  return c.json(saved)
})
archives.delete('/:id', async (c) => {
  const id = z.uuid().parse(c.req.param('id'))
  const access = c.get('access')
  await getDb().transaction(async (tx) => {
    await lockOwner(tx, access)
    const condition = and(eq(reportArchive.id, id), eq(reportArchive.userId, access.ownerId))
    const [saved] = await tx.select({ id: reportArchive.id }).from(reportArchive).where(condition)
    if (saved) {
      await recordRecoveryIntent('archive.delete', id)
      await tx.delete(reportArchive).where(condition)
    }
    await checkAccountSession(tx, access)
  })
  return c.body(null, 204)
})
