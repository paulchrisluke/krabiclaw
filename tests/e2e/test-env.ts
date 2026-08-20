import {
  environmentTenantAliasHostname,
  usesTenantHeader,
} from '../../server/utils/tenant-hosts'

export const POTTERY_HOUSE_CANONICAL_URL = 'https://www.potteryhousekrabi.com'
export const KIKUZUKI_CANONICAL_URL = 'https://www.kikuzuki-thailand.com'
export const NCLS_CANONICAL_URL = 'https://www.northcarolinalegalservices.org'

export function testBaseUrl() {
  const previewUrl = process.env.PLAYWRIGHT_PREVIEW_URL
  if (previewUrl) return previewUrl

  let port = Number.parseInt(process.env.PORT ?? '', 10)
  if (Number.isNaN(port) || port <= 0) port = 3000

  // Local E2E should target the webServer port explicitly instead of a stale
  // app domain from .env, otherwise tests can hit an unrelated process.
  return `http://localhost:${port}`
}

function previewWorkerHeaders(slug: string): Record<string, string> {
  return { 'x-preview-tenant': slug }
}

function usesSharedTenantHost(base: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
    || usesTenantHeader(base.hostname)
}

function deployedEnvironmentTenantBaseUrl(base: URL, slug: string): string | null {
  const aliasHostname = environmentTenantAliasHostname(base.hostname, slug)
  if (!aliasHostname) return null
  base.hostname = aliasHostname
  return base.toString().replace(/\/$/, '')
}

export function tenantTestBaseUrl() {
  const base = new URL(testBaseUrl())
  const environmentBaseUrl = deployedEnvironmentTenantBaseUrl(base, 'demo')
  if (environmentBaseUrl) return environmentBaseUrl
  if (usesSharedTenantHost(base)) {
    return base.toString().replace(/\/$/, '')
  }
  base.hostname = base.hostname.startsWith('demo.') ? base.hostname : `demo.${base.hostname}`
  return base.toString().replace(/\/$/, '')
}

export function potteryHouseTestBaseUrl() {
  const base = new URL(testBaseUrl())
  const environmentBaseUrl = deployedEnvironmentTenantBaseUrl(base, 'pottery-house')
  if (environmentBaseUrl) return environmentBaseUrl
  if (usesSharedTenantHost(base)) {
    return base.toString().replace(/\/$/, '')
  }
  return POTTERY_HOUSE_CANONICAL_URL
}

export function blawbyTestBaseUrl() {
  const base = new URL(testBaseUrl())
  const environmentBaseUrl = deployedEnvironmentTenantBaseUrl(base, 'ncls')
  if (environmentBaseUrl) return environmentBaseUrl
  if (usesSharedTenantHost(base)) return base.toString().replace(/\/$/, '')
  return NCLS_CANONICAL_URL
}

export function kikuzukiTestBaseUrl() {
  const base = new URL(testBaseUrl())
  const environmentBaseUrl = deployedEnvironmentTenantBaseUrl(base, 'kikuzuki-krabi-thailand')
  if (environmentBaseUrl) return environmentBaseUrl
  if (usesSharedTenantHost(base)) {
    return base.toString().replace(/\/$/, '')
  }
  return KIKUZUKI_CANONICAL_URL
}

export function tenantTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return usesSharedTenantHost(base) ? previewWorkerHeaders('demo') : {}
}

export function potteryHouseTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return usesSharedTenantHost(base) ? previewWorkerHeaders('pottery-house') : {}
}

export function blawbyTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return usesSharedTenantHost(base) ? previewWorkerHeaders('ncls') : {}
}

export function kikuzukiTestExtraHeaders(): Record<string, string> {
  const base = new URL(testBaseUrl())
  return usesSharedTenantHost(base)
    ? previewWorkerHeaders('kikuzuki-krabi-thailand')
    : {}
}

export function devLoginHeaders(): Record<string, string> | undefined {
  const secret = process.env.E2E_DEV_ROUTE_SECRET ?? ''
  return secret ? { 'x-dev-route-secret': secret } : undefined
}
