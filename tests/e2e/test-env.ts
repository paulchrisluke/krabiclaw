export const testEnv = (key: string): string => process.env[key] ?? ''

export function testBaseUrl() {
  const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  if (previewUrl) return previewUrl

  let port = Number.parseInt(process.env.PORT ?? '', 10)
  if (Number.isNaN(port) || port <= 0) port = 3000

  // Local E2E should target the webServer port explicitly instead of a stale
  // app domain from .env, otherwise tests can hit an unrelated process.
  if (process.env.PORT) {
    return `http://localhost:${port}`
  }

  return testEnv('NUXT_PUBLIC_FREE_SITE_DOMAIN') || `http://localhost:${port}`
}

// x-preview-tenant carries tenant identity when subdomain routing isn't available:
// the named local tunnel, workers.dev, staging.*, and preview.*.
// Must stay in sync with isPreviewContext in server/utils/tenant-hosts.ts.
function isPreviewContext(hostname: string) {
  if (hostname === 'local.krabiclaw.com') return true
  if (hostname === 'workers.dev' || hostname.endsWith('.workers.dev')) return true
  if (/^(?:staging|preview)\.[^.]+\.[^.]+$/.test(hostname)) return true
  return false
}

function previewWorkerHeaders(slug: string): Record<string, string> {
  return { 'x-preview-tenant': slug, 'cache-control': 'no-store' }
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

export function blawbyTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'ncls.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isPreviewContext(base.hostname)) return base.toString().replace(/\/$/, '')
  base.hostname = base.hostname.startsWith('ncls.') ? base.hostname : `ncls.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function kikuzukiTestBaseUrl() {
  const base = new URL(testBaseUrl())
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    base.hostname = 'kikuzuki-krabi-thailand.localhost'
    return base.toString().replace(/\/$/, '')
  }
  if (isPreviewContext(base.hostname)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('kikuzuki-krabi-thailand.')
    ? base.hostname
    : `kikuzuki-krabi-thailand.${base.hostname}`
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

export function blawbyTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isPreviewContext(base.hostname) ? previewWorkerHeaders('ncls') : {}
}

export function kikuzukiTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return isPreviewContext(base.hostname)
    ? previewWorkerHeaders('kikuzuki-krabi-thailand')
    : {}
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

// /api/dashboard/* routes resolve their org strictly from this header (see
// resolveRequestedOrganization in server/utils/dashboard-context.ts) — the
// session's activeOrganizationId is only consulted by the handful of callers
// that opt out of URL-scoped context (e.g. /api/dashboard/context itself).
// Any test hitting an org-scoped dashboard route must attach this.
export function dashboardOrgHeaders(orgSlug: string): Record<string, string> {
  return { 'x-dashboard-org-slug': orgSlug }
}
