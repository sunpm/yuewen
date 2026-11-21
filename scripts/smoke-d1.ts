import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getPlatformProxy } from 'wrangler'
import { app } from '../server/app'
import { localRequest, type Bindings } from '../server/access'
import { read, save } from '../server/storage'
import type { ReportTask } from '../shared/connection'
import worker from '../server/worker'

// Ephemeral D1, no remote bindings, no real Key, no real upstream calls.
const platform = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'tests/wrangler.smoke.jsonc',
  persist: false,
  remoteBindings: false,
  envFiles: [],
})
const env = { DB: platform.env.DB, LOCAL_DEV: 'true', WEREAD_API_KEY: 'synthetic-only' } as Bindings
const fetchOriginal = globalThis.fetch
let calls = 0
let failNext = false
let hold: Promise<void> | undefined
let reached: (() => void) | undefined
// Only the fixed upstream gateway is stubbed; local D1 transport is untouched.
globalThis.fetch = async (input, init) => {
  if (input === 'https://i.weread.qq.com/api/agent/gateway') {
    calls++
    reached?.()
    if (hold) await hold
    if (failNext) {
      failNext = false
      return Response.json({}, { status: 429, headers: { 'Retry-After': '60' } })
    }
    return Response.json({ books: [], hasMore: 0 })
  }
  return fetchOriginal(input, init)
}
async function api(path: string, method = 'GET', body?: unknown) {
  const request = new Request(`http://127.0.0.1/api${path}`, {
    method,
    headers: { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  Object.defineProperty(request, localRequest, { value: true })
  return app.fetch(request, env)
}
async function json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await api(path, method, body)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json() as Promise<T>
}
try {
  const migration =
    (await readFile('migrations/0001_instance.sql', 'utf8')) +
    (await readFile('migrations/0002_collection_lease.sql', 'utf8'))
  await env.DB.batch(
    migration
      .split(';')
      .filter((x) => x.trim())
      .map((sql) => env.DB.prepare(sql)),
  )
  assert.deepEqual(await json('/session/reports'), [])
  const requestId = crypto.randomUUID()
  let task = await json<ReportTask>('/reports', 'POST', {
    range: 'monthly',
    requestId,
    expected: { id: null },
  })
  assert.equal(
    (
      await json<ReportTask>('/reports', 'POST', {
        range: 'monthly',
        requestId,
        expected: { id: null },
      })
    ).id,
    task.id,
  )
  assert.equal(
    (
      await api('/reports', 'POST', {
        range: 'monthly',
        requestId: crypto.randomUUID(),
        expected: { id: task.id },
      })
    ).status,
    409,
  )
  env.WEREAD_API_KEY = 'different-synthetic-key'
  assert.equal(
    (await api(`/reports/${task.id}/advance`, 'POST', { version: task.version })).status,
    409,
  )
  assert.equal(calls, 0)
  env.WEREAD_API_KEY = 'synthetic-only'
  assert.ok(!JSON.stringify(await read(env.DB, 'current')).includes('synthetic-only'))
  failNext = true
  task = await json<ReportTask>(`/reports/${task.id}/advance`, 'POST', { version: task.version })
  assert.equal(task.status, 'partial')
  assert.equal(task.issueCode, 'UPSTREAM_RATE_LIMIT')
  const stored = await read<{ state: { requests: number; retryAt: number } }>(env.DB, 'current')
  assert.equal(stored?.value.state.requests, 1)
  assert.ok(stored!.value.state.retryAt > Date.now())
  task = await json<ReportTask>(`/reports/${task.id}/cancel`, 'POST')
  const saved = await json<{ id: string }>(`/archives`, 'POST', {
    reportId: task.id,
    version: task.version,
    includeNotes: false,
  })
  assert.equal(
    (
      await json<{ id: string }>('/archives', 'POST', {
        reportId: task.id,
        version: task.version,
        includeNotes: false,
      })
    ).id,
    saved.id,
  )
  assert.equal(
    (await json<{ report: { notes: unknown[] } }>(`/archives/${saved.id}`)).report.notes.length,
    0,
  )
  assert.equal((await api('/session/reports', 'DELETE')).status, 204)
  assert.equal((await json<{ items: unknown[] }>('/archives')).items.length, 1)
  task = await json<ReportTask>('/reports', 'POST', {
    range: 'monthly',
    requestId: crypto.randomUUID(),
    expected: { id: null },
  })
  while (['queued', 'running'].includes(task.status))
    task = await json<ReportTask>(`/reports/${task.id}/advance`, 'POST', { version: task.version })
  assert.equal(task.status, 'completed')
  assert.equal(task.report.modules.length, 27)
  assert.equal((await api(`/reports/${task.id}/notes?cursor=-1`)).status, 400)
  assert.equal((await api(`/reports/${task.id}/advance`, 'POST', { version: 0 })).status, 409)
  // Clear during in-flight upstream read must never resurrect a report.
  await api('/session/reports', 'DELETE')
  task = await json<ReportTask>('/reports', 'POST', {
    range: 'monthly',
    requestId: crypto.randomUUID(),
    expected: { id: null },
  })
  let release!: () => void
  hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    reached = resolve
  })
  const late = api(`/reports/${task.id}/advance`, 'POST', { version: task.version })
  await started
  assert.equal(
    (await api(`/reports/${task.id}/advance`, 'POST', { version: task.version })).status,
    409,
  )
  await api('/session/reports', 'DELETE')
  const replacement = await json<ReportTask>('/reports', 'POST', {
    range: 'monthly',
    requestId: crypto.randomUUID(),
    expected: { id: null },
  })
  release()
  assert.equal((await late).status, 409)
  assert.equal((await json<ReportTask[]>('/session/reports'))[0].id, replacement.id)
  await api('/session/reports', 'DELETE')
  hold = undefined
  reached = undefined
  // Chunk storage preserves Unicode and CAS refuses concurrent stale writers.
  const text = '合成🟢'.repeat(100000)
  await save(env.DB, 'current', 0, { text }, { expiresAt: '2000-01-01T00:00:00Z' })
  assert.ok(
    (await read<{ text: string }>(env.DB, 'current'))?.value.text === text,
    'Unicode chunks must round-trip exactly',
  )
  const beforeRace = await read(env.DB, 'current')
  const race = await Promise.allSettled([
    save(env.DB, 'current', 1, { winner: 1 }, {}, beforeRace!.token),
    save(env.DB, 'current', 1, { winner: 2 }, {}, beforeRace!.token),
  ])
  assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1)
  await save(
    env.DB,
    'current',
    2,
    { text: 'expired' },
    { expiresAt: '2000-01-01T00:00:00Z' },
    (await read(env.DB, 'current'))!.token,
  )
  await worker.scheduled({} as ScheduledController, env)
  assert.equal(await read(env.DB, 'current'), null)
  assert.equal((await api(`/archives/${saved.id}`, 'DELETE')).status, 204)
  const chunks = await env.DB.prepare('SELECT count(*) AS total FROM chunk').first<{
    total: number
  }>()
  assert.equal(chunks?.total, 0)
  console.log(
    `D1 smoke passed: migration, collection (${calls} synthetic upstream calls), backoff, cancellation, archives, chunking, CAS, late-write rejection, expiry and cascade cleanup.`,
  )
} finally {
  globalThis.fetch = fetchOriginal
  await platform.dispose()
}
