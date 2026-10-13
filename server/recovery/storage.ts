import { randomUUID } from 'node:crypto'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { z } from 'zod'

export const BACKUP_DAYS = 7
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024
export const recoveryEnabled = () => process.env.RECOVERY_LOG_ENABLED === 'true'

export function recoveryConfig() {
  const config = z
    .object({
      account: z.string().regex(/^[a-f0-9]{32}$/),
      accessKey: z.string().min(1),
      secret: z.string().min(1),
      bucket: z.string().min(3),
      scope: z.string().regex(/^[a-z0-9-]{1,64}$/),
      epoch: z.uuid(),
    })
    .parse({
      account: process.env.RECOVERY_R2_ACCOUNT_ID,
      accessKey: process.env.RECOVERY_R2_ACCESS_KEY_ID,
      secret: process.env.RECOVERY_R2_SECRET_ACCESS_KEY,
      bucket: process.env.RECOVERY_R2_BUCKET,
      scope: process.env.RECOVERY_SCOPE,
      epoch: process.env.RECOVERY_EPOCH,
    })
  return { ...config, prefix: `recovery/${config.scope}/` }
}
function storage() {
  const config = recoveryConfig()
  return {
    config,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${config.account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secret },
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  }
}
export async function putRecoveryObject(kind: 'journal' | 'backups', body: Buffer) {
  const { config, client } = storage()
  const key = `${config.prefix}${kind}/${config.epoch}/${new Date().toISOString()}-${randomUUID()}`
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: 'application/octet-stream',
        CacheControl: 'private, no-store',
        IfNoneMatch: '*',
      }),
      { abortSignal: AbortSignal.timeout(kind === 'journal' ? 5_000 : 120_000) },
    )
    return key
  } finally {
    client.destroy()
  }
}
export async function readRecoveryObject(key: string, maximum: number) {
  const { config, client } = storage()
  if (
    !['journal', 'backups'].some((kind) =>
      key.startsWith(`${config.prefix}${kind}/${config.epoch}/`),
    )
  )
    throw new Error('Recovery namespace mismatch')
  try {
    const signal = AbortSignal.timeout(120_000)
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: signal,
    })
    if (!result.Body || !result.ContentLength || result.ContentLength > maximum)
      throw new Error('Invalid recovery object size')
    const reader = result.Body.transformToWebStream().getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > maximum) throw new Error('Recovery object too large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    if (size !== result.ContentLength) throw new Error('Incomplete recovery object')
    return Buffer.concat(chunks)
  } finally {
    client.destroy()
  }
}
export async function listRecoveryObjects(kind: 'journal' | 'backups') {
  const { config, client } = storage()
  const keys: { key: string; modified: Date }[] = []
  let cursor: string | undefined
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: `${config.prefix}${kind}/${config.epoch}/`,
          ContinuationToken: cursor,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      )
      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.LastModified) throw new Error('Incomplete recovery listing')
        keys.push({ key: object.Key, modified: object.LastModified })
      }
      if (page.IsTruncated && !page.NextContinuationToken)
        throw new Error('Incomplete recovery listing')
      cursor = page.NextContinuationToken
    } while (cursor)
    return keys
  } finally {
    client.destroy()
  }
}
