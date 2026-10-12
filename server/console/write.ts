import { Hono, type Context } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  renameUserInput,
  timestampActionInput,
  versionActionInput,
  type ManagementReason,
} from '../../shared/console'
import { limit, type AppEnv, type Transaction } from '../connections'
import { getDb } from '../db'
import { credential, guest, report, session, user } from '../db/schema'
import { audit, removeAccount, tryObjectDeletion } from '../feedback/lifecycle'
import { removeReports, stopReport } from '../report-lifecycle'
import { AppError } from '../weread'
import { requireDataAccess } from './access'
import { getConsoleAuth, lockConsoleAdmin } from './auth'
import { consoleAccount, consoleSession } from './schema'

const idOf = (c: Context<AppEnv>) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .parse(c.req.param('id'))
function missing(): never {
  throw new AppError('MANAGEMENT_GONE', '目标已删除或撤销，请刷新列表。', 404)
}
function changed(): never {
  throw new AppError('MANAGEMENT_CHANGED', '目标已变化，未执行操作。请刷新后重新确认。', 409)
}
function checkVersion(
  row: { updatedAt: Date; version?: number },
  expected: { updatedAt: string; version?: number },
) {
  if (row.updatedAt.toISOString() !== expected.updatedAt || row.version !== expected.version)
    changed()
}
async function lockUser(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ id: user.id, updatedAt: user.updatedAt })
    .from(user)
    .where(eq(user.id, id))
    .for('update')
  if (!row) missing()
  return row
}
async function lockGuest(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ id: guest.id, version: guest.version, updatedAt: guest.updatedAt })
    .from(guest)
    .where(eq(guest.id, id))
    .for('update')
  if (!row) missing()
  return row
}

// Password verification is bound to this action/target and never grants reusable client authority.
async function perform(
  c: Context<AppEnv>,
  action: string,
  id: string,
  input: { password?: string; reason?: ManagementReason },
  change: (tx: Transaction) => Promise<unknown>,
) {
  const access = c.get('consoleAccess')
  await limit(`console:write:${access.userId}`, 30, 60)
  if (input.password !== undefined) await limit(`console:reauth:${access.userId}`, 5, 60)
  try {
    await getDb().transaction(async (tx) => {
      // Reset uses the same lock; logout cannot remove the locked management session mid-write.
      await lockConsoleAdmin(tx)
      const [login] = await tx
        .select({ expiresAt: consoleSession.expiresAt })
        .from(consoleSession)
        .where(
          and(eq(consoleSession.id, access.sessionId), eq(consoleSession.userId, access.userId)),
        )
        .for('update')
      if (!login || login.expiresAt.getTime() <= Date.now())
        throw new AppError('CONSOLE_AUTH_REQUIRED', '管理会话已失效，请重新登录。', 401)
      let verifiedAt: number | undefined
      if (input.password !== undefined) {
        const [account] = await tx
          .select({ password: consoleAccount.password })
          .from(consoleAccount)
          .where(
            and(
              eq(consoleAccount.userId, access.userId),
              eq(consoleAccount.providerId, 'credential'),
            ),
          )
        const context = await getConsoleAuth().$context
        if (
          !account?.password ||
          !(await context.password.verify({ hash: account.password, password: input.password }))
        )
          throw new AppError('CONSOLE_PASSWORD_INVALID', '管理员密码不正确，未执行操作。', 403)
        verifiedAt = Date.now()
      }
      await change(tx)
      await audit(tx, access.userId, action, id, input.reason)
      // This session row stays locked; check the clock after all business/audit lock waits.
      const now = Date.now()
      if (login.expiresAt.getTime() <= now)
        throw new AppError('CONSOLE_AUTH_REQUIRED', '管理会话已失效，请重新登录。', 401)
      if (verifiedAt !== undefined && now - verifiedAt > 600_000)
        throw new AppError('CONSOLE_REAUTH_REQUIRED', '密码确认已超时，请重新确认。', 403)
    })
  } catch (error) {
    // Failed actions are recorded after rollback; never include passwords, names or request bodies.
    try {
      await getDb().transaction((tx) =>
        audit(
          tx,
          access.userId,
          action,
          id,
          input.reason,
          error instanceof AppError ? error.code : 'SERVICE_ERROR',
        ),
      )
    } catch {
      console.warn('yuewen.console_audit_failed')
    }
    throw error
  }
}

export const consoleWrites = new Hono<AppEnv>()
consoleWrites.patch('/users/:id', requireDataAccess, async (c) => {
  const id = idOf(c)
  const body = renameUserInput.parse(await c.req.json())
  await perform(c, 'user.rename', id, {}, async (tx) => {
    const row = await lockUser(tx, id)
    checkVersion(row, body)
    await tx
      .update(user)
      .set({
        name: body.name,
        updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
      })
      .where(eq(user.id, id))
  })
  return c.body(null, 204)
})
consoleWrites.post('/users/:id/delete', requireDataAccess, async (c) => {
  const id = idOf(c)
  const body = timestampActionInput.parse(await c.req.json())
  await perform(c, 'user.delete', id, body, async (tx) => {
    if (id === c.get('consoleAccess').userId)
      throw new AppError('CONSOLE_TARGET_PROTECTED', '不能通过用户管理删除管理员。', 403)
    checkVersion(await lockUser(tx, id), body)
    await removeAccount(tx, id)
  })
  await tryObjectDeletion()
  return c.body(null, 204)
})
consoleWrites.post('/data/credentials/:id/revoke', requireDataAccess, async (c) => {
  const id = idOf(c)
  const body = versionActionInput.parse(await c.req.json())
  await perform(c, 'credential.revoke', id, body, async (tx) => {
    await lockUser(tx, id)
    const [row] = await tx
      .select({ version: credential.version, updatedAt: credential.updatedAt })
      .from(credential)
      .where(eq(credential.userId, id))
      .for('update')
    if (!row) missing()
    checkVersion(row, body)
    await removeReports(tx, eq(report.userId, id))
    await tx.delete(credential).where(eq(credential.userId, id))
  })
  return c.body(null, 204)
})
consoleWrites.post('/data/guests/:id/revoke', requireDataAccess, async (c) => {
  const id = idOf(c)
  const body = versionActionInput.parse(await c.req.json())
  await perform(c, 'guest.revoke', id, body, async (tx) => {
    checkVersion(await lockGuest(tx, id), body)
    await tx.delete(guest).where(eq(guest.id, id))
  })
  return c.body(null, 204)
})
consoleWrites.post('/data/sessions/:id/revoke', requireDataAccess, async (c) => {
  const id = idOf(c)
  const body = timestampActionInput.parse(await c.req.json())
  await perform(c, 'session.revoke', id, body, async (tx) => {
    const [owner] = await tx
      .select({ userId: session.userId })
      .from(session)
      .where(eq(session.id, id))
    if (!owner) missing()
    await lockUser(tx, owner.userId)
    const [row] = await tx
      .select({ userId: session.userId, updatedAt: session.updatedAt })
      .from(session)
      .where(eq(session.id, id))
      .for('update')
    if (!row) missing()
    if (row.userId !== owner.userId) changed()
    checkVersion(row, body)
    await tx.delete(session).where(eq(session.id, id))
  })
  return c.body(null, 204)
})
for (const action of ['stop', 'clear'] as const) {
  consoleWrites.post(`/data/reports/:id/${action}`, requireDataAccess, async (c) => {
    const id = idOf(c)
    const body = versionActionInput.parse(await c.req.json())
    await perform(c, `report.${action}`, id, body, async (tx) => {
      const [owner] = await tx
        .select({ userId: report.userId, guestId: report.guestId })
        .from(report)
        .where(eq(report.id, id))
      if (!owner) missing()
      if (owner.userId) await lockUser(tx, owner.userId)
      else if (owner.guestId) await lockGuest(tx, owner.guestId)
      else missing()
      const [row] = await tx
        .select({
          userId: report.userId,
          guestId: report.guestId,
          status: report.status,
          version: report.version,
          updatedAt: report.updatedAt,
        })
        .from(report)
        .where(eq(report.id, id))
        .for('update')
      if (!row) missing()
      if (row.userId !== owner.userId || row.guestId !== owner.guestId) changed()
      checkVersion(row, body)
      if (action === 'clear') await removeReports(tx, eq(report.id, id))
      else {
        if (!['queued', 'running'].includes(row.status))
          throw new AppError('REPORT_NOT_RUNNING', '报告当前未在采集，请刷新后确认。', 409)
        await stopReport(tx, id, row.version)
      }
    })
    return c.body(null, 204)
  })
}
