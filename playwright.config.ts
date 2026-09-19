import { randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { defineConfig, devices } from '@playwright/test'

// A local run gets its secrets the way every other local command does. CI sets
// them in the real environment and ships no .env, where this is a no-op — but
// only a missing file is expected. An unreadable or malformed one is a broken
// setup and has to say so rather than silently running without its secrets.
try {
  process.loadEnvFile()
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
}

const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = previewUrl || `http://localhost:${port}`
const localPrepared = process.env.PLAYWRIGHT_LOCAL_PREPARED === 'true'
const captureServerLogs = process.env.PLAYWRIGHT_SERVER_LOGS === 'true' || !!process.env.CI
const localDevRouteSecret = previewUrl ? '' : 'local-playwright-dev-route-secret'
const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
/**
 * Secrets the local Worker needs from the environment.
 *
 * `wrangler dev` reads none of the process environment, so anything the Worker
 * requires has to be handed over as a --var. Better Auth refuses to construct
 * without STRIPE_SECRET_KEY, which is why a suite that signs anyone in cannot
 * run against a Worker started without it.
 */
const forwardedWorkerVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BETTER_AUTH_SECRET',
  'CONNECTOR_TOKEN_ENCRYPTION_KEY',
  'PREVIEW_SECRET',
  'CF_ACCOUNT_ID',
  'CLOUDFLARE_IMAGES_API_TOKEN',
  'CLOUDFLARE_IMAGES_VARIANT_BASE',
]
const optionalWorkerVars = forwardedWorkerVars
  .flatMap(name => process.env[name] ? ['--var', `${name}:${shellQuote(process.env[name]!)}`] : [])

if (!previewUrl && !process.env.E2E_TEST_PASSWORD) {
  // Same shape as CI's generated password: the app's password policy requires an
  // uppercase letter and a special character, which a bare hex string never has.
  process.env.E2E_TEST_PASSWORD = `${Buffer.from(randomBytes(32)).toString('hex')}Aa1!`
}
if (!previewUrl) {
  process.env.E2E_DEV_ROUTE_SECRET = localDevRouteSecret
  process.env.MCP_CIMD_CLIENT_URL = `http://localhost:${port}/api/auth/oauth2/test-client-metadata`
  process.env.MCP_PRIVATE_CIMD_CLIENT_URL = `http://localhost:${port}/api/auth/oauth2/test-private-client-metadata`
}

const localWorkerEnvironment = [
  'EMAIL_DELIVERY_MODE=log_only',
  'WHATSAPP_DELIVERY_MODE=log_only',
  'EMAIL_REPLY_SECRET=local-playwright-email-reply-secret',
  `BETTER_AUTH_URL=http://localhost:${port}`,
  `NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:${port}`,
  `NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:${port}`,
  'NUXT_PUBLIC_APP_NAME=KrabiClaw',
  `NUXT_PUBLIC_SITE_URL=http://localhost:${port}`,
  `NUXT_PUBLIC_HELP_URL=http://localhost:${port}/help`,
  `MCP_CIMD_CLIENT_URL=http://localhost:${port}/api/auth/oauth2/test-client-metadata`,
  `MCP_PRIVATE_CIMD_CLIENT_URL=http://localhost:${port}/api/auth/oauth2/test-private-client-metadata`,
].join(' ')

const localWorkerCommand = [
  localWorkerEnvironment,
  'corepack yarn wrangler dev .output/server/index.mjs',
  '--assets .output/public',
  '--local',
  `--port ${port}`,
  `--host localhost:${port}`,
  '--var E2E_ALLOW_DEV_ROUTES:true',
  `--var E2E_DEV_ROUTE_SECRET:${localDevRouteSecret}`,
  '--var EMAIL_DELIVERY_MODE:log_only',
  '--var WHATSAPP_DELIVERY_MODE:log_only',
  '--var EMAIL_REPLY_SECRET:local-playwright-email-reply-secret',
  `--var BETTER_AUTH_URL:http://localhost:${port}`,
  `--var NUXT_PUBLIC_PLATFORM_DOMAIN:http://localhost:${port}`,
  `--var NUXT_PUBLIC_FREE_SITE_DOMAIN:http://localhost:${port}`,
  '--var NUXT_PUBLIC_APP_NAME:KrabiClaw',
  `--var NUXT_PUBLIC_SITE_URL:http://localhost:${port}`,
  `--var NUXT_PUBLIC_HELP_URL:http://localhost:${port}/help`,
  ...optionalWorkerVars,
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
  reporter: process.env.CI
    ? [['list'], ['./tests/e2e/progress-reporter.ts'], ['html', { open: 'never' }]]
    : [['list'], ['./tests/e2e/progress-reporter.ts']],
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
    // Not `/`. On the platform host that is a tenant page, and a `db:pull:local`
    // snapshot carries no page documents for the platform site, so `/` answers
    // 404 and the suite never starts — which is how a test broken by #1001 sat
    // failing while only the @smoke subset ran in CI. /api/health needs no
    // content and no session, and pings D1, so readiness means the Worker and
    // its binding are both up.
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: localPrepared ? 180_000 : 600_000,
    stdout: captureServerLogs ? 'pipe' : 'ignore',
    stderr: captureServerLogs ? 'pipe' : 'ignore'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
