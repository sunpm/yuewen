import { Hono } from 'hono'
import type { AppEnv } from '../connections'
import { getDb } from '../db'
import { AppError } from '../weread'
import { consoleConfigured, createConsoleAuth, getConsoleAuth, lockConsoleAdmin } from './auth'
import { feedbackConsole } from '../feedback/console'
import { consoleData, consoleUsers } from './read'
import { consoleWrites } from './write'

export const consoleRoutes = new Hono<AppEnv>()
consoleRoutes.on(['GET', 'POST'], '/auth/*', async (c) => {
  const path = c.req.path.slice('/api/console/auth'.length)
  const permitted =
    (c.req.method === 'GET' && path === '/get-session') ||
    (c.req.method === 'POST' && ['/sign-in/username', '/sign-out'].includes(path))
  if (!permitted) throw new AppError('NOT_FOUND', '该管理认证接口不可用。', 404)
  if (!consoleConfigured())
    throw new AppError('CONSOLE_UNAVAILABLE', '后台尚未启用，请联系维护者。', 503)
  const headers = new Headers(c.req.raw.headers)
  // Trust only the hosting adapter's IP; never a caller-supplied forwarding header.
  headers.set('x-console-client-ip', c.env?.clientIp ?? '127.0.0.1')
  const request = new Request(c.req.raw, { headers })
  if (path === '/sign-in/username') {
    const response = await getDb().transaction(async (tx) => {
      await lockConsoleAdmin(tx)
      return createConsoleAuth(tx).handler(request)
    })
    if ([400, 401, 403, 422].includes(response.status))
      throw new AppError('INVALID_CREDENTIALS', '账号或密码不正确。', 401)
    return response
  }
  return getConsoleAuth().handler(request)
})

consoleRoutes.use('*', async (c, next) => {
  if (!consoleConfigured())
    throw new AppError('CONSOLE_UNAVAILABLE', '后台尚未启用，请联系维护者。', 503)
  const session = await getConsoleAuth().api.getSession({ headers: c.req.raw.headers })
  if (!session) throw new AppError('CONSOLE_AUTH_REQUIRED', '请先登录管理后台。', 401)
  c.set('consoleAccess', { userId: session.user.id, sessionId: session.session.id })
  await next()
})
consoleRoutes.get('/overview', (c) => c.json({ status: 'ready' }))
consoleRoutes.route('/', consoleWrites)
consoleRoutes.route('/feedback', feedbackConsole)
consoleRoutes.route('/users', consoleUsers)
consoleRoutes.route('/data', consoleData)
// Unknown management paths must never fall through to reading-connection authentication.
consoleRoutes.all('*', () => {
  throw new AppError('NOT_FOUND', '管理接口不存在。', 404)
})
