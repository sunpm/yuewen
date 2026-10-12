import { isIP } from 'node:net'
import { fileURLToPath, URL } from 'node:url'
import Tailwind from '@tailwindcss/vite'
import React from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  let analytics: { origin: string; token: string } | null = null
  if (
    command === 'build' &&
    process.env.CONTEXT === 'production' &&
    env.PC_ANALYTICS_ENABLED === 'true'
  ) {
    const origin = new URL(env.APP_URL ?? '')
    const token = env.CF_WEB_ANALYTICS_TOKEN ?? ''
    if (
      origin.protocol !== 'https:' ||
      origin.href !== `${origin.origin}/` ||
      origin.hostname === 'localhost' ||
      origin.hostname.endsWith('.localhost') ||
      origin.hostname.endsWith('.local') ||
      isIP(origin.hostname.replace(/^\[|\]$/g, '')) ||
      !/^[a-f0-9]{32}$/i.test(token)
    )
      throw new Error('PC analytics requires an HTTPS APP_URL origin and a valid site token.')
    analytics = { origin: origin.origin, token }
  }
  return {
    define: { __PC_ANALYTICS__: JSON.stringify(analytics) },
    root: 'web',
    publicDir: fileURLToPath(new URL('./web/public', import.meta.url)),
    cacheDir: fileURLToPath(new URL('./node_modules/.vite-web', import.meta.url)),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./web/src', import.meta.url)),
        '@client': fileURLToPath(new URL('./client', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    plugins: [React(), Tailwind()],
    optimizeDeps: { exclude: ['@napi-rs/canvas'] },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/console': {
          target: 'http://127.0.0.1:5181',
          ws: true,
          rewrite: (path) => path.replace(/^\/console(?=\?|$)/, '/console/'),
        },
        '/m': { target: 'http://127.0.0.1:5180', ws: true },
        '/api': 'http://127.0.0.1:8787',
      },
      fs: { allow: ['.'] },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    build: { outDir: '../dist', emptyOutDir: true, manifest: true },
  }
})
