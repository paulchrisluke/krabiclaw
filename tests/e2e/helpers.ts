import { expect, type Page } from '@playwright/test'
import { tenantTestBaseUrl, potteryHouseTestBaseUrl, tenantTestExtraHeaders, potteryHouseTestExtraHeaders } from './test-env'

export const tenantBaseURL = tenantTestBaseUrl()
export const potteryHouseBaseURL = potteryHouseTestBaseUrl()
// Extra headers for tenant tests against *.workers.dev preview Workers.
// Apply via test.use({ extraHTTPHeaders: tenantExtraHeaders }) in each describe
// block that navigates to a tenant URL (not the platform/dashboard describes).
export const tenantExtraHeaders = tenantTestExtraHeaders()
export const potteryHouseExtraHeaders = potteryHouseTestExtraHeaders()

// Third-party origins whose request failures are expected noise in CI:
// no API keys, no allowlisted IP, headless browser blocked by CORS, etc.
const THIRD_PARTY_REQUEST_DOMAINS = [
  'maps.googleapis.com',
  'maps.gstatic.com',
  'google.internal.maps',
  'googletagmanager.com',
  'google-analytics.com',
  'doubleclick.net',
  'media.krabiclaw.com',
  'gen_204',
  'cloudflareinsights.com',
  'cdn-cgi',      // Cloudflare injected endpoints (Zaraz, Web Analytics beacon)
  'zaraz',
]

// Console-level text patterns for errors that are noise in CI.
// 'ERR_FAILED' suppresses the URL-less "Failed to load resource: net::ERR_FAILED"
// browser message — we rely on the requestfailed listener below for URL-aware filtering.
const THIRD_PARTY_CONSOLE_PATTERNS = [
  'ERR_FAILED',
  'cloudflareinsights.com',
]

// Inject extra headers ONLY into requests targeting the tenant's base hostname.
// page.setExtraHTTPHeaders sends to ALL origins, triggering CORS preflights on
// cross-origin resources (R2 media CDN, analytics beacon) that don't allow
// x-preview-tenant — causing ERR_BLOCKED_BY_ORB and CORS failures.
export async function setupTenantHeaders(page: Page, baseURL: string, headers: Record<string, string>) {
  if (!Object.keys(headers).length) return
  const { hostname } = new URL(baseURL)
  await page.route(`https://${hostname}/**`, async (route) => {
    await route.continue({ headers: { ...route.request().headers(), ...headers } })
  })
}

export function collectPageErrors(page: Page) {
  const errors: string[] = []
  const warnFailurePatterns = [
    'Hydration completed but contains mismatches.',
    'Hydration class mismatch',
    'Hydration text content mismatch',
    'Hydration attribute mismatch',
    'Invalid prop: custom validator check failed',
    'Component is missing template or render function',
  ]
  const warnAllowlistPatterns = [
    // Vue 3 currently emits this as an info/warn in dev; not a runtime correctness issue.
    '<Suspense> is an experimental feature',
  ]

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[BROWSER ${message.type().toUpperCase()}] ${text}`)
    }
    if (message.type() === 'error') errors.push(text)
    // Catch Vue Router "No match found" warnings (these indicate /undefined navigations)
    if (message.type() === 'warning' && text.includes('No match found for location with path')) {
      errors.push(`Vue Router warn: ${text}`)
    }
    if (message.type() === 'warning') {
      const isAllowlisted = warnAllowlistPatterns.some(pattern => text.includes(pattern))
      if (!isAllowlisted && warnFailurePatterns.some(pattern => text.includes(pattern))) {
        errors.push(`Vue warn: ${text}`)
      }
    }
  })

  page.on('pageerror', (error) => {
    console.log(`[BROWSER PAGEERROR] ${error.stack || error.message}`)
    errors.push(error.message)
  })

  // URL-aware network failure detection. The 'console' listener only gets the
  // generic "Failed to load resource: net::ERR_FAILED" message with no URL.
  // requestfailed provides the URL so we can distinguish first-party from noise.
  page.on('requestfailed', (request) => {
    const url = request.url()
    const isThirdParty = THIRD_PARTY_REQUEST_DOMAINS.some(d => url.includes(d))
    const reason = request.failure()?.errorText ?? 'ERR_FAILED'
    const isAborted = reason.includes('ERR_ABORTED')
    if (isAborted) return
    if (!isThirdParty) {
      errors.push(`Request failed: ${request.method()} ${url} (${reason})`)
    }
  })

  return errors
}

export async function expectHealthyPage(page: Page, errors: string[]) {
  await expect(page.locator('body')).not.toContainText('Site Not Found')
  await expect(page.locator('body')).not.toContainText('Vite Error')
  // Catch post-hydration 500/404: error.vue renders the status code as <h1>.
  // Some valid pages have multiple h1 tags, so check all headings explicitly.
  const h1Texts = (await page.locator('h1').allTextContents()).map(text => text.trim())
  expect(h1Texts.some(text => /404/.test(text))).toBe(false)
  expect(h1Texts.some(text => /500/.test(text))).toBe(false)
  expect(h1Texts.some(text => /503/.test(text))).toBe(false)
  // Catch the custom error page copy
  await expect(page.locator('body')).not.toContainText('wrong link sando')
  const appErrors = errors.filter(e => !THIRD_PARTY_CONSOLE_PATTERNS.some(p => e.includes(p)))
  expect(appErrors).toEqual([])
}
