import { expect, test } from '@playwright/test'

import {
  blawbyBaseURL,
  blawbyExtraHeaders,
  collectPageErrors,
  expectHealthyPage,
  setupTenantHeaders,
  tenantBaseURL,
  tenantExtraHeaders,
} from './helpers'

type SurfaceRoute = {
  path: string
  identity: string
  content: RegExp
}

type PublicSurface = {
  name: string
  baseURL: string
  headers: Record<string, string>
  routes: SurfaceRoute[]
}

// This intentionally stays smaller than the full public route matrix. It is
// the immutable-candidate smoke gate for the two high-risk tenant renderers;
// the full route suites remain responsible for exhaustive functional coverage.
const surfaces: PublicSurface[] = [
  {
    name: 'Saya',
    baseURL: tenantBaseURL,
    headers: tenantExtraHeaders,
    routes: [
      {
        path: '/',
        identity: '[data-saya-critical-hero]',
        content: /Ember\s*&\s*Slice/i,
      },
      {
        path: '/about',
        identity: '.saya-theme [data-tenant-page][data-template="saya"]',
        content: /Ember\s*&\s*Slice/i,
      },
    ],
  },
  {
    name: 'Blawby',
    baseURL: blawbyBaseURL,
    headers: blawbyExtraHeaders,
    routes: [
      {
        path: '/',
        identity: '[data-blawby-critical-hero]',
        content: /North Carolina Legal Services/i,
      },
      {
        // `/services` is the stable published Blawby critical route. The
        // mutable `/links` fixture is covered by links-page.spec.ts, which
        // creates and cleans its page explicitly instead of relying on seed
        // state in this read-only release gate.
        path: '/services',
        identity: '.blawby-shell [data-parity-root]',
        content: /Services/i,
      },
    ],
  },
]

function isKrabiClawHost(hostname: string): boolean {
  return hostname === 'krabiclaw.com' || hostname.endsWith('.krabiclaw.com') || hostname.endsWith('.localhost')
}

for (const surface of surfaces) {
  test.describe(`${surface.name} release surfaces`, () => {
    for (const route of surface.routes) {
      test(`${route.path} renders the ${surface.name} candidate without first-party failures`, async ({ page }, testInfo) => {
        const viewport = page.viewportSize()
        if (!viewport) throw new Error(`${testInfo.project.name} must use a real configured viewport`)
        if (testInfo.project.name === 'public-surfaces-mobile') {
          expect(viewport.width).toBeLessThanOrEqual(500)
        } else {
          expect(viewport.width).toBeGreaterThanOrEqual(1000)
        }
        await setupTenantHeaders(page, surface.baseURL, surface.headers)
        const errors = collectPageErrors(page)
        const requestFailures: string[] = []
        page.on('requestfailed', (request) => {
          const requestUrl = new URL(request.url())
          if (isKrabiClawHost(requestUrl.hostname)) {
            requestFailures.push(`${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'failed'})`)
          }
        })

        const expectedUrl = new URL(route.path, `${surface.baseURL}/`).toString()
        const response = await page.goto(expectedUrl, { waitUntil: 'load' })
        expect(response?.status()).toBe(200)
        expect(new URL(page.url()).pathname).toBe(route.path)
        await expect(page.locator(route.identity)).toBeVisible()
        await expect(page.locator('body')).toContainText(route.content)
        await expectHealthyPage(page, errors)
        expect(requestFailures).toEqual([])
      })
    }
  })
}
