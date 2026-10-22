import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postgres from 'postgres'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { z } from 'zod'
import { getDb } from '../server/db'
import { account, credential, feedback, feedbackAttachment } from '../server/db/schema'
import { consoleAccount } from '../server/console/schema'
import {
  queueObjectDelete,
  removeAccount,
  removeAttachments,
  removeFeedback,
} from '../server/feedback/lifecycle'
import { recoveryEntry, type RecoveryEvent } from '../server/recovery/journal'
import {
  BACKUP_DAYS,
  MAX_BACKUP_BYTES,
  listRecoveryObjects,
  putRecoveryObject,
  readRecoveryObject,
  recoveryConfig,
  recoveryEnabled,
} from '../server/recovery/storage'

const run = promisify(execFile)
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const manifest = z
  .object({
    format: z.literal(1),
    startedAt: z.iso.datetime(),
    epoch: z.uuid(),
    source: z.string().length(64),
    checkpoint: z.string(),
    sha256: z.string().length(64),
    revision: z.string().min(1),
    dump: z.string(),
  })
  .strict()
function encryptionKey() {
  const key = Buffer.from(process.env.RECOVERY_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('RECOVERY_ENCRYPTION_KEY must contain 32 random bytes')
  return key
}
function databaseConfig() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  const name = decodeURIComponent(url.pathname.slice(1))
  if (
    name !== process.env.RECOVERY_DATABASE ||
    !name ||
    url.hostname.includes('-pooler.') ||
    url.searchParams.has('options')
  )
    throw new Error(
      'Explicit RECOVERY_DATABASE and direct endpoint without search_path are required',
    )
  return { url, name, identity: digest(`${url.hostname}:${url.port || '5432'}/${name}`) }
}
async function pgTool(tool: 'pg_dump' | 'pg_restore', args: string[]) {
  const { url, name } = databaseConfig()
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key]
  try {
    await run(process.env.PG_BIN ? join(process.env.PG_BIN, tool) : tool, args, {
      timeout: 600_000,
      env: {
        ...env,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: name,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get('sslmode') || 'require',
        PGCONNECT_TIMEOUT: '10',
      },
    })
  } catch {
    // libpq diagnostics may contain connection details; do not print child-process objects.
    throw new Error(`${tool} failed; target remains isolated`)
  }
}
export async function backupDatabase() {
  if (!recoveryEnabled()) throw new Error('Independent journal must be enabled before backup')
  const config = recoveryConfig()
  const { identity } = databaseConfig()
  const key = encryptionKey()
  const revision = process.env.RECOVERY_CODE_REVISION
  if (!revision) throw new Error('RECOVERY_CODE_REVISION is required')
  const startedAt = new Date().toISOString()
  const checkpoint = await putRecoveryObject(
    'journal',
    Buffer.from(
      JSON.stringify(
        recoveryEntry.parse({
          id: randomUUID(),
          at: startedAt,
          epoch: config.epoch,
          action: 'checkpoint',
          targetId: revision,
        }),
      ),
    ),
  )
  const directory = await mkdtemp(join(tmpdir(), 'yuewen-backup-'))
  try {
    const file = join(directory, 'database.dump')
    await pgTool('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--schema=public',
      '--schema=drizzle',
      '--strict-names',
      `--file=${file}`,
    ])
    await chmod(file, 0o600)
    if ((await stat(file)).size > MAX_BACKUP_BYTES)
      throw new Error('Database exceeds backup size budget')
    const dump = await readFile(file)
    // ponytail: bounded in-memory envelope for the current small DB; stream/multipart beyond 128 MiB.
    if (dump.length > MAX_BACKUP_BYTES) throw new Error('Database exceeds backup size budget')
    const payload = Buffer.from(
      JSON.stringify(
        manifest.parse({
          format: 1,
          startedAt,
          epoch: config.epoch,
          source: identity,
          checkpoint,
          sha256: digest(dump),
          revision,
          dump: dump.toString('base64'),
        }),
      ),
    )
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from('yuewen-backup-v1'))
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
    const object = await putRecoveryObject(
      'backups',
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
    )
    return { object, startedAt, bytes: dump.length, sha256: digest(dump), revision }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function replayRecoveryEvents(events: RecoveryEvent[]) {
  if (recoveryEnabled())
    throw new Error('Replay requires a separate process with journal writes disabled')
  await getDb().transaction(async (tx) => {
    for (const event of events) {
      if (event.action === 'account.delete') {
        await tx.execute(sql`select id from app_user where id = ${event.targetId} for update`)
        await removeAccount(tx, event.targetId)
      } else if (event.action === 'credential.revoke') {
        await tx.delete(credential).where(eq(credential.userId, event.targetId))
      } else if (event.action === 'feedback.delete') {
        await removeFeedback(tx, eq(feedback.id, event.targetId))
      } else if (event.action === 'object.delete') {
        await removeAttachments(tx, eq(feedbackAttachment.objectKey, event.targetId))
        await queueObjectDelete(
          tx,
          event.targetId,
          event.bytes!,
          new Date(Math.max(Date.parse(event.notBefore!), Date.now() + 120_000)),
        )
      }
    }
    // Password changes can race with a snapshot, too. Never reopen any restored password/hash.
    // Frontend users re-verify email; the console administrator uses the explicit reset CLI.
    await tx
      .update(account)
      .set({ password: null, accessToken: null, refreshToken: null, idToken: null })
    await tx.update(consoleAccount).set({ password: null })
    for (const table of [
      'reading_report',
      'report_replacement',
      'connection_save',
      'auth_session',
      'auth_verification',
      'console_auth_session',
      'console_auth_verification',
      'guest_connection',
      'feedback_submission',
      'feedback_context',
    ]) {
      await tx.execute(sql`delete from ${sql.identifier(table)}`)
    }
    // Backup age is never allowed to extend the original feedback/attachment retention period.
    await removeFeedback(tx, sql`${feedback.expiresAt} <= now()`)
    await removeAttachments(tx, sql`${feedbackAttachment.expiresAt} <= now()`)
    await tx.delete(credential).where(eq(credential.status, 'invalid'))
  })
}
export async function restoreDatabase(object: string) {
  if (process.env.RECOVERY_WRITES_FROZEN !== 'true' || recoveryEnabled())
    throw new Error('Freeze source writes/jobs and use an isolated recovery process first')
  const { identity } = databaseConfig()
  const config = recoveryConfig()
  if (!object.startsWith(`${config.prefix}backups/${config.epoch}/`))
    throw new Error('Invalid backup object')
  const encrypted = await readRecoveryObject(object, MAX_BACKUP_BYTES * 1.5)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), encrypted.subarray(0, 12))
  decipher.setAAD(Buffer.from('yuewen-backup-v1'))
  decipher.setAuthTag(encrypted.subarray(12, 28))
  const data = manifest.parse(
    JSON.parse(
      Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString(),
    ),
  )
  const age = Date.now() - Date.parse(data.startedAt)
  if (
    data.source === identity ||
    data.epoch !== config.epoch ||
    age < 0 ||
    age >= BACKUP_DAYS * 86400_000
  )
    throw new Error('Source target, journal epoch or backup age is unsafe')
  const dump = Buffer.from(data.dump, 'base64')
  if (dump.length > MAX_BACKUP_BYTES || digest(dump) !== data.sha256)
    throw new Error('Backup digest mismatch')
  const objects = await listRecoveryObjects('journal')
  if (!objects.some((entry) => entry.key === data.checkpoint))
    throw new Error('Journal checkpoint missing')
  const events: RecoveryEvent[] = []
  for (const entry of objects) {
    const parsed = recoveryEntry.parse(
      JSON.parse((await readRecoveryObject(entry.key, 512 * 1024)).toString()),
    )
    const batch = Array.isArray(parsed) ? parsed : [parsed]
    if (batch.some((event) => event.epoch !== config.epoch))
      throw new Error('Journal epoch mismatch')
    events.push(...batch)
  }
  // Replay the entire retained epoch, including pre-snapshot intents with delayed DB commits.
  const db = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
  const directory = await mkdtemp(join(tmpdir(), 'yuewen-restore-'))
  try {
    const tables = await db`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'
      and c.relkind in ('r','p','v','m','S','f') limit 1`
    if (tables.length) throw new Error('Restore requires a new empty database')
    await db`drop schema if exists public` // No CASCADE: unexpected objects must block restore.
    const file = join(directory, 'database.dump')
    await writeFile(file, dump, { mode: 0o600, flag: 'wx' })
    await pgTool('pg_restore', [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      `--dbname=${databaseConfig().name}`,
      file,
    ])
    // Pre-upgrade snapshots need the current tables before replay can retain deletion tasks.
    await migrate(drizzle(db), {
      migrationsFolder: fileURLToPath(new URL('../server/db/migrations', import.meta.url)),
    })
    await replayRecoveryEvents(events)
    return {
      restored: true,
      events: events.length,
      sha256: data.sha256,
      revision: data.revision,
      isolated: true,
      objectCleanupRequired: true,
      consolePasswordResetRequired: true,
    }
  } finally {
    await db.end()
    await rm(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, object] = process.argv.slice(2)
    if (command === 'backup') console.log(JSON.stringify(await backupDatabase()))
    else if (command === 'restore' && object)
      console.log(JSON.stringify(await restoreDatabase(object)))
    else throw new Error('Usage: database-recovery.ts backup | restore <object-key>')
    process.exit(0)
  } catch {
    console.error('数据库备份/恢复失败；未开放恢复环境。检查配置、存储权限、日志完整性及空库要求。')
    process.exit(1)
  }
}
