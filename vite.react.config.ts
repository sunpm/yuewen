import { fileURLToPath, URL } from 'node:url'
import Tailwind from '@tailwindcss/vite'
import React from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web/react',
  publicDir: fileURLToPath(new URL('./web/public', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-react', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/react/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [React(), Tailwind()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: ['.'] },
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  // PC0 has no business API. Keep the unfinished entry outside Netlify's publish directory.
  build: { outDir: '../../dist-react', emptyOutDir: true, manifest: true },
})
