import { app } from '../../server/app'
export default (request: Request) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, '')
  return app.fetch(new Request(url, request))
}
