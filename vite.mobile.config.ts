import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web-mobile',
  publicDir: fileURLToPath(new URL('./web/public', import.meta.url)),
  experimental: {
    renderBuiltUrl: (filename, { type }) =>
      type === 'public' ? `/${filename}` : { relative: true },
  },
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-mobile', import.meta.url)),
  base: '/m/',
  optimizeDeps: {
    exclude: ['@napi-rs/canvas'],
    include: [
      'd3-cloud',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'better-auth/vue',
      'better-auth/client/plugins',
      'vant/es',
      'vant/es/toast/style',
      ...[
        'config-provider',
        'tabbar',
        'tabbar-item',
        'icon',
        'button',
        'switch',
        'popup',
        'action-sheet',
        'empty',
        'dropdown-menu',
        'dropdown-item',
        'search',
        'tabs',
        'tab',
        'cell',
        'loading',
        'form',
        'cell-group',
        'field',
        'notice-bar',
      ].map((name) => `vant/es/${name}/style/index`),
    ],
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@client': fileURLToPath(new URL('./client', import.meta.url)),
    },
  },
  plugins: [
    Vue(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: fileURLToPath(new URL('./web-mobile/src/auto-imports.d.ts', import.meta.url)),
    }),
    Components({
      resolvers: [VantResolver()],
      dirs: [fileURLToPath(new URL('./web-mobile/src/components', import.meta.url))],
      dts: fileURLToPath(new URL('./web-mobile/src/components.d.ts', import.meta.url)),
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
    hmr: { clientPort: 5173, path: '__mobile_hmr' },
    fs: { allow: ['..'] },
  },
  build: { outDir: '../dist/m', emptyOutDir: true, copyPublicDir: false },
})
