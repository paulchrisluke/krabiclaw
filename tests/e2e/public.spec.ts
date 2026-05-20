import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, tenantBaseURL } from './helpers'

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
  { path: '/reservations', title: /Reserve a Table/, text: 'Make a Reservation' },
  { path: '/contact', title: /Contact/, text: 'Send a message' }
]

test.describe('public tenant site', () => {
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
        requests: 'Playwright cancellation token coverage'
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
})

test.describe('platform public site', () => {
  test('home and blog render without runtime errors', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)

    const home = await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
    expect(home?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText('krabiclaw.com')

    const blog = await page.goto(`${baseURL}/blog`, { waitUntil: 'domcontentloaded' })
    expect(blog?.status()).toBeLessThan(400)
    await expect(page).toHaveTitle(/Blog/)
    await expect(page.locator('body')).toContainText('Restaurant Blog')

    await expectHealthyPage(page, errors)
  })
})
