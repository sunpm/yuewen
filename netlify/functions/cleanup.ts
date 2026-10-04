import { sql } from 'drizzle-orm'
import { getDb } from '../../server/db'
export default async () => {
  if (!process.env.DATABASE_URL) return new Response(null, { status: 204 })
  const db = getDb()
  await db.execute(
    sql`delete from connection_save where (user_id, request_id) in (select user_id, request_id from connection_save where expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from guest_connection where id in (select id from guest_connection where expires_at < now() or idle_expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from report_replacement where id in (select id from report_replacement where expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from reading_report where id in (select id from reading_report where expires_at < now() or idle_expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from auth_session where id in (select id from auth_session where expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from auth_verification where id in (select id from auth_verification where expires_at < now() limit 500)`,
  )
  await db.execute(
    sql`delete from request_limit where key in (select key from request_limit where expires_at < now() limit 500)`,
  )
  return new Response(null, { status: 204 })
}
export const config = { schedule: '*/15 * * * *' }
