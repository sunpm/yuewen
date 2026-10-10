import { fileURLToPath, URL } from 'node:url'
import Tailwind from '@tailwindcss/vite'
import React from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
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
})
