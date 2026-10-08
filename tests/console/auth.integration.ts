import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'

const namespace = `console_test_${randomUUID().replaceAll('-', '')}`
const url = process.env.CONSOLE_TEST_DATABASE_URL || process.env.DATABASE_URL
if (!url) throw new Error('请为后台集成检查提供独立开发数据库。')
// Neon transaction pooling may discard startup search_path. Use its direct endpoint for schema isolation.
const directUrl = new URL(url)
if (directUrl.hostname.endsWith('.neon.tech'))
  directUrl.hostname = directUrl.hostname.replace('-pooler.', '.')
directUrl.searchParams.set('options', `-c search_path=${namespace}`)
const client = postgres(directUrl.toString(), {
  max: 3,
  prepare: false,
  onnotice: () => {},
})
const db = drizzle(client, { schema })
vi.mock('../../server/db', () => ({ getDb: () => db }))
const { app } = await import('../../server/app')
const { provisionConsoleAdmin } = await import('../../server/console/admin')
const { createAuth } = await import('../../server/auth')
const { createConsoleAuth } = await import('../../server/console/auth')
const origin = 'https://console-tests.example'
const admin = { username: 'console-test-admin', password: randomBytes(32).toString('base64url') }
let ip = 0

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.request(
    `${origin}/api${path}`,
    {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { clientIp: `192.0.2.${++ip}` },
  )
}
function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
}
async function login(password = admin.password) {
  const response = await request('/console/auth/sign-in/username', 'POST', {
    username: admin.username,
    password,
  })
  expect(response.status).toBe(200)
  return { cookie: cookieOf(response), response }
}
beforeAll(async () => {
  vi.stubEnv('APP_URL', origin)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('CONSOLE_AUTH_SECRET', randomBytes(32).toString('base64url'))
  vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64url'))
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('EMAIL_FROM', '')
  await client.unsafe(`create schema "${namespace}"`)
  expect((await client`select current_schema() as name`)[0].name).toBe(namespace)
  // Run the committed migrations in a disposable namespace; never touch public tables.
  const journal = JSON.parse(await readFile('server/db/migrations/meta/_journal.json', 'utf8'))
  for (const entry of journal.entries) {
    const migration = (await readFile(`server/db/migrations/${entry.tag}.sql`, 'utf8')).replaceAll(
      '"public".',
      `"${namespace}".`,
    )
    for (const statement of migration.split('--> statement-breakpoint'))
      await client.unsafe(statement)
    if (entry.idx === 2)
      await db
        .insert(schema.user)
        .values({ id: 'existing-reader', name: 'Reader', email: 'reader@example.test' })
  }
})
beforeEach(async () => {
  await db.delete(schema.consoleUser)
  await db.delete(schema.consoleRateLimit)
  await provisionConsoleAdmin('init', admin)
})
afterAll(async () => {
  await client.unsafe(`drop schema if exists "${namespace}" cascade`)
  await client.end()
  vi.unstubAllEnvs()
})

describe('后台独立认证与迁移', () => {
  it('现有库升级保留读者；并发初始化只创建一个管理员且不覆盖密码', async () => {
    expect(await db.select().from(schema.user)).toHaveLength(1)
    await db.delete(schema.consoleUser)
    expect(
      (
        await Promise.all([
          provisionConsoleAdmin('init', admin),
          provisionConsoleAdmin('init', admin),
        ])
      ).sort(),
    ).toEqual(['created', 'exists'])
    expect(
      await provisionConsoleAdmin('init', {
        ...admin,
        password: 'a-different-password-that-must-not-apply',
      }),
    ).toBe('exists')
    expect(await db.select().from(schema.consoleUser)).toHaveLength(1)
    expect(await db.select().from(schema.consoleSession)).toHaveLength(0)
    const [account] = await db.select().from(schema.consoleAccount)
    expect(account.password).not.toBe(admin.password)
    await login()
  })
  it('无邮件配置可登录；管理 Cookie 为独立的安全 Cookie，8 小时不自动续期', async () => {
    const { cookie, response } = await login()
    const header = response.headers.get('set-cookie')!
    expect(header).toContain('__Secure-yuewen-console.session_token=')
    expect(header).toContain('Path=/api/console')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    expect(header).toContain('SameSite=Strict')
    expect(header).not.toContain('Domain=')
    expect(header).not.toContain('session_data=')
    const [session] = await db.select().from(schema.consoleSession)
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeLessThanOrEqual(
      8 * 3600_000,
    )
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeGreaterThan(
      8 * 3600_000 - 2000,
    )
    const overview = await request('/console/overview', 'GET', undefined, cookie)
    expect(overview.status).toBe(200)
    expect(overview.headers.get('cache-control')).toBe('no-store')
    expect((await db.select().from(schema.consoleSession))[0].expiresAt).toEqual(session.expiresAt)
  })
  it('公共认证只开放登录、会话及退出；注册、改密与删除接口不可访问', async () => {
    for (const path of [
      '/sign-up/email',
      '/sign-in/email',
      '/request-password-reset',
      '/change-password',
      '/update-user',
      '/delete-user',
      '/is-username-available',
    ]) {
      expect((await request(`/console/auth${path}`, 'POST', {})).status).toBe(404)
    }
    await expect(
      createConsoleAuth().api.signUpEmail({
        body: {
          name: 'Other',
          email: 'other@example.test',
          password: admin.password,
          username: 'another_admin',
        },
      }),
    ).rejects.toBeTruthy()
    expect(await db.select().from(schema.consoleUser)).toHaveLength(1)
  })
  it('账号错误与密码错误返回相同错误；拒绝跨来源、缺失来源及超大正文', async () => {
    const missing = await request('/console/auth/sign-in/username', 'POST', {
      username: 'nobody',
      password: admin.password,
    })
    const wrong = await request('/console/auth/sign-in/username', 'POST', {
      ...admin,
      password: 'incorrect',
    })
    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect((await missing.json()).code).toBe((await wrong.json()).code)
    for (const Origin of ['', 'https://untrusted.example'])
      expect(
        (await request('/console/auth/sign-in/username', 'POST', admin, undefined, { Origin }))
          .status,
      ).toBe(403)
    expect(
      (
        await request('/console/auth/sign-in/username', 'POST', {
          ...admin,
          password: 'x'.repeat(17000),
        })
      ).status,
    ).toBe(413)
  })
  it('普通用户、游客与管理 Cookie 互不替代，管理密钥不能与前台共用', async () => {
    const front = createAuth()
    const context = await front.$context
    await context.internalAdapter.createAccount({
      userId: 'existing-reader',
      accountId: 'existing-reader',
      providerId: 'credential',
      password: await context.password.hash(admin.password),
    })
    await db
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, 'existing-reader'))
    const frontLogin = await front.api.signInEmail({
      body: { email: 'reader@example.test', password: admin.password },
      asResponse: true,
    })
    expect(frontLogin.status).toBe(200)
    const frontCookie = cookieOf(frontLogin)
    const management = await login()
    for (const cookie of ['', 'yuewen-guest=unverified', frontCookie])
      expect((await request('/console/overview', 'GET', undefined, cookie)).status).toBe(401)
    expect(
      await front.api.getSession({ headers: new Headers({ Cookie: management.cookie }) }),
    ).toBeNull()
    expect(
      await createConsoleAuth().api.getSession({ headers: new Headers({ Cookie: frontCookie }) }),
    ).toBeNull()
    const secret = process.env.CONSOLE_AUTH_SECRET!
    vi.stubEnv('CONSOLE_AUTH_SECRET', process.env.BETTER_AUTH_SECRET)
    expect((await request('/console/overview', 'GET', undefined, management.cookie)).status).toBe(
      503,
    )
    vi.stubEnv('CONSOLE_AUTH_SECRET', secret)
  })
  it('退出立即撤销管理会话；过期、伪造和重放旧 Cookie 都被拒绝', async () => {
    const { cookie } = await login()
    expect((await request('/console/auth/sign-out', 'POST', {}, cookie)).status).toBe(200)
    expect((await request('/console/overview', 'GET', undefined, cookie)).status).toBe(401)
    const current = await login()
    await db.update(schema.consoleSession).set({ expiresAt: new Date(Date.now() - 1000) })
    expect((await request('/console/overview', 'GET', undefined, current.cookie)).status).toBe(401)
    expect(
      (
        await request(
          '/console/overview',
          'GET',
          undefined,
          '__Secure-yuewen-console.session_token=forged',
        )
      ).status,
    ).toBe(401)
  })
  it('显式重置不改变账号，旧密码与旧会话均失效', async () => {
    const { cookie } = await login()
    const password = randomBytes(32).toString('base64url')
    expect(await provisionConsoleAdmin('reset', { ...admin, password })).toBe('reset')
    expect((await request('/console/overview', 'GET', undefined, cookie)).status).toBe(401)
    expect((await request('/console/auth/sign-in/username', 'POST', admin)).status).toBe(401)
    await login(password)
    await expect(
      provisionConsoleAdmin('reset', { username: 'wrong_admin', password }),
    ).rejects.toThrow('不匹配')
  })
  it('登录等待重置事务后只能使用新密码，旧验证不能创建迟到会话', async () => {
    const transaction = await client.reserve()
    try {
      await transaction`begin`
      await transaction`select pg_advisory_xact_lock(hashtext('yuewen-console-admin'))`
      const pending = request('/console/auth/sign-in/username', 'POST', admin)
      const hash = await (
        await createConsoleAuth().$context
      ).password.hash(randomBytes(32).toString('base64url'))
      await transaction`update console_auth_account set password = ${hash}`
      await transaction`delete from console_auth_session`
      await transaction`commit`
      expect((await pending).status).toBe(401)
      expect(await db.select().from(schema.consoleSession)).toHaveLength(0)
    } finally {
      await transaction`rollback`
      transaction.release()
    }
  })
  it('数据库限流按可信平台 IP 共享，伪造转发头不能绕过', async () => {
    for (let n = 0; n < 6; n++) {
      const response = await app.request(
        `${origin}/api/console/auth/sign-in/username`,
        {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            'x-console-client-ip': `spoof-${n}`,
            'x-forwarded-for': `198.51.100.${n}`,
          },
          body: JSON.stringify({ ...admin, password: 'incorrect' }),
        },
        { clientIp: '192.0.2.254' },
      )
      expect(response.status).toBe(n < 5 ? 401 : 429)
    }
  })
  it('公开部署预览在配置齐全时仍不开放管理服务', async () => {
    const { default: handler } = await import('../../netlify/functions/api')
    const response = await handler(new Request(`${origin}/api/console/overview`), {
      deploy: { context: 'deploy-preview' },
      ip: '192.0.2.1',
    })
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('PREVIEW_ONLY')
  })
})
