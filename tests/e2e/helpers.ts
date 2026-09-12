import { expect, test, type Page, type Request, type Response } from '@playwright/test'
import { blawbyTestBaseUrl, blawbyTestExtraHeaders, tenantTestBaseUrl, potteryHouseTestBaseUrl, tenantTestExtraHeaders, potteryHouseTestExtraHeaders } from './test-env'

export const tenantBaseURL = tenantTestBaseUrl()
export const potteryHouseBaseURL = potteryHouseTestBaseUrl()
export const blawbyBaseURL = blawbyTestBaseUrl()
// Extra headers for tenant tests against local or raw *.workers.dev hosts.
// Deployed preview and staging tenant tests use direct environment aliases.
export const tenantExtraHeaders = tenantTestExtraHeaders()
export const potteryHouseExtraHeaders = potteryHouseTestExtraHeaders()
export const blawbyExtraHeaders = blawbyTestExtraHeaders()

// Third-party origins whose request failures are expected noise in CI:
// no API keys, no allowlisted IP, headless browser blocked by CORS, etc.
const THIRD_PARTY_REQUEST_DOMAINS = [
  'maps.googleapis.com',
  'maps.gstatic.com',
  'google.internal.maps',
  'doubleclick.net',
  'media.krabiclaw.com',
  'googleusercontent.com', // author avatars; headless Chromium blocks them with ERR_BLOCKED_BY_ORB
  'gen_204',
  'cdn-cgi',      // Cloudflare injected endpoints (Zaraz, Web Analytics beacon)
  'zaraz',
]

// Console-level text patterns for errors that are noise in CI.
// 'ERR_FAILED' suppresses the URL-less "Failed to load resource: net::ERR_FAILED"
// browser message — we rely on the requestfailed listener below for URL-aware filtering.
const THIRD_PARTY_CONSOLE_PATTERNS = [
  'ERR_FAILED',
  'Permissions policy violation: compute-pressure is not allowed',
]

interface ZarazConsentApi {
  APIReady: boolean
  modal: boolean
  getAll: () => Record<string, boolean>
}

// Inject extra headers ONLY into requests targeting the tenant's base hostname.
// page.setExtraHTTPHeaders sends to ALL origins, triggering CORS preflights on
// cross-origin resources (R2 media CDN, analytics beacon) that don't allow
// x-preview-tenant — causing ERR_BLOCKED_BY_ORB and CORS failures.
export async function openTenantPage(page: Page, url: string, headers: Record<string, string>) {
  const { origin, hostname } = new URL(url)
  const usesZarazConsent = !['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
  if (Object.keys(headers).length) {
    await page.route(`${origin}/**`, async (route) => {
      await route.continue({ headers: { ...route.request().headers(), ...headers } })
    })
  }

  if (usesZarazConsent) {
    await page.addInitScript(() => {
      const showConsent = () => {
        const consent = (window as Window & { zaraz?: { consent?: ZarazConsentApi } }).zaraz?.consent
        if (!consent?.APIReady) return
        const choices = Object.values(consent.getAll())
        if (!choices.length || !choices.every(Boolean)) consent.modal = true
      }
      const consent = (window as Window & { zaraz?: { consent?: ZarazConsentApi } }).zaraz?.consent
      if (consent?.APIReady) showConsent()
      else document.addEventListener('zarazConsentAPIReady', showConsent, { once: true })
    })
  }

  const started = Date.now()
  const pending = new Set<Request>()
  let stage = 'navigation'
  let documentResponse: Record<string, unknown> | null = null
  const onRequest = (request: Request) => pending.add(request)
  const onFinished = (request: Request) => pending.delete(request)
  const onResponse = (response: Response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
      const headers = response.headers()
      documentResponse = {
        status: response.status(),
        requestId: headers['x-request-id'],
        rayId: headers['cf-ray'],
        d1Statements: headers['x-d1-query-count'] ?? null,
        d1DurationMs: headers['x-d1-duration-ms'] ?? null,
        serverDurationMs: headers['x-total-duration-ms'] ?? null,
      }
    }
  }
  const report = (event: string) => console.log('[e2e-navigation]', JSON.stringify({
    event, stage, path: new URL(url).pathname, hostname, durationMs: Date.now() - started,
    testTimeoutMs: test.info().timeout,
    documentResponse,
    pending: [...pending].map(request => {
      const resource = new URL(request.url())
      return { origin: resource.origin, path: resource.pathname, type: request.resourceType() }
    }),
  }))
  page.on('request', onRequest)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFinished)
  page.on('response', onResponse)
  report('started')
  try {
    const response = await page.goto(url, { waitUntil: 'load' })
    stage = 'consent'
    report('loaded')
    if (usesZarazConsent) {
      await page.waitForFunction(() => {
        const consent = (window as Window & { zaraz?: { consent?: ZarazConsentApi } }).zaraz?.consent
        return consent?.APIReady === true
      })
      const alreadyAccepted = await page.evaluate(() => {
        const consent = (window as Window & { zaraz?: { consent?: ZarazConsentApi } }).zaraz?.consent
        if (!consent?.APIReady) return false
        const choices = Object.values(consent.getAll())
        return choices.length > 0 && choices.every(Boolean)
      })
      if (!alreadyAccepted) {
        const consentModal = page.getByRole('dialog', { name: 'Cookie Settings' })
        await consentModal.getByRole('button', { name: 'Accept All' }).click()
        await expect(consentModal).toBeHidden()
      }
    }

    report('finished')
    return response
  } catch (error) {
    report('failed')
    throw error
  } finally {
    page.off('request', onRequest)
    page.off('requestfinished', onFinished)
    page.off('requestfailed', onFinished)
    page.off('response', onResponse)
  }
}

export function collectPageErrors(page: Page, options: { failOnAllWarnings?: boolean } = {}) {
  const errors: string[] = []
  const warnFailurePatterns = [
    'Hydration completed but contains mismatches.',
    'Hydration class mismatch',
    'Hydration text content mismatch',
    'Hydration attribute mismatch',
    'onScopeDispose() is called when there is no active effect scope',
    'onMounted is called when there is no active component instance',
    'onBeforeUnmount is called when there is no active component instance',
    'Invalid prop: custom validator check failed',
    'Component is missing template or render function',
  ]
  const warnAllowlistPatterns = [
    // Vue 3 currently emits this as an info/warn in dev; not a runtime correctness issue.
    '<Suspense> is an experimental feature',
  ]

  page.on('console', (message) => {
    const text = message.text()
    const location = message.location()
    const source = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : ''
    const decoratedText = `${text}${source}`
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[BROWSER ${message.type().toUpperCase()}] ${decoratedText}`)
    }
    if (message.type() === 'error') errors.push(decoratedText)
    // Catch Vue Router "No match found" warnings (these indicate /undefined navigations)
    if (message.type() === 'warning' && text.includes('No match found for location with path')) {
      errors.push(`Vue Router warn: ${decoratedText}`)
    }
    if (message.type() === 'warning') {
      const isAllowlisted = warnAllowlistPatterns.some(pattern => text.includes(pattern))
      if (options.failOnAllWarnings) {
        errors.push(`Browser warning: ${decoratedText}`)
      } else if (!isAllowlisted && warnFailurePatterns.some(pattern => text.includes(pattern))) {
        errors.push(`Vue warn: ${decoratedText}`)
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

export async function expectHealthyPage(page: Page, errors: string[], allowedErrors: string[] = []) {
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
  const appErrors = errors.filter(e =>
    !THIRD_PARTY_CONSOLE_PATTERNS.some(p => e.includes(p))
    && !allowedErrors.some(p => e.includes(p)),
  )
  expect(appErrors).toEqual([])
}

// Cloudflare's injected preview toolbar can leave an empty overlay over app controls.
export async function dismissPreviewToolbar(page: Page) {
  await page.addInitScript(() => {
    const removePreviewModal = () => document.querySelectorAll('.cf_modal_container').forEach(element => element.remove())
    new MutationObserver(removePreviewModal).observe(document, { childList: true, subtree: true })
    removePreviewModal()
  })
}
