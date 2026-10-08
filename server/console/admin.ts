import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { consoleConfigured, createConsoleAuth, lockConsoleAdmin } from './auth'
import { consoleAccount, consoleSession, consoleUser } from './schema'

const input = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(20).max(128),
})

export async function provisionConsoleAdmin(
  mode: 'init' | 'reset',
  credentials: { username: string; password: string },
) {
  if (!consoleConfigured()) throw new Error('请先配置数据库、应用地址和独立的后台认证密钥。')
  const parsed = input.safeParse(credentials)
  if (!parsed.success)
    throw new Error('管理员账号须为 3–30 位字母、数字、下划线、点或连字符；密码须为 20–128 位。')
  const { username, password } = parsed.data
  return getDb().transaction(async (tx) => {
    await lockConsoleAdmin(tx)
    const [admin] = await tx.select().from(consoleUser)
    if (mode === 'init' && admin) return 'exists' as const
    const auth = createConsoleAuth(tx, true)
    if (mode === 'init') {
      await auth.api.signUpEmail({
        body: {
          username,
          password,
          name: '超级管理员',
          email: `${randomUUID()}@console.invalid`,
        },
      })
      return 'created' as const
    }
    if (!admin || admin.username !== username)
      throw new Error('管理员不存在或账号不匹配，未重置密码。')
    const context = await auth.$context
    const hash = await context.password.hash(password)
    const updated = await tx
      .update(consoleAccount)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(consoleAccount.userId, admin.id), eq(consoleAccount.providerId, 'credential')))
      .returning({ id: consoleAccount.id })
    if (updated.length !== 1) throw new Error('管理员凭据异常，未重置密码。')
    await tx.delete(consoleSession).where(eq(consoleSession.userId, admin.id))
    return 'reset' as const
  })
}
