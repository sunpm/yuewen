import type { Context, MiddlewareHandler } from 'hono'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { AppEnv, Transaction } from '../connections'
import { limit } from '../connections'
import { getDb } from '../db'
import { AppError } from '../weread'
import { consoleSession } from './schema'

export const requireDataAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (process.env.CONSOLE_DATA_ENABLED !== 'true')
    throw new AppError('CONSOLE_DATA_UNAVAILABLE', '用户与数据管理尚未启用。', 503)
  const [migration] = await getDb().execute(sql`select
    exists(select 1 from pg_attribute where attrelid = to_regclass('console_audit') and attname = 'reason' and not attisdropped)
    and exists(select 1 from pg_attribute where attrelid = to_regclass('report_replacement') and attname = 'guest_id' and not attisdropped) as ready`)
  if (!migration.ready)
    throw new AppError('CONSOLE_DATA_UNAVAILABLE', '用户与数据管理迁移尚未完成。', 503)
  await limit(`console:data:${c.get('consoleAccess').userId}`, 120, 60)
  await next()
}

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
