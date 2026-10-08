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
  optimizeDeps: { exclude: ['@napi-rs/canvas'] },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8788' },
    fs: { allow: ['.'] },
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  // Keep the migration entry outside Netlify's publish directory until PC4.
  build: { outDir: '../../dist-react', emptyOutDir: true, manifest: true },
})
