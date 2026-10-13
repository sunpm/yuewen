import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AppError } from '../weread'
import { putRecoveryObject, recoveryConfig, recoveryEnabled } from './storage'
export { recoveryEnabled as recoveryLoggingEnabled } from './storage'

const target = z.string().min(1).max(512)
export const recoveryEvent = z
  .object({
    id: z.uuid(),
    at: z.iso.datetime(),
    epoch: z.uuid(),
    action: z.enum([
      'account.delete',
      'credential.revoke',
      'feedback.delete',
      'object.delete',
      'checkpoint',
    ]),
    targetId: target,
    bytes: z.number().int().nonnegative().optional(),
    notBefore: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (event) =>
      event.action !== 'object.delete' ||
      (event.targetId.startsWith('feedback/') &&
        event.bytes !== undefined &&
        event.notBefore !== undefined),
  )
export type RecoveryEvent = z.infer<typeof recoveryEvent>
export const recoveryEntry = z.union([recoveryEvent, z.array(recoveryEvent).min(1).max(100)])
type Intent = Pick<RecoveryEvent, 'action' | 'targetId' | 'bytes' | 'notBefore'>

// Write-ahead intent: an ambiguous/rolled-back DB write is deliberately still replayed.
// All sessions, passwords, guests and reports are unconditionally invalidated on recovery.
export async function recordRecoveryIntent(
  action: RecoveryEvent['action'],
  targetId: string,
  object?: { bytes: number; notBefore: Date },
) {
  return recordRecoveryBatch([
    {
      action,
      targetId,
      ...(object && { bytes: object.bytes, notBefore: object.notBefore.toISOString() }),
    },
  ])
}
export async function recordRecoveryBatch(intents: Intent[]) {
  if (!recoveryEnabled()) return
  try {
    for (let offset = 0; offset < intents.length; offset += 100) {
      const events = intents.slice(offset, offset + 100).map((intent) =>
        recoveryEvent.parse({
          ...intent,
          id: randomUUID(),
          at: new Date().toISOString(),
          epoch: recoveryConfig().epoch,
        }),
      )
      await putRecoveryObject('journal', Buffer.from(JSON.stringify(events)))
    }
  } catch {
    throw new AppError(
      'RECOVERY_LOG_UNAVAILABLE',
      '安全日志暂不可用，本次操作未完成，请稍后重试。',
      503,
      true,
    )
  }
}
