import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
const port = 3000
const baseURL = previewUrl || 'http://localhost:3000'
const localPrepared = process.env.PLAYWRIGHT_LOCAL_PREPARED === 'true'
const captureServerLogs = process.env.PLAYWRIGHT_SERVER_LOGS === 'true' || !!process.env.CI
const localDevRouteSecret = previewUrl ? '' : 'local-playwright-dev-route-secret'

if (!previewUrl && !process.env.E2E_TEST_PASSWORD) {
  process.env.E2E_TEST_PASSWORD = randomBytes(32).toString('hex')
}
if (!previewUrl) {
  process.env.E2E_DEV_ROUTE_SECRET = localDevRouteSecret
}

const localWorkerCommand = `corepack yarn wrangler dev .output/server/index.mjs --assets .output/public --local --port ${port} --var E2E_ALLOW_DEV_ROUTES:true --var E2E_DEV_ROUTE_SECRET:${localDevRouteSecret}`

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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  // Remote suites target an already-deployed Worker. Local suites prepare the
  // local D1 fixtures, build the production Worker, and run it in workerd.
  webServer: previewUrl ? undefined : {
    command: localPrepared
      ? localWorkerCommand
      : `corepack yarn e2e:local:prepare && ${localWorkerCommand}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: localPrepared ? 180_000 : 600_000,
    stdout: captureServerLogs ? 'pipe' : 'ignore',
    stderr: captureServerLogs ? 'pipe' : 'ignore'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
