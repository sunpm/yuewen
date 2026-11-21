import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const children = []
async function start(config, port) {
  const child = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--config',
      config,
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
  )
  children.push(child)
  child.stdout.resume()
  child.stderr.resume()
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (r.ok) return `http://127.0.0.1:${port}`
    } catch {
      // The local server may still be starting.
    }
    if (child.exitCode !== null) throw new Error('Wrangler local exited before becoming ready')
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Wrangler local did not become ready')
}
try {
  const base = await start('wrangler.local.jsonc', 8791)
  const prod = await start('wrangler.jsonc', 8792)
  assert.equal((await fetch(prod + '/api/connections')).status, 403)
  assert.equal(
    (
      await fetch(prod + '/api/archives', {
        method: 'POST',
        headers: { Origin: prod, 'Cf-Access-Jwt-Assertion': 'forged' },
      })
    ).status,
    403,
  )
  assert.equal((await fetch(base + '/api/connections')).status, 200)
  assert.equal(
    (
      await fetch(base + '/api/archives', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  )
  assert.equal((await fetch(base + '/api/does-not-exist')).status, 404)
  assert.equal(
    await (await fetch(base + '/m/demo')).text(),
    await (await fetch(base + '/m/index.html')).text(),
  )
  assert.equal(
    await (await fetch(base + '/m/settings')).text(),
    await (await fetch(base + '/m/index.html')).text(),
  )
  assert.equal(
    await (await fetch(base + '/overview')).text(),
    await (await fetch(base + '/')).text(),
  )
  assert.equal(
    (await fetch(base + '/api/does-not-exist')).headers
      .get('content-type')
      .includes('application/json'),
    true,
  )
  console.log(
    'HTTP smoke passed: production API rejects anonymous/forged JWT, local API, CSRF, JSON 404, PC/H5 deep-link SPA routing.',
  )
} finally {
  for (const child of children) child.kill('SIGTERM')
}
