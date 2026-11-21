import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { AppError } from './weread'
export interface Bindings {
  DB: D1Database
  ASSETS: Fetcher
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  LOCAL_DEV?: string
  WEREAD_API_KEY?: string
}
export const localRequest = Symbol('local-only entrypoint')
const sets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
export async function verifyAccess(
  token: string,
  issuer: string,
  audience: string,
  keys: JWTVerifyGetKey,
) {
  await jwtVerify(token, keys, {
    issuer,
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub'],
  })
}
export async function protect(request: Request, env: Bindings) {
  const url = new URL(request.url)
  // Only server/local.ts can attach this symbol. The production entrypoint never does.
  const local =
    env.LOCAL_DEV === 'true' &&
    (request as Request & { [localRequest]?: boolean })[localRequest] === true &&
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (!local) {
    const issuer = env.ACCESS_TEAM_DOMAIN ?? ''
    const token = request.headers.get('Cf-Access-Jwt-Assertion')
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !env.ACCESS_AUD || !token)
      throw new AppError(
        'ACCESS_REQUIRED',
        '私有 API 尚未通过部署访问保护，请检查 Cloudflare Access 配置。',
        403,
      )
    try {
      let keys = sets.get(issuer)
      if (!keys) {
        keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
        sets.set(issuer, keys)
      }
      await verifyAccess(token, issuer, env.ACCESS_AUD, keys)
    } catch {
      throw new AppError(
        'ACCESS_REQUIRED',
        '部署访问凭证无效或已过期，请刷新并通过 Cloudflare Access。',
        403,
      )
    }
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin')
    if (
      (origin !== url.origin && !(local && origin === 'http://127.0.0.1:5173')) ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site'
    )
      throw new AppError('ORIGIN_REQUIRED', '只接受同源操作。', 403)
  }
}
