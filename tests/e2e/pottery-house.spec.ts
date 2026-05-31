import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, potteryHouseBaseURL } from './helpers'

const siteId = 'site-pottery-house'

// All public routes for the Pottery House experience-vertical site
const routes = [
  { path: '/', title: /Pottery House Krabi/, text: 'Pottery House Krabi' },
  { path: '/experiences', title: /Experiences \| Pottery House Krabi/, text: 'Pottery Wheel Class' },
  {
    path: '/experiences/pottery-wheel-class',
    title: /Pottery Wheel Class Krabi — Pottery House/,
    text: 'Shape something beautiful',
  },
  {
    path: '/experiences/cocktails-and-clay',
    title: /Cocktails & Clay Friday Night — Pottery House Krabi/,
    text: 'Friday night',
  },
  {
    path: '/experiences/beachfront-pottery',
    title: /Beachfront Pottery Class Klong Muang Krabi — Pottery House/,
    text: 'Klong Muang',
  },
  {
    path: '/experiences/monthly-membership',
    title: /Monthly Pottery Studio Membership Krabi — Pottery House/,
    text: 'creative base',
  },
  { path: '/about', title: /Pottery House/, text: 'Pottery House' },
  { path: '/contact', title: /Contact/, text: '+66626505890' },
]

test.describe('pottery house public site', () => {
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
      `${potteryHouseBaseURL}/experiences/pottery-wheel-class`,
      { waitUntil: 'load' },
    )

    expect(response?.status()).toBeLessThan(400)
    await page.waitForLoadState('load')

    // Index title must not appear — proves detail route rendered
    await expect(page).not.toHaveTitle(/^Experiences \| Pottery House Krabi$/)
    await expect(page).toHaveTitle(/Pottery Wheel Class/)

    // Breadcrumb shows the experience name (detail rendered the breadcrumb, index does not).
    // Use last() — breadcrumb is always the last nav on the page (primary nav comes first in DOM).
    await expect(page.locator('nav').last()).toContainText('Pottery Wheel Class')

    // Tagline is detail-page-only content
    await expect(page.locator('body')).toContainText('Shape something beautiful')

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
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const response = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/pottery-wheel-class/book`,
      {
        data: {
          guest_name: 'Playwright E2E Guest',
          guest_email: `test-${Date.now()}@playwright.example`,
          party_size: 2,
          booking_date: futureDate,
          time_slot: '10:00',
          notes: 'Playwright E2E test — safe to ignore',
        },
      },
    )

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.booking_id).toEqual(expect.any(String))
    expect(body.message).toContain('Pottery Wheel Class')
    expect(body.message).toContain(futureDate)
  })

  // Booking API: rejects past dates
  test('booking API rejects past dates', async ({ request }) => {
    const response = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/pottery-wheel-class/book`,
      {
        data: {
          guest_name: 'Playwright E2E Guest',
          guest_email: `test-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: '2020-01-01',
          time_slot: '10:00',
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
      `${potteryHouseBaseURL}/api/public/sites/${siteId}/experiences/pottery-wheel-class/book`,
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
