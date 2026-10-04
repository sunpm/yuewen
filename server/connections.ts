import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { and, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from './db'
import {
  credential,
  guest,
  user,
  report,
  reportReplacement,
  connectionSave,
  requestLimit,
} from './db/schema'
import { authConfigured, getAuth } from './auth'
import { decryptKey, encryptKey, keyring } from './crypto'
import { AppError, weread } from './weread'

export type Access = { kind: 'guest' | 'account'; ownerId: string; sessionId: string }
export type AppEnv = { Variables: { access: Access; requestId: string } }
export type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]
const cookie = 'yuewen-guest'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const keyInput = z
  .string()
  .trim()
  .min(8)
  .max(512)
  .regex(/^wrk-[A-Za-z0-9_-]+$/)
export const liveGuest = (id: string) =>
  and(eq(guest.id, id), gt(guest.expiresAt, new Date()), gt(guest.idleExpiresAt, new Date()))
export const ownerReports = (access: Access) =>
  access.kind === 'guest' ? eq(report.guestId, access.ownerId) : eq(report.userId, access.ownerId)
export const sessionReports = (access: Access) =>
  and(
    ownerReports(access),
    access.kind === 'account' ? eq(report.sessionId, access.sessionId) : undefined,
  )
export async function lockOwner(tx: Transaction, access: Access) {
  if (access.kind === 'guest') {
    const [row] = await tx.select().from(guest).where(liveGuest(access.ownerId)).for('update')
    if (!row) throw new AppError('GUEST_EXPIRED', '临时连接已到期或清除，请重新配置 API Key。', 401)
  } else {
    await tx.select().from(user).where(eq(user.id, access.ownerId)).for('update')
  }
}
export async function readCredential(
  access: Access,
  db: Transaction | ReturnType<typeof getDb> = getDb(),
) {
  if (access.kind === 'guest') {
    const [row] = await db.select().from(guest).where(liveGuest(access.ownerId))
    if (!row) throw new AppError('GUEST_EXPIRED', '临时连接已到期或清除，请重新配置 API Key。', 401)
    return { ...row, ownerId: row.id }
  }
  const [row] = await db.select().from(credential).where(eq(credential.userId, access.ownerId))
  return row ? { ...row, ownerId: row.userId } : undefined
}
export function decryptConnection(key: {
  encryptedKey: string
  encryptionVersion: number
  ownerId: string
}) {
  const secret = keyring().keys[key.encryptionVersion]
  if (!secret) throw new AppError('SERVICE_MAINTENANCE', '连接服务正在维护，请稍后重试。', 503)
  return decryptKey(key.encryptedKey, key.ownerId, secret)
}
export async function invalidateConnection(access: Access, version: number) {
  if (access.kind === 'guest')
    await getDb()
      .update(guest)
      .set({ status: 'invalid' })
      .where(and(liveGuest(access.ownerId), eq(guest.version, version)))
  else
    await getDb()
      .update(credential)
      .set({ status: 'invalid' })
      .where(and(eq(credential.userId, access.ownerId), eq(credential.version, version)))
}
export async function limit(key: string, maximum: number, windowSeconds: number) {
  const expiresAt = new Date(Date.now() + windowSeconds * 1000)
  const [row] = await getDb()
    .insert(requestLimit)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: requestLimit.key,
      set: {
        count: sql`case when ${requestLimit.expiresAt} < now() then 1 else ${requestLimit.count} + 1 end`,
        expiresAt: sql`case when ${requestLimit.expiresAt} < now() then ${expiresAt.toISOString()}::timestamptz else ${requestLimit.expiresAt} end`,
      },
    })
    .returning()
  if (row.count > maximum) throw new AppError('RATE_LIMIT', '操作过于频繁，请稍后重试。', 429, true)
}
export async function limitSource(c: Context, action: string, maximum: number) {
  // Netlify supplies this header at its trusted edge. Other hosts share one bucket.
  const source =
    process.env.NETLIFY === 'true'
      ? (c.req.header('x-nf-client-connection-ip') ?? 'unknown')
      : 'local'
  await limit(`source:${action}:${hash(source)}`, maximum, 60)
}
export async function accountSession(c: Context) {
  return authConfigured() ? getAuth().api.getSession({ headers: c.req.raw.headers }) : null
}
async function guestSession(c: Context) {
  const token = getCookie(c, cookie)
  if (!token || !/^[\w-]{43}$/.test(token) || !process.env.DATABASE_URL) return undefined
  const [row] = await getDb()
    .select()
    .from(guest)
    .where(
      and(
        eq(guest.tokenHash, hash(token)),
        gt(guest.expiresAt, new Date()),
        gt(guest.idleExpiresAt, new Date()),
      ),
    )
  return row
}
export async function resolveAccess(c: Context): Promise<Access> {
  const selected = c.req.header('X-Yuewen-Connection')
  if (selected && !['guest', 'account'].includes(selected))
    throw new AppError('INVALID_INPUT', '请选择有效连接。', 400)
  const anonymous = selected === 'account' ? undefined : await guestSession(c)
  const account = selected === 'guest' ? null : await accountSession(c)
  if (!selected && anonymous && account)
    throw new AppError('CONNECTION_REQUIRED', '请选择临时连接或账号连接。', 409)
  if (anonymous) return { kind: 'guest', ownerId: anonymous.id, sessionId: anonymous.id }
  if (account) return { kind: 'account', ownerId: account.user.id, sessionId: account.session.id }
  throw new AppError(
    selected === 'guest' ? 'GUEST_EXPIRED' : 'AUTH_REQUIRED',
    selected === 'guest'
      ? '临时连接已到期或清除，请重新配置 API Key。'
      : '请连接微信读书，或登录恢复账号连接。',
    401,
  )
}
export const connections = new Hono<AppEnv>()
connections.get('/connections', async (c) => {
  const [anonymous, account] = await Promise.all([guestSession(c), accountSession(c)])
  const saved = account
    ? await readCredential({
        kind: 'account',
        ownerId: account.user.id,
        sessionId: account.session.id,
      })
    : undefined
  return c.json({
    guest: anonymous
      ? {
          status: anonymous.status,
          expiresAt: anonymous.expiresAt,
          idleExpiresAt: anonymous.idleExpiresAt,
        }
      : null,
    account: account ? { status: saved?.status ?? 'missing' } : null,
  })
})
connections.put('/guest/connection', async (c) => {
  const { apiKey } = z.object({ apiKey: keyInput }).parse(await c.req.json())
  const ring = keyring()
  await limitSource(c, 'connect', 5)
  await limit('guest:create', 30, 60)
  const before = await guestSession(c)
  await weread(apiKey, '/shelf/sync')
  const id = randomUUID(),
    token = randomBytes(32).toString('base64url')
  await getDb().transaction(async (tx) => {
    if (before) {
      const [current] = await tx.select().from(guest).where(liveGuest(before.id)).for('update')
      if (!current || current.version !== before.version)
        throw new AppError('KEY_CHANGED', '连接已在另一处更新，请重新提交。', 409)
      await tx.delete(guest).where(eq(guest.id, before.id))
    }
    await tx.insert(guest).values({
      id,
      tokenHash: hash(token),
      encryptedKey: encryptKey(apiKey, id, ring.keys[ring.version]),
      encryptionVersion: ring.version,
      idleExpiresAt: new Date(Date.now() + 1800000),
      expiresAt: new Date(Date.now() + 7200000),
    })
  })
  setCookie(c, cookie, token, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith('https:'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 7200,
  })
  return c.json({ status: 'valid' })
})
connections.delete('/guest/connection', async (c) => {
  const current = await guestSession(c)
  if (current) await getDb().delete(guest).where(eq(guest.id, current.id))
  deleteCookie(c, cookie, { path: '/' })
  return c.body(null, 204)
})
const saveTarget = z.object({
  guestId: z.string().uuid(),
  guestVersion: z.number().int(),
  guestReportId: z.string().uuid(),
  accountVersion: z.number().int(),
  reportId: z.string().uuid().nullable(),
  keyConflict: z.boolean(),
})
connections.post('/guest/save', async (c) => {
  const body = z
    .object({
      requestId: z.string().uuid(),
      reportId: z.string().uuid(),
      expected: saveTarget.optional(),
      replace: z.boolean().default(false),
    })
    .parse(await c.req.json())
  const account = await accountSession(c)
  if (!account) throw new AppError('AUTH_REQUIRED', '请登录后保存连接，临时报告仍可继续查看。', 401)
  await limit(`save:${account.user.id}`, 10, 60)
  const result = await getDb().transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, account.user.id)).for('update')
    const [receipt] = await tx
      .select()
      .from(connectionSave)
      .where(
        and(
          eq(connectionSave.userId, account.user.id),
          eq(connectionSave.requestId, body.requestId),
          gt(connectionSave.expiresAt, new Date()),
        ),
      )
    if (receipt) {
      if (receipt.reportId !== body.reportId)
        throw new AppError('SAVE_TARGET_CHANGED', '保存请求对应另一份报告，请返回原报告确认。', 409)
      const [current] = await tx
        .select()
        .from(report)
        .where(
          and(
            eq(report.id, receipt.reportId),
            eq(report.userId, account.user.id),
            eq(report.sessionId, account.session.id),
            eq(report.keyVersion, receipt.keyVersion),
            gt(report.expiresAt, new Date()),
            gt(report.idleExpiresAt, new Date()),
          ),
        )
      if (!current)
        throw new AppError(
          'SAVE_RESULT_EXPIRED',
          '连接已保存，但当时的临时报告已过期或变化。请使用账号连接。',
          409,
        )
      return { reportId: current.id, range: current.state.range.key }
    }
    let anonymous = await guestSession(c)
    if (!anonymous) throw new AppError('GUEST_EXPIRED', '临时连接已到期或清除，未执行保存。', 401)
    await lockOwner(tx, { kind: 'guest', ownerId: anonymous.id, sessionId: anonymous.id })
    const [lockedGuest] = await tx.select().from(guest).where(liveGuest(anonymous.id))
    if (!lockedGuest) throw new AppError('GUEST_EXPIRED', '临时连接已到期，未执行保存。', 401)
    anonymous = lockedGuest
    const [incoming] = await tx
      .select()
      .from(report)
      .where(
        and(
          eq(report.guestId, anonymous.id),
          gt(report.expiresAt, new Date()),
          gt(report.idleExpiresAt, new Date()),
        ),
      )
      .for('update')
    if (incoming && incoming.id !== body.reportId)
      throw new AppError('SAVE_TARGET_CHANGED', '临时报告已变化，请回到当前报告重新选择保存。', 409)
    if (!incoming || incoming.keyVersion !== anonymous.version)
      throw new AppError('REPORT_EXPIRED', '临时报告已到期或连接变化，请重新生成后保存。', 409)
    const [saved] = await tx.select().from(credential).where(eq(credential.userId, account.user.id))
    const [previous] = await tx
      .select()
      .from(report)
      .where(
        and(
          eq(report.userId, account.user.id),
          gt(report.expiresAt, new Date()),
          gt(report.idleExpiresAt, new Date()),
        ),
      )
    const secret = decryptConnection({ ...anonymous, ownerId: anonymous.id })
    const sameKey = saved && decryptConnection({ ...saved, ownerId: account.user.id }) === secret
    const target = {
      guestId: anonymous.id,
      guestVersion: anonymous.version,
      guestReportId: incoming.id,
      accountVersion: saved?.version ?? 0,
      reportId: previous?.id ?? null,
      keyConflict: !!saved && !sameKey,
    }
    if (
      (body.expected &&
        Object.keys(target).some(
          (key) =>
            target[key as keyof typeof target] !== body.expected![key as keyof typeof target],
        )) ||
      ((target.keyConflict || previous) && (!body.replace || !body.expected))
    )
      throw new AppError(
        'SAVE_CONFLICT',
        `${target.keyConflict ? '账号已有不同连接；保存将替换该连接。' : ''}${previous ? '账号已有临时报告；保存将停止并清除该报告。' : ''}本次临时报告会保留。`,
        409,
        false,
        undefined,
        target,
      )
    const reuse = sameKey && saved.status === 'valid' && anonymous.status === 'valid'
    const version = reuse ? saved.version : (saved?.version ?? 0) + 1
    if (!reuse) {
      const ring = keyring(),
        values = {
          encryptedKey: encryptKey(secret, account.user.id, ring.keys[ring.version]),
          encryptionVersion: ring.version,
          version,
          status: anonymous.status,
          updatedAt: new Date(),
          validatedAt: new Date(),
        }
      await tx
        .insert(credential)
        .values({ userId: account.user.id, ...values })
        .onConflictDoUpdate({ target: credential.userId, set: values })
    }
    if (previous?.userId && previous.sessionId)
      await tx
        .insert(reportReplacement)
        .values({
          id: previous.id,
          userId: previous.userId,
          sessionId: previous.sessionId,
          requestId: previous.requestId,
          expiresAt: previous.expiresAt,
        })
        .onConflictDoNothing()
    await tx.delete(report).where(eq(report.userId, account.user.id))
    const expiresAt = new Date(
      Math.min(incoming.expiresAt.getTime(), anonymous.expiresAt.getTime()),
    )
    await tx
      .update(report)
      .set({
        userId: account.user.id,
        sessionId: account.session.id,
        guestId: null,
        keyVersion: version,
        version: incoming.version + 1,
        leaseId: null,
        leaseUntil: null,
        idleExpiresAt: new Date(
          Math.min(incoming.idleExpiresAt.getTime(), anonymous.idleExpiresAt.getTime()),
        ),
        expiresAt,
      })
      .where(eq(report.id, incoming.id))
    await tx.insert(connectionSave).values({
      userId: account.user.id,
      sessionId: account.session.id,
      requestId: body.requestId,
      guestId: anonymous.id,
      reportId: incoming.id,
      keyVersion: version,
      expiresAt,
    })
    await tx.delete(guest).where(eq(guest.id, anonymous.id))
    return { reportId: incoming.id, range: incoming.state.range.key }
  })
  deleteCookie(c, cookie, { path: '/' })
  return c.json(result)
})
