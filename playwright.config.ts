import { defineConfig, devices } from '@playwright/test'
import { testBaseUrl, testEnv } from './tests/e2e/test-env'

const port = Number(testEnv('PORT') || 3000)
const previewUrl = testEnv('PLAYWRIGHT_PREVIEW_URL')
const baseURL = previewUrl || testBaseUrl()

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  // Set PLAYWRIGHT_PREVIEW_URL to point at a deployed Cloudflare preview Worker
  // instead of booting a local `yarn dev` server — skips webServer entirely so
  // CI tests real edge behavior (real bindings, real runtime) rather than
  // Nuxt dev + getPlatformProxy's local binding emulation.
  webServer: previewUrl ? undefined : {
    command: `PORT=${port} yarn dev`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: process.env.CI ? 'pipe' : 'ignore',
    stderr: process.env.CI ? 'pipe' : 'ignore'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
