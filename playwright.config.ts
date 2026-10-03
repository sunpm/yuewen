import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      testMatch: '**/reading.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'firefox',
      testMatch: '**/reading.spec.ts',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'webkit',
      testMatch: '**/reading.spec.ts',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-chromium',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    { name: 'mobile-webkit', testMatch: '**/mobile.spec.ts', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
