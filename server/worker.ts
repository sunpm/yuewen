import { app } from './app'
import type { Bindings } from './access'
export default {
  async scheduled(_event: ScheduledController, env: Bindings) {
    await env.DB.prepare(
      "DELETE FROM entity WHERE id='current' AND json_extract(summary,'$.expiresAt') <= ?",
    )
      .bind(new Date().toISOString())
      .run()
  },
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/'))
      return app.fetch(request, env, ctx)
    if (url.pathname === '/m' || url.pathname.startsWith('/m/')) {
      if (!url.pathname.split('/').pop()?.includes('.')) url.pathname = '/m/index.html'
      return env.ASSETS.fetch(new Request(url, request))
    }
    return env.ASSETS.fetch(request)
  },
}
