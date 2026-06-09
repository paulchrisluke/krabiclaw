import { expect, type Page } from '@playwright/test'
import { tenantTestBaseUrl, potteryHouseTestBaseUrl, tenantTestExtraHeaders, potteryHouseTestExtraHeaders } from './test-env'

export const tenantBaseURL = tenantTestBaseUrl()
export const potteryHouseBaseURL = potteryHouseTestBaseUrl()
// Extra headers for tenant tests against *.workers.dev preview Workers.
// Apply via test.use({ extraHTTPHeaders: tenantExtraHeaders }) in each describe
// block that navigates to a tenant URL (not the platform/dashboard describes).
export const tenantExtraHeaders = tenantTestExtraHeaders()
export const potteryHouseExtraHeaders = potteryHouseTestExtraHeaders()

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

  return errors
}

// Third-party origins whose console errors are noise, not app failures.
const THIRD_PARTY_ERROR_PATTERNS = [
  'maps.googleapis.com',
  'google.internal.maps',
  'gen_204',
  'maps.gstatic.com',
]

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
  const appErrors = errors.filter(e => !THIRD_PARTY_ERROR_PATTERNS.some(p => e.includes(p)))
  expect(appErrors).toEqual([])
}
