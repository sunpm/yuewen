import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Tailwind from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import VueRouter from 'vue-router/vite'
import { defineConfig } from 'vite'

// Adapted from Vitesse 8a01bc9283fedcd63e750af55a75496361789a81.
export default defineConfig({
  root: 'web',
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-web', import.meta.url)),
  optimizeDeps: {
    include: [
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'better-auth/vue',
      'better-auth/client/plugins',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [
    VueRouter({
      routesFolder: 'web/src/pages',
      dts: fileURLToPath(new URL('./web/src/route-map.d.ts', import.meta.url)),
    }),
    Vue(),
    Tailwind(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: fileURLToPath(new URL('./web/src/auto-imports.d.ts', import.meta.url)),
      vueTemplate: true,
    }),
    Components({
      dirs: [fileURLToPath(new URL('./web/src/components', import.meta.url))],
      dts: fileURLToPath(new URL('./web/src/components.d.ts', import.meta.url)),
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/m': { target: 'http://127.0.0.1:5180', ws: true },
      '/api': 'http://127.0.0.1:8787',
    },
    fs: { allow: ['..'] },
  },
  build: { outDir: '../dist', emptyOutDir: true },
})
