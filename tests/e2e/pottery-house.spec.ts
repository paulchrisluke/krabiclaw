import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, potteryHouseBaseURL, potteryHouseExtraHeaders, setupTenantHeaders } from './helpers'
import { potteryHouseFixture } from '../../seed-definitions/pottery-house'

const siteId = potteryHouseFixture.siteId
const wheelClass = potteryHouseFixture.experiences.find((e) => e.slug === 'pottery-wheel-class')!

const routes = [
  { path: '/', title: /Pottery House Krabi/, text: potteryHouseFixture.site.brandName },
  ...potteryHouseFixture.publicRoutes,
  { path: '/about', title: /Pottery House/, text: 'Pottery House' },
  { path: '/contact', title: /Contact/, text: potteryHouseFixture.site.contactPhone! },
]

test.describe('pottery house public site', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, potteryHouseBaseURL, potteryHouseExtraHeaders)
  })

  for (const route of routes) {
    test(`${route.path} renders without runtime errors`, async ({ page }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${potteryHouseBaseURL}${route.path}`, { waitUntil: 'load' })

      expect(response?.status()).toBeLessThan(400)
      await page.waitForFunction(() => document.body && document.body.textContent !== null)
      await page.waitForLoadState('load')

      await expect(page).toHaveTitle(route.title)
      await expect(page.locator('body')).toContainText(route.text)
      await expectHealthyPage(page, errors)
    })
  }

  // Regression: experience detail must render the detail page, not the /experiences index.
  // This was the canonical failure in the Pottery House onboarding incident (Nuxt nested routing conflict).
  test('experience detail route renders detail, not index page', async ({ page }) => {
    const errors = collectPageErrors(page)
    const response = await page.goto(
      `${potteryHouseBaseURL}/experiences/${wheelClass.slug}`,
      { waitUntil: 'load' },
    )

    expect(response?.status()).toBeLessThan(400)
    await page.waitForLoadState('load')

    // Index title must not appear — proves detail route rendered
    await expect(page).not.toHaveTitle(/^Experiences \| Pottery House Krabi$/)
    await expect(page).toHaveTitle(new RegExp(wheelClass.title))

    // Breadcrumb shows the experience name (detail rendered the breadcrumb, index does not).
    // Use last() — breadcrumb is always the last nav on the page (primary nav comes first in DOM).
    await expect(page.locator('nav').last()).toContainText(wheelClass.title)

    // Tagline is detail-page-only content
    await expect(page.locator('body')).toContainText(wheelClass.tagline)

    await expectHealthyPage(page, errors)
  })

  // Regression: no restaurant-vertical copy must appear on an experience site.
  // These strings come from the restaurant branch of getVerticalCopy().
  test('site does not render restaurant-vertical copy', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${potteryHouseBaseURL}/`, { waitUntil: 'load' })
    await page.waitForLoadState('load')

    for (const forbidden of ['Come dine with us', 'Reserve a table', 'From the kitchen', 'Reserve a Table', 'Make a Reservation']) {
      await expect(page.locator('body')).not.toContainText(forbidden)
    }

    await expectHealthyPage(page, errors)
  })

  // Regression: no Saya demo data or fallback copy must leak through.
  test('site does not leak Saya demo fallback copy', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${potteryHouseBaseURL}/`, { waitUntil: 'load' })
    await page.waitForLoadState('load')

    await expect(page.locator('body')).not.toContainText('Also part of Saya')
    await expect(page.locator('body')).not.toContainText('Ember & Slice')
    await expect(page.locator('body')).not.toContainText('ember@example.com')

    await expectHealthyPage(page, errors)
  })

  // Booking API: creates a pending booking for a real experience
  test('booking API creates a pending booking and returns booking_id', async ({ request }) => {
    // Use a unique far-future date derived from the run timestamp to avoid capacity
    // accumulation: repeated same-day runs would otherwise fill maxCapacity (8) with
    // stale pending bookings, causing 409 on subsequent runs.
    const uniqueDaysOffset = 180 + (Math.floor(Date.now() / 60_000) % 500)
    const futureDate = new Date(Date.now() + uniqueDaysOffset * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    const firstSlot = wheelClass.timeSlots[0]!

    const response = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/${wheelClass.slug}/book`,
      {
        data: {
          guest_name: 'Playwright E2E Guest',
          guest_email: `test-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: futureDate,
          time_slot: firstSlot,
          notes: 'Playwright E2E test — safe to ignore',
        },
      },
    )

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.booking_id).toEqual(expect.any(String))
    expect(body.message).toContain(wheelClass.title)
    expect(body.message).toContain(futureDate)
  })

  // Booking API: rejects past dates
  test('booking API rejects past dates', async ({ request }) => {
    const response = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/${wheelClass.slug}/book`,
      {
        data: {
          guest_name: 'Playwright E2E Guest',
          guest_email: `test-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: '2020-01-01',
          time_slot: wheelClass.timeSlots[0],
        },
      },
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/future/)
  })

  // Booking API: rejects invalid time slots
  test('booking API rejects invalid time slots', async ({ request }) => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const response = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/${wheelClass.slug}/book`,
      {
        data: {
          guest_name: 'Playwright E2E Guest',
          guest_email: `test-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: futureDate,
          time_slot: '03:00',
        },
      },
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/time slot/i)
  })
})
