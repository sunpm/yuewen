import type { Context } from 'hono'
import { and, eq, gt } from 'drizzle-orm'
import type { AppEnv, Transaction } from '../connections'
import { getDb } from '../db'
import { AppError } from '../weread'
import { consoleSession } from './schema'

export async function checkConsoleSession(
  c: Context<AppEnv>,
  db: Transaction | ReturnType<typeof getDb> = getDb(),
) {
  const access = c.get('consoleAccess')
  const [login] = await db
    .select({ id: consoleSession.id })
    .from(consoleSession)
    .where(
      and(
        eq(consoleSession.id, access.sessionId),
        eq(consoleSession.userId, access.userId),
        gt(consoleSession.expiresAt, new Date()),
      ),
    )
  if (!login) throw new AppError('CONSOLE_AUTH_REQUIRED', '管理会话已失效，请重新登录。', 401)
}

export const maskEmail = (email: string | null) =>
  email ? `${email.slice(0, 1)}***@${email.split('@')[1] ?? '***'}` : null
