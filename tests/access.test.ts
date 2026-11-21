import { describe, expect, it } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { localRequest, protect, verifyAccess, type Bindings } from '../server/access'
import { app } from '../server/app'
const env = { LOCAL_DEV: 'true' } as Bindings
function local(url: string, options?: RequestInit) {
  const request = new Request(url, options)
  Object.defineProperty(request, localRequest, { value: true })
  return request
}
describe('单实例访问边界', () => {
  it('生产入口即使设置本地变量也不放行；缺失或伪造 JWT 不能读写', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const response = await app.request(
        'http://localhost/api/archives',
        { method, headers: { Origin: 'http://localhost', 'Cf-Access-Jwt-Assertion': 'fake' } },
        env,
      )
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })
  it('开发入口只放行回环，写操作必须同源', async () => {
    await expect(protect(local('http://127.0.0.1/api/connections'), env)).resolves.toBeUndefined()
    await expect(protect(local('https://example.com/api/connections'), env)).rejects.toMatchObject({
      code: 'ACCESS_REQUIRED',
    })
    for (const origin of [undefined, 'https://other.example'])
      await expect(
        protect(
          local('http://127.0.0.1/api/archives', {
            method: 'POST',
            headers: origin ? { Origin: origin } : {},
          }),
          env,
        ),
      ).rejects.toMatchObject({ code: 'ORIGIN_REQUIRED' })
    await expect(
      protect(
        local('http://127.0.0.1/api/archives', {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1' },
        }),
        env,
      ),
    ).resolves.toBeUndefined()
  })
  it('验证真实签名、issuer、audience、期限与算法，不以伪造身份头放行', async () => {
    const pair = await generateKeyPair('RS256'),
      jwk = await exportJWK(pair.publicKey)
    const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] })
    const issuer = 'https://test.cloudflareaccess.com',
      audience = 'test-audience'
    const make = (
      iss = issuer,
      aud = audience,
      exp = Math.floor(Date.now() / 1000) + 300,
      nbf = 0,
    ) =>
      new SignJWT({ nbf })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(iss)
        .setAudience(aud)
        .setSubject('synthetic')
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(pair.privateKey)
    await expect(verifyAccess(await make(), issuer, audience, keys)).resolves.toBeUndefined()
    for (const token of [
      await make('https://wrong.example'),
      await make(issuer, 'wrong'),
      await make(issuer, audience, 1),
      await make(issuer, audience, Date.now() / 1000 + 300, Date.now() / 1000 + 100),
    ])
      await expect(verifyAccess(token, issuer, audience, keys)).rejects.toThrow()
    const token = await make()
    const pieces = token.split('.')
    pieces[1] = Buffer.from(
      JSON.stringify({ iss: issuer, aud: audience, exp: Date.now() / 1000 + 300 }),
    ).toString('base64url')
    await expect(verifyAccess(pieces.join('.'), issuer, audience, keys)).rejects.toThrow()
  })
  it('旧账号、后台路由不再存在，连接状态不返回 Key 或用户资料', async () => {
    for (const path of [
      '/api/auth/get-session',
      '/api/account',
      '/api/console',
      '/api/guest/save',
    ]) {
      const response = await app.fetch(local(`http://127.0.0.1${path}`), env)
      expect(response.status).toBe(404)
    }
    const response = await app.fetch(local('http://127.0.0.1/api/connections'), {
      ...env,
      WEREAD_API_KEY: 'synthetic-do-not-return',
    })
    const body = await response.text()
    expect(body).not.toContain('synthetic-do-not-return')
    expect(JSON.parse(body)).toMatchObject({ instance: { status: 'valid' } })
    expect(body).not.toMatch(/userId|email|avatar|guest|account/)
  })
})
