import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import type { Access, Transaction } from '../connections'
import { lockOwner } from '../connections'
import type { ManagementReason } from '../../shared/console'
import { getDb } from '../db'
import {
  consoleAudit,
  feedback,
  feedbackAttachment,
  feedbackObjectDelete,
  feedbackStorageScan,
  feedbackSubmission,
  session,
  user,
} from '../db/schema'
import { AppError } from '../weread'
import {
  recordRecoveryBatch,
  recordRecoveryIntent,
  recoveryLoggingEnabled,
} from '../recovery/journal'
import { deleteScreenshot, listScreenshots, r2Configured } from './storage'

export const DAY = 86400_000
export const feedbackEnabled = () =>
  process.env.FEEDBACK_ENABLED === 'true' && !!process.env.DATABASE_URL
export async function feedbackTablesExist(db: Transaction | ReturnType<typeof getDb> = getDb()) {
  const [row] = await db.execute(sql`select to_regclass('feedback') is not null as present`)
  return row.present === true
}
// ponytail: one short global DB lock fits 200 reservations/day; split only if this budget grows.
export async function lockFeedback(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('yuewen-feedback'))`)
}
export async function audit(
  tx: Transaction,
  actorId: string | null,
  action: string,
  targetId: string,
  reason?: ManagementReason,
  result = 'success',
) {
  // Existing C2/self-service operations remain compatible before the optional C3 migration.
  await tx.execute(sql`insert into ${consoleAudit} (id, actor_id, action, target_id, result, expires_at${reason ? sql`, reason` : sql``})
    values (${randomUUID()}, ${actorId}, ${action}, ${targetId}, ${result}, ${new Date(Date.now() + 180 * DAY).toISOString()}::timestamptz${reason ? sql`, ${reason}` : sql``})`)
}
export async function queueObjectDelete(
  tx: Transaction,
  objectKey: string,
  bytes: number,
  notBefore = new Date(),
) {
  await recordRecoveryIntent('object.delete', objectKey, { bytes, notBefore })
  await tx
    .insert(feedbackObjectDelete)
    .values({ objectKey, bytes, nextAttemptAt: notBefore })
    .onConflictDoUpdate({
      target: feedbackObjectDelete.objectKey,
      set: {
        revision: sql`${feedbackObjectDelete.revision} + 1`,
        nextAttemptAt: sql`greatest(${feedbackObjectDelete.nextAttemptAt}, ${notBefore.toISOString()}::timestamptz)`,
      },
    })
}
export async function removeAttachments(tx: Transaction, where: SQL) {
  if (recoveryLoggingEnabled()) {
    const attachments = await tx.select().from(feedbackAttachment).where(where)
    // Recovery also waits for the maximum upload lease before draining these tasks.
    await recordRecoveryBatch(
      attachments.map((attachment) => ({
        action: 'object.delete',
        targetId: attachment.objectKey,
        bytes: attachment.bytes,
        notBefore: new Date(Date.now() + 120_000).toISOString(),
      })),
    )
  }
  await tx.execute(sql`insert into feedback_object_delete (object_key, bytes, next_attempt_at)
    select a.object_key, a.bytes, greatest(now(), coalesce(s.lease_until + interval '1 minute', now()))
    from feedback_attachment a left join feedback_submission s on s.feedback_id = a.feedback_id
    where a.feedback_id in (select feedback_id from feedback_attachment where ${where})
    on conflict (object_key) do update set revision = feedback_object_delete.revision + 1,
      next_attempt_at = greatest(feedback_object_delete.next_attempt_at, excluded.next_attempt_at)`)
  await tx.delete(feedbackAttachment).where(where)
}
export async function removeFeedback(tx: Transaction, where: SQL) {
  if (recoveryLoggingEnabled()) {
    const removed = await tx.select({ id: feedback.id }).from(feedback).where(where)
    await recordRecoveryBatch(
      removed.map((row) => ({ action: 'feedback.delete', targetId: row.id })),
    )
  }
  const ids = tx.select({ id: feedback.id }).from(feedback).where(where)
  // Revoke access and transfer the byte reservation to the durable outbox in one transaction.
  await removeAttachments(tx, inArray(feedbackAttachment.feedbackId, ids))
  await tx
    .update(feedbackSubmission)
    .set({ state: 'deleted', leaseId: null })
    .where(inArray(feedbackSubmission.feedbackId, ids))
  await tx.delete(feedback).where(where)
}
// Callers hold the user row lock and authorize the complete transaction before commit.
export async function removeAccount(tx: Transaction, userId: string) {
  await recordRecoveryIntent('account.delete', userId)
  const withFeedback = await feedbackTablesExist(tx)
  if (withFeedback) {
    await lockFeedback(tx)
    await removeFeedback(tx, eq(feedback.userId, userId))
  }
  await tx.delete(user).where(eq(user.id, userId))
  return withFeedback
}

export async function deleteAccount(access: Access) {
  await getDb().transaction(async (tx) => {
    await lockOwner(tx, access)
    const [login] = await tx
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt })
      .from(session)
      .where(and(eq(session.id, access.sessionId), eq(session.userId, access.ownerId)))
      .for('update')
    if (!login || Date.now() - login.createdAt.getTime() > 600_000)
      throw new AppError('REAUTH_REQUIRED', '删除账号前，请先退出并重新登录。', 403)
    if (await removeAccount(tx, access.ownerId)) {
      await audit(tx, null, 'account.self_delete', access.ownerId)
    }
    // The session has been deleted by cascade; its locked snapshot remains authoritative.
    if (login.expiresAt.getTime() <= Date.now())
      throw new AppError('AUTH_REQUIRED', '账号登录已过期，请重新登录。', 401)
    if (Date.now() - login.createdAt.getTime() > 600_000)
      throw new AppError('REAUTH_REQUIRED', '删除账号前，请先退出并重新登录。', 403)
  })
  await tryObjectDeletion()
}

// Never let storage downtime prevent the caller's reading/authentication cleanup.
export async function cleanupFeedback() {
  if (!(await feedbackTablesExist())) return { expired: 0, deletedObjects: 0, storageFailed: false }
  const deadline = Date.now() + 20_000
  const db = getDb()
  const expired = await db.transaction(async (tx) => {
    await lockFeedback(tx)
    const stale = await tx
      .select({ id: feedback.id })
      .from(feedback)
      .where(
        or(
          lt(feedback.expiresAt, new Date()),
          and(isNull(feedback.submittedAt), lt(feedback.createdAt, new Date(Date.now() - DAY))),
        ),
      )
      .limit(100)
    if (stale.length)
      await removeFeedback(
        tx,
        inArray(
          feedback.id,
          stale.map((row) => row.id),
        ),
      )
    const images = await tx
      .select()
      .from(feedbackAttachment)
      .where(lt(feedbackAttachment.expiresAt, new Date()))
      .limit(100)
    if (images.length)
      await removeAttachments(
        tx,
        inArray(
          feedbackAttachment.feedbackId,
          images.map((row) => row.feedbackId),
        ),
      )
    await tx.execute(
      sql`delete from feedback_submission where request_id in (select request_id from feedback_submission where expires_at <= now() limit 500)`,
    )
    await tx.execute(
      sql`delete from feedback_context where id in (select id from feedback_context where expires_at <= now() and not exists (select 1 from feedback_submission where context_id = feedback_context.id) limit 500)`,
    )
    await tx.execute(
      sql`delete from console_audit where id in (select id from console_audit where expires_at <= now() limit 500)`,
    )
    return stale.length + images.length
  })
  const deletion = await drainObjectDeletes(deadline)
  const { deletedObjects } = deletion
  let { storageFailed } = deletion
  // One persisted page per run: valid objects cannot starve orphan reconciliation.
  if (!storageFailed && Date.now() < deadline - 5_000) {
    const scan = await db.transaction(async (tx) => {
      await tx.insert(feedbackStorageScan).values({ id: 1 }).onConflictDoNothing()
      const [row] = await tx
        .select()
        .from(feedbackStorageScan)
        .where(and(eq(feedbackStorageScan.id, 1), lt(feedbackStorageScan.nextScanAt, new Date())))
        .for('update', { skipLocked: true })
      if (!row) return undefined
      const [claimed] = await tx
        .update(feedbackStorageScan)
        .set({ nextScanAt: new Date(Date.now() + 60_000) })
        .where(eq(feedbackStorageScan.id, 1))
        .returning()
      return claimed
    })
    if (scan) {
      try {
        const objects = await listScreenshots(scan.cursor ?? undefined)
        await db.transaction(async (tx) => {
          await lockFeedback(tx)
          const old = (objects.Contents ?? []).filter(
            (object) =>
              object.Key &&
              object.LastModified &&
              object.LastModified.getTime() <= Date.now() - DAY,
          )
          if (old.length) {
            const linked = await tx
              .select({ key: feedbackAttachment.objectKey })
              .from(feedbackAttachment)
              .where(
                inArray(
                  feedbackAttachment.objectKey,
                  old.map((object) => object.Key!),
                ),
              )
            const keys = new Set(linked.map((row) => row.key))
            const orphans = old.filter((object) => !keys.has(object.Key!))
            if (orphans.length)
              await tx
                .insert(feedbackObjectDelete)
                .values(
                  orphans.map((object) => ({ objectKey: object.Key!, bytes: object.Size ?? 0 })),
                )
                .onConflictDoNothing()
          }
          await tx
            .update(feedbackStorageScan)
            .set({ cursor: objects.NextContinuationToken ?? null, nextScanAt: new Date() })
            .where(
              and(
                eq(feedbackStorageScan.id, 1),
                eq(feedbackStorageScan.nextScanAt, scan.nextScanAt),
              ),
            )
        })
      } catch {
        storageFailed = true
      }
    }
  }
  return { expired, deletedObjects, storageFailed }
}

export async function drainObjectDeletes(deadline = Date.now() + 10_000, maximum = 20) {
  const db = getDb()
  let deletedObjects = 0
  let storageFailed = false
  if (!r2Configured()) return { deletedObjects, storageFailed: true }
  let bytes = 0
  while (deletedObjects < maximum && bytes < 20 * 1024 * 1024 && Date.now() < deadline - 5_000) {
    const task = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(feedbackObjectDelete)
        .where(lt(feedbackObjectDelete.nextAttemptAt, new Date()))
        .limit(1)
        .for('update', { skipLocked: true })
      if (!row) return undefined
      const [claimed] = await tx
        .update(feedbackObjectDelete)
        .set({
          attempts: row.attempts + 1,
          revision: row.revision + 1,
          nextAttemptAt: new Date(Date.now() + 60_000),
        })
        .where(eq(feedbackObjectDelete.objectKey, row.objectKey))
        .returning()
      return claimed
    })
    if (!task) break
    bytes += task.bytes
    const current = and(
      eq(feedbackObjectDelete.objectKey, task.objectKey),
      eq(feedbackObjectDelete.revision, task.revision),
    )
    try {
      await recordRecoveryIntent('object.delete', task.objectKey, {
        bytes: task.bytes,
        notBefore: task.nextAttemptAt,
      })
      await deleteScreenshot(task.objectKey)
      await db.delete(feedbackObjectDelete).where(current)
      deletedObjects++
    } catch {
      storageFailed = true
      await db
        .update(feedbackObjectDelete)
        .set({
          nextAttemptAt: new Date(
            Date.now() + Math.min(DAY, 60_000 * 2 ** Math.min(task.attempts, 11)),
          ),
        })
        .where(current)
      break
    }
  }
  return { deletedObjects, storageFailed }
}

export async function tryObjectDeletion() {
  if (!r2Configured()) return
  try {
    await drainObjectDeletes(Date.now() + 6_000, 1)
  } catch {
    console.warn('yuewen.feedback_storage_cleanup_deferred')
  }
}
