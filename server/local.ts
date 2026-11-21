// Development-only entrypoint; never referenced by production wrangler.jsonc.
import worker from './worker'
import { localRequest, type Bindings } from './access'
export default {
  scheduled: worker.scheduled,
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    Object.defineProperty(request, localRequest, { value: true })
    return worker.fetch(request, env, ctx)
  },
}
