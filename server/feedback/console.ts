import { Hono, type Context } from 'hono'
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AppEnv } from '../connections'
import { limit } from '../connections'
import { getDb } from '../db'
import { checkConsoleSession, maskEmail } from '../console/access'
import { feedback, feedbackAttachment, user } from '../db/schema'
import { AppError } from '../weread'
import {
  audit,
  feedbackEnabled,
  lockFeedback,
  removeFeedback,
  tryObjectDeletion,
} from './lifecycle'
import { hash, readScreenshot, validateImage } from './storage'

const live = () => and(isNotNull(feedback.submittedAt), gt(feedback.expiresAt, new Date()))
const idOf = (c: Context<AppEnv>) => z.string().uuid().parse(c.req.param('id'))
const status = z.enum(['pending', 'processing', 'resolved', 'closed'])
const category = z.enum(['uncategorized', 'bug', 'suggestion', 'other'])
function missing(): never {
  throw new AppError('FEEDBACK_GONE', '反馈已删除或过期。', 404)
}
export const feedbackConsole = new Hono<AppEnv>()
feedbackConsole.use('*', async (c, next) => {
  if (!feedbackEnabled()) throw new AppError('FEEDBACK_UNAVAILABLE', '反馈管理尚未启用。', 503)
  await limit(`feedback:admin:${c.get('consoleAccess').userId}`, 120, 60)
  await next()
})
feedbackConsole.get('/', async (c) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      status: status.optional(),
      source: z.enum(['mock', 'guest', 'account', 'none']).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    })
    .strict()
    .parse(c.req.query())
  const where = and(
    live(),
    query.status ? eq(feedback.status, query.status) : undefined,
    query.source ? eq(feedback.source, query.source) : undefined,
    query.from ? sql`${feedback.createdAt} >= ${query.from}::timestamptz` : undefined,
    query.to ? sql`${feedback.createdAt} <= ${query.to}::timestamptz` : undefined,
  )
  const db = getDb()
  const rows = await db
    .select({
      id: feedback.id,
      ownerType: feedback.ownerType,
      userId: feedback.userId,
      email: user.email,
      source: feedback.source,
      status: feedback.status,
      category: feedback.category,
      version: feedback.version,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .leftJoin(user, eq(user.id, feedback.userId))
    .where(where)
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedback)
    .where(where)
  await checkConsoleSession(c)
  return c.json({
    items: rows.map((row) => ({ ...row, email: maskEmail(row.email) })),
    total: total.count,
    page: query.page,
    pageSize: query.pageSize,
  })
})
feedbackConsole.get('/:id', async (c) => {
  const [row] = await getDb()
    .select()
    .from(feedback)
    .where(and(eq(feedback.id, idOf(c)), live()))
  if (!row) missing()
  const [attachment] = await getDb()
    .select({
      mime: feedbackAttachment.mime,
      bytes: feedbackAttachment.bytes,
      width: feedbackAttachment.width,
      height: feedbackAttachment.height,
      expiresAt: feedbackAttachment.expiresAt,
    })
    .from(feedbackAttachment)
    .where(
      and(
        eq(feedbackAttachment.feedbackId, row.id),
        eq(feedbackAttachment.state, 'uploaded'),
        gt(feedbackAttachment.expiresAt, new Date()),
      ),
    )
  const [owner] = row.userId
    ? await getDb()
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, row.userId))
    : []
  await checkConsoleSession(c)
  return c.json({ ...row, owner: owner ?? null, screenshot: attachment ?? null })
})
feedbackConsole.get('/:id/screenshot', async (c) => {
  const id = idOf(c)
  await limit(`feedback:image:${c.get('consoleAccess').userId}`, 30, 60)
  const read = () =>
    getDb()
      .select({ attachment: feedbackAttachment })
      .from(feedbackAttachment)
      .innerJoin(feedback, eq(feedback.id, feedbackAttachment.feedbackId))
      .where(
        and(
          eq(feedback.id, id),
          live(),
          eq(feedbackAttachment.state, 'uploaded'),
          gt(feedbackAttachment.expiresAt, new Date()),
        ),
      )
  const [row] = await read()
  if (!row) throw new AppError('SCREENSHOT_GONE', '截图已删除或过期。', 410)
  const bytes = await readScreenshot(row.attachment.objectKey, row.attachment.bytes)
  if (hash(bytes) !== row.attachment.digest)
    throw new AppError('SCREENSHOT_GONE', '截图不可用。', 410)
  await validateImage(bytes, row.attachment.mime)
  // Recheck revocation/expiry after R2 I/O before releasing private bytes.
  await checkConsoleSession(c)
  if (!(await read()).length) throw new AppError('SCREENSHOT_GONE', '截图已删除或过期。', 410)
  c.header('Content-Type', row.attachment.mime)
  c.header('Content-Disposition', 'inline; filename="screenshot"')
  c.header('Content-Security-Policy', "default-src 'none'; sandbox")
  // Validation requires a bounded buffer; expose a stream without another base64/body copy.
  return c.body(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes))
        controller.close()
      },
    }),
  )
})
feedbackConsole.patch('/:id', async (c) => {
  const id = idOf(c)
  const body = z
    .object({
      version: z.number().int().min(0),
      status,
      category,
      internalNote: z.string().trim().max(4000),
    })
    .strict()
    .parse(await c.req.json())
  const result = await getDb().transaction(async (tx) => {
    await lockFeedback(tx)
    await checkConsoleSession(c, tx)
    const [existing] = await tx
      .select({ version: feedback.version })
      .from(feedback)
      .where(and(eq(feedback.id, id), live()))
    if (!existing) missing()
    if (existing.version !== body.version)
      throw new AppError('FEEDBACK_CHANGED', '反馈已被修改，请刷新后重试。', 409)
    const [updated] = await tx
      .update(feedback)
      .set({
        status: body.status,
        category: body.category,
        internalNote: body.internalNote,
        version: body.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id, version: feedback.version })
    await audit(tx, c.get('consoleAccess').userId, 'feedback.update', id)
    await checkConsoleSession(c, tx)
    return updated
  })
  return c.json(result)
})
feedbackConsole.delete('/:id', async (c) => {
  const id = idOf(c)
  const version = z.coerce.number().int().min(0).parse(c.req.query('version'))
  await getDb().transaction(async (tx) => {
    await lockFeedback(tx)
    await checkConsoleSession(c, tx)
    const [existing] = await tx
      .select()
      .from(feedback)
      .where(and(eq(feedback.id, id), live()))
    if (!existing) missing()
    if (existing.version !== version)
      throw new AppError('FEEDBACK_CHANGED', '反馈已被修改，请刷新后重试。', 409)
    await removeFeedback(tx, eq(feedback.id, id))
    await audit(tx, c.get('consoleAccess').userId, 'feedback.delete', id)
    await checkConsoleSession(c, tx)
  })
  await tryObjectDeletion()
  return c.body(null, 204)
})
