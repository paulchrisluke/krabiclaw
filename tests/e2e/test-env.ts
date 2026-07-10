import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFiles = ['.env', '.env.example']
let fileEnv: Record<string, string> | null = null

function parseEnvFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        // Only remove surrounding quotes if they form a matching pair
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        return [key, value]
      })
  )
}

function readFileEnv() {
  if (fileEnv) return fileEnv

  fileEnv = {}
  for (const file of envFiles) {
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) {
      fileEnv = { ...parseEnvFile(path), ...fileEnv }
    }
  }
  return fileEnv
}

export const testEnv = (key: string): string => process.env[key] ?? readFileEnv()[key] ?? ''

export function testBaseUrl() {
  const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  if (previewUrl) return previewUrl

  let port = Number.parseInt(process.env.PORT ?? '', 10)
  if (Number.isNaN(port) || port <= 0) {
    port = Number.parseInt(readFileEnv().PORT ?? '', 10)
  }
  if (Number.isNaN(port) || port <= 0) port = 3000

  // Local E2E should target the webServer port explicitly instead of a stale
  // app domain from .env, otherwise tests can hit an unrelated process.
  if (process.env.PORT) {
    return `http://localhost:${port}`
  }

  return testEnv('NUXT_PUBLIC_FREE_SITE_DOMAIN') || `http://localhost:${port}`
}

// x-preview-tenant carries tenant identity when subdomain routing isn't available:
// workers.dev single-level wildcard, staging.*, preview.* (wildcard TLS only
// covers one subdomain level so demo.preview.krabiclaw.com won't handshake).
// Must stay in sync with isPreviewContext in server/utils/tenant-hosts.ts.
function isPreviewContext(hostname: string) {
  if (hostname === 'workers.dev' || hostname.endsWith('.workers.dev')) return true
  if (/^(?:staging|preview)\.[^.]+\.[^.]+$/.test(hostname)) return true
  return false
}

function previewWorkerHeaders(slug: string): Record<string, string> {
  return { 'x-preview-tenant': slug, 'cache-control': 'no-store' }
}

// True when the test target is a real deployed Cloudflare Worker (preview.*,
// staging.*, *.workers.dev) rather than a local dev server or local tunnel.
// Server-side self-fetches to a same-zone URL (e.g. the CIMD test-client-metadata
// fixture, fetched by our own auth server) fail on deployed Workers — reproduced
// deterministically via direct curl to preview.krabiclaw.com/api/auth/oauth2/authorize,
// not a timeout, not present when the same flow runs against a real public tunnel
// in local dev. Root cause is Cloudflare zone/Workers-runtime behavior for a
// Worker's own subrequest into its own route, not app logic — see
// docs/local-mcp-harness.md.
export function isDeployedWorkerTarget(baseURL: string): boolean {
  return isPreviewContext(new URL(baseURL).hostname)
}

export function tenantTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'demo.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isPreviewContext(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('demo.') ? base.hostname : `demo.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function potteryHouseTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'pottery-house.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isPreviewContext(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('pottery-house.') ? base.hostname : `pottery-house.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function tenantTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isPreviewContext(base.hostname) ? previewWorkerHeaders('demo') : {}
}

export function potteryHouseTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isPreviewContext(base.hostname) ? previewWorkerHeaders('pottery-house') : {}
}

export function devLoginUrl(baseURL: string, userId?: string) {
  const url = new URL('/api/dev/login', baseURL)
  if (userId) url.searchParams.set('userId', userId)
  return url.toString()
}

export function devLoginHeaders(): Record<string, string> | undefined {
  const secret = testEnv('E2E_DEV_ROUTE_SECRET')
  return secret ? { 'x-dev-route-secret': secret } : undefined
}
