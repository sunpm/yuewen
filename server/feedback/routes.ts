import { randomBytes, randomUUID } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { and, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  accountSession,
  checkAccountSession,
  limit,
  lockOwner,
  resolveAccess,
  type Access,
  type AppEnv,
  type Transaction,
} from '../connections'
import { getDb } from '../db'
import {
  feedback,
  feedbackAttachment,
  feedbackContext,
  feedbackSubmission,
  user,
} from '../db/schema'
import { AppError } from '../weread'
import { DAY, feedbackEnabled, lockFeedback, queueObjectDelete } from './lifecycle'
import { parseSubmission } from './input'
import { hash, putScreenshot, r2Configured } from './storage'

const cookieName = 'yuewen-feedback'
type Identity = {
  kind: 'account' | 'guest' | 'visitor'
  hash: string
  access?: Access
  associatedUserId?: string
  reason?: string
}
async function identity(
  c: Context<AppEnv>,
  allowUnverified: boolean,
  createCookie = false,
): Promise<Identity> {
  let access: Access | undefined
  try {
    access = await resolveAccess(c)
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) throw error
    if (c.req.header('X-Yuewen-Connection') && !allowUnverified)
      throw new AppError(
        'FEEDBACK_IDENTITY_CHANGED',
        '当前连接已失效，请确认以未验证访客提交。',
        409,
      )
  }
  const login = await accountSession(c)
  if (access)
    return {
      kind: access.kind,
      access,
      hash: hash(`${access.kind}:${access.ownerId}:${access.sessionId}`),
      associatedUserId: login?.user.id,
    }
  let token = getCookie(c, cookieName)
  if (!token || !/^[\w-]{43}$/.test(token)) {
    if (!createCookie)
      throw new AppError('FEEDBACK_CONTEXT_REQUIRED', '请重新确认反馈提交身份。', 409)
    token = randomBytes(32).toString('base64url')
    setCookie(c, cookieName, token, {
      httpOnly: true,
      secure: process.env.APP_URL?.startsWith('https:'),
      sameSite: 'Strict',
      path: '/api/feedback',
      maxAge: DAY / 1000,
    })
  }
  return {
    kind: 'visitor',
    hash: hash(`visitor:${token}`),
    associatedUserId: login?.user.id,
    reason: 'no_active_selected_session',
  }
}
async function lockIdentity(tx: Transaction, who: Identity) {
  // Match account -> guest -> feedback ordering used by connection saving/account deletion.
  if (who.associatedUserId && who.associatedUserId !== who.access?.ownerId) {
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, who.associatedUserId))
      .for('key share')
    if (!account) who.associatedUserId = undefined
  }
  if (who.access) await lockOwner(tx, who.access)
}
function changed(): never {
  throw new AppError(
    'FEEDBACK_CONTEXT_CHANGED',
    '提交上下文已失效或身份变化，请重新确认反馈；旧请求不会重新写入。',
    409,
  )
}
async function checkContext(tx: Transaction, contextId: string, who: Identity) {
  const [context] = await tx
    .select()
    .from(feedbackContext)
    .where(
      and(
        eq(feedbackContext.id, contextId),
        eq(feedbackContext.identityHash, who.hash),
        gt(feedbackContext.expiresAt, new Date()),
      ),
    )
  if (!context) changed()
  return context
}
export const feedbackRoutes = new Hono<AppEnv>()
feedbackRoutes.use('*', async (_c, next) => {
  if (!feedbackEnabled())
    throw new AppError('FEEDBACK_UNAVAILABLE', '反馈服务尚未启用，请使用邮件联系。', 503)
  await next()
})
feedbackRoutes.post('/context', async (c) => {
  const body = z
    .object({ allowUnverified: z.boolean().default(false) })
    .strict()
    .parse(await c.req.json())
  await limit(`feedback:context:${hash(c.env?.clientIp ?? 'local')}`, 5, 600)
  const who = await identity(c, body.allowUnverified, true)
  const context = await getDb().transaction(async (tx) => {
    await lockIdentity(tx, who)
    await lockFeedback(tx)
    const [existing] = await tx
      .select()
      .from(feedbackContext)
      .where(
        and(eq(feedbackContext.identityHash, who.hash), gt(feedbackContext.expiresAt, new Date())),
      )
      .limit(1)
    if (existing) return existing
    const [created] = await tx
      .insert(feedbackContext)
      .values({ id: randomUUID(), identityHash: who.hash, expiresAt: new Date(Date.now() + DAY) })
      .returning()
    return created
  })
  return c.json({
    contextId: context.id,
    expiresAt: context.expiresAt,
    identity: who.kind,
    unverifiedReason: who.reason,
    screenshotAvailable: r2Configured(),
  })
})
feedbackRoutes.post('/', async (c) => {
  await limit(`feedback:request:${hash(c.env?.clientIp ?? 'local')}`, 5, 600)
  const who = await identity(c, true)
  const { contextId, requestId, input, image, digest } = await parseSubmission(c.req.raw)
  if (
    ['guest', 'account'].includes(input.environment.source) &&
    input.environment.source !== who.kind
  )
    changed()
  const leaseId = randomUUID()
  const reserved = await getDb().transaction(async (tx) => {
    await lockIdentity(tx, who)
    await lockFeedback(tx)
    const context = await checkContext(tx, contextId, who)
    if (who.access) await lockOwner(tx, who.access)
    const [receipt] = await tx
      .select()
      .from(feedbackSubmission)
      .where(eq(feedbackSubmission.requestId, requestId))
    if (receipt) {
      if (receipt.contextId !== contextId || receipt.digest !== digest) changed()
      if (receipt.state === 'deleted')
        throw new AppError('FEEDBACK_GONE', '这条反馈已删除，旧请求不能重新提交。', 410)
      if (receipt.state === 'complete') return { id: receipt.feedbackId, replay: true }
      if (receipt.leaseUntil && receipt.leaseUntil.getTime() > Date.now())
        throw new AppError('FEEDBACK_BUSY', '反馈正在提交，请稍后重试同一请求。', 409, true, 30)
      const [attachment] = await tx
        .select()
        .from(feedbackAttachment)
        .where(eq(feedbackAttachment.feedbackId, receipt.feedbackId))
      if (!attachment || attachment.expiresAt.getTime() <= Date.now()) changed()
      await tx
        .update(feedbackSubmission)
        .set({ leaseId, leaseUntil: new Date(Date.now() + 60_000) })
        .where(eq(feedbackSubmission.requestId, requestId))
      return { id: receipt.feedbackId, replay: false, attachment }
    }
    if (image && !r2Configured())
      throw new AppError(
        'SCREENSHOT_UNAVAILABLE',
        '截图服务暂不可用，可移除截图后重新确认提交。',
        503,
      )
    if (image) {
      const [capacity] = await tx.execute(
        sql`select coalesce((select sum(bytes) from feedback_attachment), 0) + coalesce((select sum(bytes) from feedback_object_delete), 0) as bytes`,
      )
      if (Number(capacity.bytes) + image.bytes.length > 1024 ** 3)
        throw new AppError('SCREENSHOT_CAPACITY', '截图存储已满，可移除截图后重新确认提交。', 409)
    }
    const now = Date.now()
    await limit(
      `feedback:daily:${Math.floor(now / DAY)}`,
      200,
      Math.ceil((DAY - (now % DAY)) / 1000),
      tx,
    )
    if (who.access) await limit(`feedback:owner:${who.kind}:${who.access.ownerId}`, 10, 3600, tx)
    const id = randomUUID()
    await tx.insert(feedback).values({
      id,
      ownerType: who.kind,
      userId: who.kind === 'account' ? who.access!.ownerId : null,
      guestId: who.kind === 'guest' ? who.access!.ownerId : null,
      associatedUserId: who.associatedUserId,
      source: input.environment.source,
      ...input,
      serverEnvironment: {
        deployment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',
        build: process.env.COMMIT_REF?.slice(0, 64) ?? 'unknown',
        requestId: c.get('requestId'),
        receivedAt: new Date(now).toISOString(),
        unverifiedReason: who.reason,
      },
      submittedAt: image ? null : new Date(now),
      expiresAt: new Date(now + 180 * DAY),
    })
    await tx.insert(feedbackSubmission).values({
      requestId,
      contextId,
      digest,
      feedbackId: id,
      state: image ? 'pending' : 'complete',
      leaseId: image ? leaseId : null,
      leaseUntil: image ? new Date(now + 60_000) : null,
      expiresAt: context.expiresAt,
    })
    let attachment: typeof feedbackAttachment.$inferSelect | undefined
    if (image) {
      ;[attachment] = await tx
        .insert(feedbackAttachment)
        .values({
          feedbackId: id,
          objectKey: `feedback/${randomUUID()}`,
          mime: image.mime,
          bytes: image.bytes.length,
          digest: image.digest,
          width: image.width,
          height: image.height,
          state: 'pending',
          expiresAt: new Date(now + 30 * DAY),
        })
        .returning()
    }
    if (who.access) await lockOwner(tx, who.access)
    if (context.expiresAt.getTime() <= Date.now()) changed()
    return { id, replay: false, attachment }
  })
  if (reserved.attachment && image) {
    try {
      await putScreenshot(reserved.attachment.objectKey, image.bytes, image.mime)
      await getDb().transaction(async (tx) => {
        await lockIdentity(tx, who)
        await lockFeedback(tx)
        const context = await checkContext(tx, contextId, who)
        const [receipt] = await tx
          .select()
          .from(feedbackSubmission)
          .where(
            and(
              eq(feedbackSubmission.requestId, requestId),
              eq(feedbackSubmission.state, 'pending'),
              eq(feedbackSubmission.leaseId, leaseId),
              gt(feedbackSubmission.leaseUntil, new Date()),
            ),
          )
        if (!receipt) changed()
        const [updated] = await tx
          .update(feedback)
          .set({ submittedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(feedback.id, reserved.id), gt(feedback.expiresAt, new Date())))
          .returning({ id: feedback.id })
        const [attachment] = await tx
          .update(feedbackAttachment)
          .set({ state: 'uploaded' })
          .where(
            and(
              eq(feedbackAttachment.feedbackId, reserved.id),
              gt(feedbackAttachment.expiresAt, new Date()),
            ),
          )
          .returning({ id: feedbackAttachment.feedbackId })
        if (!updated || !attachment) changed()
        await tx
          .update(feedbackSubmission)
          .set({ state: 'complete', leaseId: null, leaseUntil: null })
          .where(eq(feedbackSubmission.requestId, requestId))
        if (who.access) {
          await checkAccountSession(tx, who.access)
          await lockOwner(tx, who.access)
        }
        if (context.expiresAt.getTime() <= Date.now()) changed()
      })
    } catch (error) {
      // Keep failed uploads retryable. If deletion won, recreate the outbox even after an early DELETE.
      try {
        await getDb().transaction(async (tx) => {
          await lockFeedback(tx)
          const [linked] = await tx
            .select()
            .from(feedbackAttachment)
            .where(eq(feedbackAttachment.objectKey, reserved.attachment!.objectKey))
          if (!linked)
            await queueObjectDelete(
              tx,
              reserved.attachment!.objectKey,
              reserved.attachment!.bytes,
              new Date(Date.now() + 60_000),
            )
          await tx
            .update(feedbackSubmission)
            .set({ leaseId: null, leaseUntil: new Date(Date.now() + 60_000) })
            .where(
              and(
                eq(feedbackSubmission.requestId, requestId),
                eq(feedbackSubmission.leaseId, leaseId),
              ),
            )
        })
      } catch {
        console.error('yuewen.feedback_recovery_deferred', { requestId: c.get('requestId') })
      }
      throw error
    }
  }
  return c.json({ id: reserved.id }, reserved.replay ? 200 : 201)
})
feedbackRoutes.all('*', () => {
  throw new AppError('NOT_FOUND', '反馈接口不存在。', 404)
})
