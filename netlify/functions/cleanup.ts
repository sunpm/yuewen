import { sql } from 'drizzle-orm'
import { getDb } from '../../server/db'
import { consoleConfigured } from '../../server/console/auth'
import { cleanupFeedback } from '../../server/feedback/lifecycle'
export default async (_request: Request, context?: { deploy: { context: string } }) => {
  if (context?.deploy.context !== 'production') return new Response(null, { status: 204 })
  if (process.env.APP_MAINTENANCE_MODE === 'true') return new Response(null, { status: 204 })
  if (!process.env.DATABASE_URL) return new Response(null, { status: 204 })
  const db = getDb()
  if (consoleConfigured()) {
    await db.execute(
      sql`delete from console_auth_session where id in (select id from console_auth_session where expires_at < now() limit 500 for update skip locked)`,
    )
    await db.execute(
      sql`delete from console_auth_verification where id in (select id from console_auth_verification where expires_at < now() limit 500 for update skip locked)`,
    )
    await db.execute(
      sql`delete from console_auth_rate_limit where id in (select id from console_auth_rate_limit where last_request < extract(epoch from now()) * 1000 - 86400000 limit 500 for update skip locked)`,
    )
  }
  // Lock candidates before deletion; leave concurrent renewals for the next cleanup run.
  await db.execute(
    sql`delete from connection_save where (user_id, request_id) in (select user_id, request_id from connection_save where expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from guest_connection where id in (select id from guest_connection where expires_at < now() or idle_expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from report_replacement where id in (select id from report_replacement where expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from reading_report where id in (select id from reading_report where expires_at < now() or idle_expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from auth_session where id in (select id from auth_session where expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from auth_verification where id in (select id from auth_verification where expires_at < now() limit 500 for update skip locked)`,
  )
  await db.execute(
    sql`delete from request_limit where key in (select key from request_limit where expires_at < now() limit 500 for update skip locked)`,
  )
  // Reading/authentication cleanup completes first, independently of R2 availability.
  const feedback = await cleanupFeedback()
  if (feedback.storageFailed) console.warn('yuewen.feedback_storage_cleanup_deferred')
  return new Response(null, { status: 204 })
}
export const config = { schedule: '*/15 * * * *' }
