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
} from 'drizzle-orm/pg-core'
import type { CollectorState } from '../collector'
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
export const report = pgTable(
  'reading_report',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
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
  ],
)
export const requestLimit = pgTable('request_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
