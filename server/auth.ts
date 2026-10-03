import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { getDb } from './db'
import * as schema from './db/schema'
export function authConfigured() {
  return ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'APP_URL', 'RESEND_API_KEY', 'EMAIL_FROM'].every(
    (k) => Boolean(process.env[k]),
  )
}
export function createAuth() {
  return betterAuth({
    appName: '阅纹',
    baseURL: process.env.APP_URL,
    basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [process.env.APP_URL!],
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      freshAge: 600,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      useSecureCookies: process.env.APP_URL?.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/email-otp/send-verification-otp': { window: 60, max: 1 },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        rateLimit: { window: 60, max: 5 },
        async sendVerificationOTP({ email, otp, type }) {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM,
              to: [email],
              subject: type === 'forget-password' ? '【阅纹】设置或重置密码' : '【阅纹】登录验证码',
              text: `你的阅纹验证码是：${otp}\n\n5 分钟内有效，请勿转发。\n这是自动通知邮件，请勿直接回复。`,
            }),
            signal: AbortSignal.timeout(10000),
          })
          if (!response.ok) throw new Error('Email delivery unavailable')
        },
      }),
    ],
    logger: { disabled: true },
  })
}
let auth: ReturnType<typeof createAuth> | undefined
export const getAuth = () => {
  auth ??= createAuth()
  return auth
}
