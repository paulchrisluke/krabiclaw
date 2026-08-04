import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, setupTenantHeaders, tenantBaseURL, tenantExtraHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

test('platform home renders', async ({ page, baseURL }) => {
  const errors = collectPageErrors(page)
  const response = await page.goto(baseURL!, { waitUntil: 'load' })
  expect(response?.status()).toBeLessThan(400)
  await expectHealthyPage(page, errors)
})

test.describe('standalone platform routes', () => {
  for (const path of [
    '/help',
    '/oauth/login',
    '/oauth/consent',
    '/accept-invitation/e2e-invalid-invitation',
    '/transfer/e2e-invalid-transfer',
  ]) {
    test(`${path} renders with an applied stylesheet`, async ({ page, baseURL }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(500)

      const stylesheetHrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
        links.map((link) => link.getAttribute('href')),
      )
      expect(stylesheetHrefs).toContain('/_nuxt/surfaces/platform.css')
      expect(await page.locator('script[type="module"][src^="/_nuxt/"]').count()).toBeGreaterThan(0)
      await expectHealthyPage(page, errors)
    })
  }
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
      const errors = collectPageErrors(page)
      const url = new URL(path, `${tenantBaseURL}/`)
      const response = await page.goto(url.toString(), { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expectHealthyPage(page, errors)
    })
  }

  test('mobile Saya navigation and logo remain interactive after hydration', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const errors = collectPageErrors(page)
    const response = await page.goto(`${tenantBaseURL}/experiences`, { waitUntil: 'load' })
    expect(response?.status()).toBeLessThan(400)

    const menuButton = page.locator('[data-saya-critical-menu]')
    await expect(menuButton).toHaveAttribute('aria-label', /open navigation/i)
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-label', /close navigation/i)
    const mobileNav = page.locator('header > div.absolute nav')
    await expect(mobileNav).toHaveCount(1)
    await expect(mobileNav).toBeVisible()

    await page.locator('[data-saya-critical-logo-link]').click()
    await expect(page).toHaveURL(`${tenantBaseURL}/`)
    await expect(page.locator('body')).toContainText('Ember & Slice')
    await expectHealthyPage(page, errors)
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

  test('public shell and page enforce data-loading budgets', async ({ request }) => {
    const readMetrics = async (path: string) => {
      const response = await request.get(`${tenantBaseURL}${path}`, {
        headers: tenantExtraHeaders,
      })
      expect(response.status()).toBe(200)
      expect(response.headers()['x-request-id']).toBeTruthy()
      expect(response.headers()['x-data-cache']).toBeTruthy()
      expect(response.headers()['server-timing']).toContain('d1;dur=')
      expect(response.headers()['server-timing']).toContain('total;dur=')
      const queryCount = Number(response.headers()['x-d1-query-count'])
      const responseBytes = Number(response.headers()['x-response-bytes'])
      expect(Number.isInteger(queryCount)).toBe(true)
      expect(Number.isInteger(responseBytes)).toBe(true)
      return { queryCount, responseBytes }
    }

    const shell = await readMetrics('/api/public/sites/site-demo/shell?locale=th')
    const simplePage = await readMetrics('/api/public/sites/site-demo/page?page=about&locale=th')
    expect(shell.queryCount + simplePage.queryCount).toBeLessThanOrEqual(8)
    expect(shell.responseBytes).toBeLessThanOrEqual(30 * 1024)
    expect(simplePage.responseBytes).toBeLessThanOrEqual(25 * 1024)

    const experiencePage = await readMetrics(
      '/api/public/sites/site-demo/page?page=experiences&experience=pizza-making-class',
    )
    expect(shell.queryCount + experiencePage.queryCount).toBeLessThanOrEqual(12)
  })
})

test('development login reaches dashboard context', async ({ request, baseURL }) => {
  const login = await request.get(devLoginUrl(baseURL!, `e2e-smoke-${Date.now()}`), { headers: devLoginHeaders() })
  expect(login.status()).toBeLessThan(400)
  const context = await request.get(`${baseURL}/api/dashboard/context`)
  expect(context.status()).toBe(200)
})
