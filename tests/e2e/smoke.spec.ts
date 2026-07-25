import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, setupTenantHeaders, tenantBaseURL, tenantExtraHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

test('platform home renders', async ({ page, baseURL }) => {
  const errors = collectPageErrors(page)
  const response = await page.goto(baseURL!, { waitUntil: 'load' })
  expect(response?.status()).toBeLessThan(400)
  await expectHealthyPage(page, errors)
})

test.describe('representative tenant routes', () => {
  test.beforeEach(async ({ page }) => setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders))

  // Split into one test per path (was a single test looping over both) — a
  // fresh preview deploy's first navigation to a not-yet-cached URL can cost
  // several seconds of genuine cold-start latency (confirmed via curl: ~12s
  // time-to-first-byte on a cold hit vs. ~2-3s once warm), and a full browser
  // `waitUntil: 'load'` pays that cost again for every JS/CSS/image
  // subresource on top of the document itself. Two such navigations sharing
  // one 30s test timeout could exceed it even when neither navigation alone
  // is anomalously slow; splitting gives each its own independent budget
  // instead of masking the issue with a longer shared timeout.
  for (const path of ['/', '/locations/brooklyn']) {
    test(`${path === '/' ? 'home' : path} renders without hydration errors`, async ({ page }) => {
      // Preview is a shared hostname redeployed on every PR. A unique query keeps
      // Cloudflare from serving HTML cached before the current deploy, which can
      // reference Nuxt asset hashes that no longer exist in the Assets binding.
      const errors = collectPageErrors(page)
      const url = new URL(path, `${tenantBaseURL}/`)
      url.searchParams.set('e2e', `e2e-deploy-${Date.now()}`)
      const response = await page.goto(url.toString(), { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expectHealthyPage(page, errors)
    })
  }

  test('unknown tenant route returns not found', async ({ request }) => {
    const response = await request.get(`${tenantBaseURL}/e2e-this-route-does-not-exist`, { headers: tenantExtraHeaders })
    expect(response.status()).toBe(404)
  })

  test('public contact API accepts a representative write', async ({ request }) => {
    const response = await request.post(`${tenantBaseURL}/api/public/sites/site-demo/contact`, {
      headers: tenantExtraHeaders,
      data: {
        name: 'Playwright Smoke',
        email: `smoke-${Date.now()}@playwright.example`,
        message: 'Required CI representative write path',
      },
    })
    expect(response.status()).toBe(201)
  })
})

test('development login reaches dashboard context', async ({ request, baseURL }) => {
  const login = await request.get(devLoginUrl(baseURL!, `e2e-smoke-${Date.now()}`), { headers: devLoginHeaders() })
  expect(login.status()).toBeLessThan(400)
  const context = await request.get(`${baseURL}/api/dashboard/context`)
  expect(context.status()).toBe(200)
})
