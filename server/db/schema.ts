import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CollectorState } from '../collector'
export {
  consoleUser,
  consoleSession,
  consoleAccount,
  consoleVerification,
  consoleRateLimit,
} from '../console/schema'
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}
export const user = pgTable('app_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
})
export const session = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => [index('session_user_idx').on(t.userId)],
)
export const account = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_idx').on(t.userId)],
)
export const verification = pgTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)
export const rateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})
export const credential = pgTable('weread_credential', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key').notNull(),
  encryptionVersion: integer('encryption_version').notNull(),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('valid'),
  validatedAt: timestamp('validated_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
})
export const guest = pgTable('guest_connection', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  encryptedKey: text('encrypted_key').notNull(),
  encryptionVersion: integer('encryption_version').notNull(),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('valid'),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
})
export const report = pgTable(
  'reading_report',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'cascade' }),
    guestId: text('guest_id').references(() => guest.id, { onDelete: 'cascade' }),
    keyVersion: integer('key_version').notNull(),
    requestId: text('request_id').notNull(),
    version: integer('version').notNull().default(0),
    status: text('status').notNull().default('queued'),
    state: jsonb('state').$type<CollectorState>().notNull(),
    leaseId: text('lease_id'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('report_session_idx').on(t.sessionId),
    index('report_expiry_idx').on(t.expiresAt),
    uniqueIndex('report_request_idx').on(t.userId, t.requestId),
    uniqueIndex('report_guest_idx').on(t.guestId),
    check(
      'report_owner_check',
      sql`(${t.guestId} is not null and ${t.userId} is null and ${t.sessionId} is null) or (${t.guestId} is null and ${t.userId} is not null and ${t.sessionId} is not null)`,
    ),
  ],
)
export const requestLimit = pgTable('request_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
// Only replacement receipts survive; report bodies and leases are deleted atomically.
export const reportReplacement = pgTable(
  'report_replacement',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('replacement_expiry_idx').on(t.expiresAt),
    uniqueIndex('replacement_request_idx').on(t.userId, t.requestId),
  ],
)
export const connectionSave = pgTable(
  'connection_save',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    guestId: text('guest_id').notNull(),
    reportId: text('report_id').notNull(),
    keyVersion: integer('key_version').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('connection_save_request_idx').on(t.userId, t.requestId)],
)

// Submission contexts expire even when an authenticated session lives longer.
export const feedbackContext = pgTable(
  'feedback_context',
  {
    id: text('id').primaryKey(),
    identityHash: text('identity_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('feedback_context_expiry_idx').on(t.expiresAt),
    index('feedback_context_identity_idx').on(t.identityHash, t.expiresAt),
  ],
)
export const feedbackSubmission = pgTable(
  'feedback_submission',
  {
    requestId: text('request_id').primaryKey(),
    contextId: text('context_id')
      .notNull()
      .references(() => feedbackContext.id),
    digest: text('digest').notNull(),
    feedbackId: text('feedback_id').notNull(),
    state: text('state', { enum: ['pending', 'complete', 'deleted'] }).notNull(),
    leaseId: text('lease_id'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('feedback_submission_expiry_idx').on(t.expiresAt),
    uniqueIndex('feedback_submission_feedback_idx').on(t.feedbackId),
  ],
)
export const feedback = pgTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    ownerType: text('owner_type', { enum: ['account', 'guest', 'visitor'] }).notNull(),
    // Account deletion must enqueue objects before deleting feedback; never cascade this FK.
    userId: text('user_id').references(() => user.id, { onDelete: 'restrict' }),
    guestId: text('guest_id').references(() => guest.id, { onDelete: 'set null' }),
    associatedUserId: text('associated_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    source: text('source', { enum: ['account', 'guest', 'mock', 'none'] }).notNull(),
    description: text('description').notNull(),
    steps: text('steps').notNull(),
    contact: text('contact').notNull(),
    environment: jsonb('environment').$type<Record<string, unknown>>().notNull(),
    serverEnvironment: jsonb('server_environment').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['pending', 'processing', 'resolved', 'closed'] })
      .notNull()
      .default('pending'),
    category: text('category', { enum: ['uncategorized', 'bug', 'suggestion', 'other'] })
      .notNull()
      .default('uncategorized'),
    internalNote: text('internal_note').notNull().default(''),
    version: integer('version').notNull().default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('feedback_created_idx').on(t.createdAt),
    index('feedback_owner_idx').on(t.userId),
    index('feedback_guest_idx').on(t.guestId),
    index('feedback_associated_user_idx').on(t.associatedUserId),
    index('feedback_expiry_idx').on(t.expiresAt),
    check(
      'feedback_owner_check',
      sql`(${t.ownerType} = 'account' and ${t.userId} is not null and ${t.guestId} is null) or (${t.ownerType} = 'guest' and ${t.userId} is null) or (${t.ownerType} = 'visitor' and ${t.userId} is null and ${t.guestId} is null)`,
    ),
  ],
)
export const feedbackAttachment = pgTable(
  'feedback_attachment',
  {
    feedbackId: text('feedback_id')
      .primaryKey()
      .references(() => feedback.id, { onDelete: 'restrict' }),
    objectKey: text('object_key').notNull().unique(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    digest: text('digest').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    state: text('state', { enum: ['pending', 'uploaded'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('feedback_attachment_expiry_idx').on(t.expiresAt)],
)
// Durable outbox: deliberately has no FK to a user, feedback or attachment.
export const feedbackObjectDelete = pgTable(
  'feedback_object_delete',
  {
    objectKey: text('object_key').primaryKey(),
    bytes: integer('bytes').notNull(),
    attempts: integer('attempts').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_delete_due_idx').on(t.nextAttemptAt)],
)
export const feedbackStorageScan = pgTable('feedback_storage_scan', {
  id: integer('id').primaryKey(),
  cursor: text('cursor'),
  nextScanAt: timestamp('next_scan_at', { withTimezone: true }).notNull().defaultNow(),
})
export const consoleAudit = pgTable(
  'console_audit',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    result: text('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('console_audit_expiry_idx').on(t.expiresAt)],
)
