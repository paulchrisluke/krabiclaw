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

  test('home and a deep route render without hydration errors', async ({ page }) => {
    for (const path of ['/', '/locations/brooklyn']) {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${tenantBaseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expectHealthyPage(page, errors)
    }
  })

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
