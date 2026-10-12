import { and, eq, gt, sql, type SQL } from 'drizzle-orm'
import type { Access, Transaction } from './connections'
import type { getDb } from './db'
import { report, reportReplacement } from './db/schema'

const replacementOwner = (access: Access) =>
  access.kind === 'guest'
    ? eq(reportReplacement.guestId, access.ownerId)
    : sql`${reportReplacement.userId} = ${access.ownerId} and ${reportReplacement.sessionId} = ${access.sessionId}`

export async function findReplacement(
  db: Transaction | ReturnType<typeof getDb>,
  access: Access,
  field: 'id' | 'requestId',
  value: string,
) {
  // Older production schemas remain usable while C3 is disabled and awaiting migration.
  if (access.kind === 'guest') {
    const [schema] = await db.execute(sql`select exists(select 1 from pg_attribute
      where attrelid = to_regclass('report_replacement') and attname = 'guest_id' and not attisdropped) as ready`)
    if (!schema.ready) return undefined
  }
  const [row] = await db
    .select({ id: reportReplacement.id })
    .from(reportReplacement)
    .where(
      and(
        replacementOwner(access),
        eq(reportReplacement[field], value),
        gt(reportReplacement.expiresAt, new Date()),
      ),
    )
  return row
}

export async function rememberAccountReport(
  tx: Transaction,
  row: { id: string; userId: string; sessionId: string; requestId: string; expiresAt: Date },
) {
  // Explicit columns also work before the guest receipt migration is applied.
  await tx.execute(sql`insert into report_replacement (id, user_id, session_id, request_id, expires_at)
    values (${row.id}, ${row.userId}, ${row.sessionId}, ${row.requestId}, ${row.expiresAt.toISOString()}::timestamptz)
    on conflict do nothing`)
}

// Callers lock the owner first, matching report creation, collection and guest conversion.
export async function removeReports(tx: Transaction, where: SQL) {
  await tx.execute(sql`insert into report_replacement (id, user_id, session_id, guest_id, request_id, expires_at)
    select id, user_id, session_id, guest_id, request_id, expires_at from reading_report where ${where}
    on conflict do nothing`)
  await tx.delete(report).where(where)
}

export async function stopReport(tx: Transaction, id: string, version: number) {
  const [updated] = await tx
    .update(report)
    .set({
      status: 'cancelled',
      leaseId: null,
      leaseUntil: null,
      version: version + 1,
      updatedAt: new Date(),
    })
    .where(eq(report.id, id))
    .returning({
      id: report.id,
      status: report.status,
      version: report.version,
      leaseId: report.leaseId,
      leaseUntil: report.leaseUntil,
      updatedAt: report.updatedAt,
    })
  return updated
}
