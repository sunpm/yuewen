import { betterAuth } from 'better-auth'
import { username } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'
import type { Transaction } from '../connections'
import {
  consoleAccount,
  consoleRateLimit,
  consoleSession,
  consoleUser,
  consoleVerification,
} from './schema'

export function consoleConfigured() {
  const secret = process.env.CONSOLE_AUTH_SECRET
  return Boolean(
    process.env.DATABASE_URL &&
    process.env.APP_URL &&
    secret &&
    secret.length >= 32 &&
    secret !== process.env.BETTER_AUTH_SECRET,
  )
}

// ponytail: one administrator; serialize login and reset, use per-admin locks if that changes.
export async function lockConsoleAdmin(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('yuewen-console-admin'))`)
}

export function createConsoleAuth(
  db: ReturnType<typeof getDb> | Transaction = getDb(),
  initialize = false,
) {
  return betterAuth({
    appName: '阅纹后台',
    baseURL: process.env.APP_URL,
    basePath: '/api/console/auth',
    secret: process.env.CONSOLE_AUTH_SECRET,
    trustedOrigins: [process.env.APP_URL!],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: consoleUser,
        session: consoleSession,
        account: consoleAccount,
        verification: consoleVerification,
        rateLimit: consoleRateLimit,
      },
    }),
    session: {
      expiresIn: 8 * 3600,
      disableSessionRefresh: true,
      freshAge: 600,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !initialize,
      autoSignIn: false,
      minPasswordLength: 20,
      maxPasswordLength: 128,
    },
    advanced: {
      cookiePrefix: 'yuewen-console',
      useSecureCookies: process.env.APP_URL?.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'strict', path: '/api/console' },
      ipAddress: { ipAddressHeaders: ['x-console-client-ip'] },
    },
    rateLimit: {
      enabled: !initialize,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/username': { window: 60, max: 5 } },
    },
    plugins: [
      username({
        displayUsername: false,
        immutableUsername: true,
        usernameValidator: (value) => /^[a-zA-Z0-9_.-]+$/.test(value),
      }),
    ],
    logger: { disabled: true },
  })
}

let auth: ReturnType<typeof createConsoleAuth> | undefined
export const getConsoleAuth = () => (auth ??= createConsoleAuth())
