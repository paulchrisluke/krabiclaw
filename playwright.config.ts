import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
const port = 3000
const baseURL = previewUrl || 'http://localhost:3000'
const localPrepared = process.env.PLAYWRIGHT_LOCAL_PREPARED === 'true'
const stagingReviewEnabled = process.env.PLAYWRIGHT_STAGING_REVIEW === 'true'
const captureServerLogs = process.env.PLAYWRIGHT_SERVER_LOGS === 'true' || !!process.env.CI
const localDevRouteSecret = previewUrl ? '' : 'local-playwright-dev-route-secret'

if (!previewUrl && !process.env.E2E_TEST_PASSWORD) {
  process.env.E2E_TEST_PASSWORD = randomBytes(32).toString('hex')
}
if (!previewUrl) {
  process.env.E2E_DEV_ROUTE_SECRET = localDevRouteSecret
}

const localWorkerEnvironment = [
  'EMAIL_DELIVERY_MODE=log_only',
  'WHATSAPP_DELIVERY_MODE=log_only',
  'DISCORD_DELIVERY_MODE=log_only',
  `BETTER_AUTH_URL=http://localhost:${port}`,
  `NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:${port}`,
  `NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:${port}`,
  'NUXT_PUBLIC_APP_NAME=KrabiClaw',
  `NUXT_PUBLIC_SITE_URL=http://localhost:${port}`,
  `NUXT_PUBLIC_HELP_URL=http://localhost:${port}/help`,
].join(' ')

const localWorkerCommand = [
  localWorkerEnvironment,
  'corepack yarn wrangler dev .output/server/index.mjs',
  '--assets .output/public',
  '--local',
  `--port ${port}`,
  '--var E2E_ALLOW_DEV_ROUTES:true',
  `--var E2E_DEV_ROUTE_SECRET:${localDevRouteSecret}`,
  '--var EMAIL_DELIVERY_MODE:log_only',
  '--var WHATSAPP_DELIVERY_MODE:log_only',
  '--var DISCORD_DELIVERY_MODE:log_only',
  `--var BETTER_AUTH_URL:http://localhost:${port}`,
  `--var NUXT_PUBLIC_PLATFORM_DOMAIN:http://localhost:${port}`,
  `--var NUXT_PUBLIC_FREE_SITE_DOMAIN:http://localhost:${port}`,
  '--var NUXT_PUBLIC_APP_NAME:KrabiClaw',
  `--var NUXT_PUBLIC_SITE_URL:http://localhost:${port}`,
  `--var NUXT_PUBLIC_HELP_URL:http://localhost:${port}/help`,
].join(' ')

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
      : `${localWorkerEnvironment} corepack yarn e2e:local:prepare && ${localWorkerCommand}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: localPrepared ? 180_000 : 600_000,
    stdout: captureServerLogs ? 'pipe' : 'ignore',
    stderr: captureServerLogs ? 'pipe' : 'ignore'
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/staging-review-auth.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'staging-review',
      testMatch: stagingReviewEnabled ? '**/staging-review-auth.spec.ts' : '**/staging-review-auth.disabled.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
