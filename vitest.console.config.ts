import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/console/*.integration.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: ['verbose'],
  },
})
