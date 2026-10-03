import { advanceCollector, buildReport, newCollector } from '../server/collector'
import { AppError } from '../server/weread'
const key = process.env.WEREAD_API_KEY
if (!key) throw new Error('请在本地 .env 配置联调 Key。')
const state = newCollector('monthly'),
  start = Date.now()
while (state.queue.length && state.requests < 100) {
  try {
    await advanceCollector(state, key)
  } catch (e) {
    console.log(JSON.stringify({ stopped: e instanceof AppError ? e.code : 'COLLECTION_ERROR' }))
    break
  }
  if (state.requests % 10 === 0)
    console.log(JSON.stringify({ requests: state.requests, remaining: state.queue.length }))
}
const report = buildReport(state)
console.log(
  JSON.stringify({
    requests: state.requests,
    elapsedMs: Date.now() - start,
    complete: report.coverage.complete,
    failed: state.failed.length,
    remaining: state.queue.length,
    stateBytes: Buffer.byteLength(JSON.stringify(state)),
    summaryAvailable: report.summary.seconds !== null,
    modules: report.modules.map((m) => ({ id: m.id, status: m.status, rows: m.data.length })),
  }),
)
if (!report.coverage.complete) process.exitCode = 1
// Real content is kept in process memory only; this probe never saves report bodies.
