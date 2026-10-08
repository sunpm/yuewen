import { fileURLToPath, URL } from 'node:url'
import Tailwind from '@tailwindcss/vite'
import React from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'console',
  base: '/console/',
  publicDir: fileURLToPath(new URL('./web/public', import.meta.url)),
  experimental: {
    renderBuiltUrl: (filename, { type }) =>
      type === 'public' ? `/${filename}` : { relative: true },
  },
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-console', import.meta.url)),
  resolve: { alias: { '@client': fileURLToPath(new URL('./client', import.meta.url)) } },
  plugins: [React(), Tailwind()],
  server: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: true,
    hmr: { clientPort: 5173, path: '__console_hmr' },
    fs: { allow: ['.'] },
  },
  build: { outDir: '../dist/console', emptyOutDir: true, copyPublicDir: false, manifest: true },
})
