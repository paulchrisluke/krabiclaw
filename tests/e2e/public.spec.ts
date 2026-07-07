import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, tenantBaseURL, tenantExtraHeaders, setupTenantHeaders } from './helpers'
import { demoFixture } from '../../seed-definitions/demo'

const demoSiteId = demoFixture.siteId
const demoExperienceSlug = demoFixture.experiences[0]!.slug

const tenantRoutes = [
  { path: '/', title: /Ember & Slice/, text: 'Ember & Slice' },
  { path: '/locations', title: /Locations/, text: 'Locations' },
  { path: '/locations/brooklyn', title: /Ember & Slice Brooklyn \| Locations/, text: 'Ember & Slice Brooklyn' },
  { path: '/locations/west-village', title: /Ember & Slice West Village \| Locations/, text: 'Ember & Slice West Village' },
  { path: '/locations/brooklyn/photos', title: /Photos .* Ember & Slice Brooklyn/, text: 'Inside' },
  { path: '/locations/brooklyn/menu', title: /Menu .* Ember & Slice Brooklyn/, text: 'Menu' },
  { path: '/locations/brooklyn/reviews', title: /Reviews .* Ember & Slice Brooklyn/, text: 'Reviews' },
  { path: '/locations/brooklyn/qa', title: /Questions and answers/, text: 'Frequently asked' },
  { path: '/locations/brooklyn/contact', title: /Plan a visit .* Ember & Slice Brooklyn/, text: 'Visit' },
  { path: '/about', title: /About|Story|Ember/, text: 'Ember' },
  { path: '/posts', title: /Updates|Posts|Ember/, text: 'Ember' },
  ...demoFixture.publicRoutes,
  // Demo site is a restaurant with experiences attached, not a pure experience vertical,
  // so /reservations stays the generic table-reservation form alongside /experiences.
  // The mobile sticky reservation bar was removed (each location card already has its own
  // reserve CTA), so the guaranteed on-page text is the per-location button, not that bar's copy.
  { path: '/reservations', title: /Ember & Slice \| Reserve a table/, text: 'Request Reservation' },
  { path: '/contact', title: /Contact/, text: 'Send a message' }
]

test.describe('public tenant site', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
  })

  for (const route of tenantRoutes) {
    test(`${route.path} renders without runtime errors`, async ({ page }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${tenantBaseURL}${route.path}`, { waitUntil: 'load' })

      // Check SSR HTTP status before hydration
      expect(response?.status()).toBeLessThan(400)

      // Wait for Vue hydration to complete by checking for expected text in body
      await page.waitForFunction(() => {
        return document.body && document.body.textContent !== null
      })
      await page.waitForLoadState('load')

      await expect(page).toHaveTitle(route.title)
      await expect(page.locator('body')).toContainText(route.text)
      await expectHealthyPage(page, errors)
    })
  }

  test('reservation cancellation uses a single-use token instead of email in the URL', async ({ request }) => {
    const reservationResponse = await request.post(`${tenantBaseURL}/api/public/sites/site-demo/reservations`, {
      data: {
        name: 'Token Cancel Test',
        email: `cancel-${Date.now()}@example.com`,
        phone: '+15555550123',
        date: '2030-05-17',
        time: '19:00',
        guests: '2',
        requests: 'Playwright cancellation token coverage',
        location_id: 'loc-demo',
      }
    })

    expect(reservationResponse.status()).toBe(201)
    const reservation = await reservationResponse.json()
    expect(reservation.id).toEqual(expect.any(String))
    expect(reservation.cancellationToken).toEqual(expect.any(String))

    const emailLookup = await request.get(`${tenantBaseURL}/api/public/sites/site-demo/reservations/${reservation.id}?email=cancel@example.com`)
    expect(emailLookup.status()).toBe(400)

    const tokenLookup = await request.get(`${tenantBaseURL}/api/public/sites/site-demo/reservations/${reservation.id}`, {
      headers: {
        Authorization: `Bearer ${reservation.cancellationToken}`
      }
    })
    expect(tokenLookup.status()).toBe(200)

    const cancelResponse = await request.post(`${tenantBaseURL}/api/public/sites/site-demo/reservations/${reservation.id}/cancel`, {
      headers: {
        Authorization: `Bearer ${reservation.cancellationToken}`
      }
    })
    expect(cancelResponse.status()).toBe(200)

    const replayResponse = await request.post(`${tenantBaseURL}/api/public/sites/site-demo/reservations/${reservation.id}/cancel`, {
      headers: {
        Authorization: `Bearer ${reservation.cancellationToken}`
      }
    })
    expect(replayResponse.status()).toBe(404)
  })

  test('demo experience booking API creates a pending booking and returns booking_id', async ({ request }) => {
    // Use a unique far-future date derived from the run timestamp to avoid capacity
    // accumulation across repeated local runs against the persistent D1 fixture.
    const uniqueDaysOffset = 180 + (Math.floor(Date.now() / 60_000) % 500)
    const futureDate = new Date(Date.now() + uniqueDaysOffset * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const response = await request.post(
      `${tenantBaseURL}/api/public/sites/${demoSiteId}/experiences/${demoExperienceSlug}/book`,
      {
        data: {
          guest_name: 'Playwright Demo Experience Guest',
          guest_email: `demo-exp-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: futureDate,
          time_slot: '14:00',
          notes: 'Playwright demo experience booking coverage',
        },
      },
    )

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.booking_id).toEqual(expect.any(String))
    expect(body.message).toContain('Pizza Making Class')
    expect(body.message).toContain(futureDate)
  })

  test('demo experience detail route renders detail, not the experiences index page', async ({ page }) => {
    const errors = collectPageErrors(page)
    const response = await page.goto(
      `${tenantBaseURL}/experiences/${demoExperienceSlug}`,
      { waitUntil: 'domcontentloaded' },
    )

    expect(response?.status()).toBeLessThan(400)
    await page.waitForFunction(() => document.body && document.body.textContent !== null)

    await expect(page).not.toHaveTitle(/^Experiences \| Ember & Slice$/)
    await expect(page).toHaveTitle(/Pizza Making Class Brooklyn \| Ember & Slice/)
    await expect(page.locator('body')).toContainText('Stretch dough, top your pie, and fire it yourself.')

    await expectHealthyPage(page, errors)
  })

  test('missing tenant route returns a direct 404 through error.vue without redirect', async ({ page }) => {
    const missingPath = '/this-route-should-not-exist'
    const response = await page.goto(`${tenantBaseURL}${missingPath}`, { waitUntil: 'load' })

    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(`${tenantBaseURL}${missingPath}`)
    await expect(page.locator('body')).toContainText('Error 404')
    await expect(page.locator('body')).toContainText('Page not found')
    await expect(page.locator('body')).not.toContainText('Site Not Found')
  })

  test('search-engine-like referrer preserves tenant 404 status and URL', async ({ page }) => {
    const missingPath = '/blog/definitely-missing-post'
    const response = await page.goto(`${tenantBaseURL}${missingPath}`, {
      waitUntil: 'load',
      referer: 'https://www.google.com/search?q=krabiclaw+missing+post',
    })

    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(`${tenantBaseURL}${missingPath}`)
    await expect(page.locator('body')).toContainText('Error 404')
    await expect(page.locator('body')).toContainText('Page not found')
  })

  test('valid tenant route still works with a search-engine-like referrer', async ({ page }) => {
    const response = await page.goto(`${tenantBaseURL}/locations`, {
      waitUntil: 'load',
      referer: 'https://www.google.com/search?q=ember+slice+locations',
    })

    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(`${tenantBaseURL}/locations`)
    await expect(page.locator('body')).toContainText('Locations')
  })

  test('unknown tenant localhost subdomain returns 404 without redirect', async ({ page }) => {
    const base = new URL(tenantBaseURL)
    test.skip(
      !base.hostname.endsWith('.localhost'),
      'Unknown-tenant subdomain routing is only directly testable in localhost E2E.',
    )

    base.hostname = 'missing-tenant.localhost'
    const response = await page.goto(`${base.toString().replace(/\/$/, '')}/`, { waitUntil: 'load' })

    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(base.toString().replace(/\/$/, '') + '/')
    await expect(page.locator('body')).toContainText('Error 404')
    await expect(page.locator('body')).toContainText('Page not found')
  })

  test('tenant page does not inherit platform analytics globals', async ({ page }) => {
    const response = await page.goto(`${tenantBaseURL}/`, { waitUntil: 'load' })
    expect(response?.status()).toBeLessThan(400)

    const globals = await page.evaluate(() => ({
      hasKrabiLayer: typeof (window as Window & { krabiLayer?: unknown }).krabiLayer !== 'undefined',
    }))

    expect(globals.hasKrabiLayer).toBe(false)
  })
})

test.describe('platform public site', () => {
  test('home and blog render without runtime errors', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)

    const home = await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
    expect(home?.status()).toBeLessThan(400)
    await page.waitForLoadState('load')
    await expect(page.getByRole('link', { name: /krabiclaw/i }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /your local business, managed through chatgpt/i })).toBeVisible()
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined')

    const blog = await page.goto(`${baseURL}/blog`, { waitUntil: 'domcontentloaded' })
    expect(blog?.status()).toBeLessThan(400)
    await page.waitForLoadState('load')
    await expect(page).toHaveTitle(/Local AI Growth Notes/)
    await expect(page.getByRole('heading', { name: 'Local AI Growth Notes' })).toBeVisible()

    await expectHealthyPage(page, errors)
  })

  test('missing platform route returns error.vue 404 without redirect', async ({ page, baseURL }) => {
    const missingPath = '/definitely-missing-platform-route'
    const response = await page.goto(`${baseURL}${missingPath}`, { waitUntil: 'load' })

    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(`${baseURL}${missingPath}`)
    await expect(page.locator('body')).toContainText('Error 404')
    await expect(page.locator('body')).toContainText('Page not found')
  })

  test('/tenant-404 is not a special rendered page anymore', async ({ page, baseURL }) => {
    const response = await page.goto(`${baseURL}/tenant-404`, { waitUntil: 'load' })

    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(`${baseURL}/tenant-404`)
    await expect(page.locator('body')).toContainText('Error 404')
    await expect(page.locator('body')).toContainText('Page not found')
    await expect(page.locator('body')).not.toContainText('Site Not Found')
  })
})
