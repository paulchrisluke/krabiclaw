import { expect, test } from '@playwright/test'
import { collectPageErrors, expectHealthyPage, potteryHouseBaseURL, potteryHouseExtraHeaders, setupTenantHeaders } from './helpers'
import { potteryHouseFixture } from '../../seed-definitions/pottery-house'

const siteId = potteryHouseFixture.siteId
const wheelClass = potteryHouseFixture.experiences.find((e) => e.slug === 'pottery-wheel-class')!
const monthlyMembership = potteryHouseFixture.experiences.find((e) => e.slug === 'monthly-membership')!

const routes = [
  { path: '/', title: /Pottery House Krabi/, text: potteryHouseFixture.site.brandName },
  ...potteryHouseFixture.publicRoutes,
  { path: '/about', title: /Pottery House/, text: 'Pottery House' },
  // Location phone numbers on this page can be refreshed by a live Google Business
  // sync and drift from the static seed fixture, so assert on stable page copy
  // instead of a phone number that isn't guaranteed to match what was seeded.
  { path: '/contact', title: /Contact/, text: 'Get in touch' },
]

test.describe('pottery house public site', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, potteryHouseBaseURL, potteryHouseExtraHeaders)
  })

  test('homepage hydrates cleanly with a persisted dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      window.localStorage.setItem('krabiclaw-theme', 'dark')
    })

    const errors = collectPageErrors(page)
    const response = await page.goto(`${potteryHouseBaseURL}/`, {
      waitUntil: 'load',
    })

    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('[data-public-critical-shell]')).toBeVisible()
    await expect(page.locator('body')).toContainText('Clay, calm, and a place to return to.')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true)
    await expectHealthyPage(page, errors)
  })

  for (const route of routes) {
    test(`${route.path} renders without runtime errors`, async ({ page }) => {
      const errors = collectPageErrors(page)
      const response = await page.goto(`${potteryHouseBaseURL}${route.path}`, { waitUntil: 'domcontentloaded' })

      expect(response?.status()).toBeLessThan(400)
      await page.waitForFunction(() => document.body && document.body.textContent !== null)

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
      { waitUntil: 'domcontentloaded' },
    )

    expect(response?.status()).toBeLessThan(400)

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

  test('experience detail exposes one canonical CTA per viewport and preserves inquiry context', async ({ page }) => {
    const errors = collectPageErrors(page)
    const expectedContactHref = `/contact?experienceId=${monthlyMembership.id}&experienceTitle=${encodeURIComponent(monthlyMembership.title).replaceAll('%20', '+')}`
    await page.context().addCookies([{
      name: 'kc_consent',
      value: 'accepted',
      domain: new URL(potteryHouseBaseURL).hostname,
      path: '/',
    }])

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${potteryHouseBaseURL}/experiences/${monthlyMembership.slug}`, { waitUntil: 'domcontentloaded' })

    const desktopInquiryCta = page.locator('[data-experience-cta="desktop"]')
    await expect(desktopInquiryCta).toBeVisible()
    await expect(desktopInquiryCta.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', expectedContactHref)
    await expect(page.locator('[data-experience-cta]:visible')).toHaveCount(1)

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileInquiryCta = page.locator('[data-experience-cta="mobile"]')
    await expect(mobileInquiryCta).toBeVisible()
    await expect(mobileInquiryCta.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', expectedContactHref)
    await expect(page.locator('[data-experience-cta]:visible')).toHaveCount(1)

    await page.goto(`${potteryHouseBaseURL}/experiences/${wheelClass.slug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    const mobileBookableCta = page.locator('[data-experience-cta="mobile"]')
    await expect(mobileBookableCta.getByRole('button', { name: 'Book a class' })).toBeVisible()
    await expect(page.locator('[data-experience-cta]:visible')).toHaveCount(1)
    await mobileBookableCta.getByRole('button', { name: 'Book a class' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Select a time')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.locator('[data-experience-cta="desktop"]').getByRole('button', { name: 'Book a class' })).toBeVisible()
    await expect(page.locator('[data-experience-cta]:visible')).toHaveCount(1)

    await expectHealthyPage(page, errors)
  })

  // Regression: client-side logo navigation from /experiences must load the homepage
  // without retaining the old route or surfacing a shell error.
  test('mobile header logo returns to the homepage', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const errors = collectPageErrors(page)
    await page.goto(`${potteryHouseBaseURL}/experiences`, { waitUntil: 'domcontentloaded' })

    const banner = page.getByRole('banner')
    await expect(banner).toHaveCount(1)
    const logo = banner.getByRole('link', { name: 'Pottery House Krabi', exact: true })
    await expect(logo).toHaveCount(1)
    await expect(logo).toHaveAttribute('href', '/')

    await logo.click()
    await expect(page).toHaveURL(`${potteryHouseBaseURL}/`)
    await expect(page).toHaveTitle(/Pottery House Krabi/)
    await expect(page.locator('body')).toContainText('Clay, calm, and a place to return to.')
    await expectHealthyPage(page, errors)
  })

  // Regression: no restaurant-vertical copy must appear on an experience site.
  // These strings come from the restaurant branch of getVerticalCopy().
  test('site does not render restaurant-vertical copy', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${potteryHouseBaseURL}/`, { waitUntil: 'domcontentloaded' })

    for (const forbidden of ['Come dine with us', 'Reserve a table', 'From the kitchen', 'Reserve a Table', 'Make a Reservation']) {
      await expect(page.locator('body')).not.toContainText(forbidden)
    }

    await expectHealthyPage(page, errors)
  })

  // Regression: no Saya demo data or fallback copy must leak through.
  test('site does not leak Saya demo fallback copy', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto(`${potteryHouseBaseURL}/`, { waitUntil: 'domcontentloaded' })

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
