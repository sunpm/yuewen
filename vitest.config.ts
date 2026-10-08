import { defineConfig } from 'vitest/config'
import Vue from '@vitejs/plugin-vue'
import React from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [Vue(), React()],
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
})
