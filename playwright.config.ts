import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT || 3000)
const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
const baseURL = previewUrl || `http://localhost:${port}`
const localPrepared = process.env.PLAYWRIGHT_LOCAL_PREPARED === 'true'

if (!previewUrl && !process.env.E2E_TEST_PASSWORD) {
  process.env.E2E_TEST_PASSWORD = randomBytes(32).toString('hex')
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Remote D1 write suites can opt back down with PLAYWRIGHT_WORKERS=1. Two
  // workers keeps the read-heavy smoke/path-gated suites quick without placing
  // unbounded pressure on the shared preview and staging databases.
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  // Remote suites target an already-deployed Worker. Local suites prepare the
  // local D1 fixtures, build the production Worker, and run it in workerd.
  webServer: previewUrl ? undefined : {
    command: localPrepared
      ? `corepack yarn dev:worker --port ${port}`
      : `corepack yarn e2e:local:server --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: localPrepared ? 180_000 : 600_000,
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
