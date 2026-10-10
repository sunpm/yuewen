import { spawn } from 'node:child_process'
const children = ['dev:api', 'dev:web', 'dev:mobile', 'dev:console'].map((script) =>
  spawn('pnpm', [script], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  }),
)
const stop = () => children.forEach((child) => child.kill('SIGTERM'))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
children.forEach((child) =>
  child.on('exit', (code) => {
    stop()
    process.exitCode = code ?? 0
  }),
)
