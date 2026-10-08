import { app } from '../../server/app'
export default (request: Request, context?: { deploy: { context: string }; ip: string }) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, '')
  // A preview never uses account or database credentials inherited from the site.
  if (!['production', 'dev'].includes(context?.deploy.context ?? '')) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    if (url.pathname === '/api/health')
      return Response.json({ status: 'ok', auth: false, guest: false, preview: true }, { headers })
    if (url.pathname === '/api/connections')
      return Response.json(
        { guest: null, account: null, serverTime: new Date().toISOString() },
        { headers },
      )
    if (url.pathname !== '/api/demo' || request.method !== 'GET')
      return Response.json(
        {
          code: 'PREVIEW_ONLY',
          message: '公开预览仅提供模拟示例，请在正式网站连接个人数据。',
          retryable: false,
        },
        { status: 503, headers },
      )
  }
  return app.fetch(new Request(url, request), { clientIp: context?.ip })
}
