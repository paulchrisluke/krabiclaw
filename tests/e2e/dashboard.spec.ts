import { expect, test } from '@playwright/test'
import { collectPageErrors, setupTenantHeaders } from './helpers'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

test.describe('dashboard functional smoke', () => {
  test('dev login opens the owner dashboard', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    // Neither "Overview" nor "Create your restaurant workspace" exist in the
    // current UI (confirmed via full-repo grep) — stale text from before the
    // dashboard Nuxt UI consolidation (#337). The "any suitable E2E test
    // user" fallback (server/api/dev/login.get.ts) deterministically prefers
    // a user who already has a site (ORDER BY has_site DESC), so this test
    // in practice always lands on pages/dashboard/[orgSlug]/index.vue, whose
    // real heading is "Sites" (never "Overview" — that string only exists as
    // an internal, never-rendered UDashboardPanel id). The onboarding
    // alternative kept for a genuinely site-less user matches the real
    // OnboardingWizard.vue welcome kicker instead of the old placeholder text.
    await expect(page.locator('body')).toContainText(/Sites|Let's build your site/)

    const dashboard = await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
    expect(dashboard?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/Sites|Let's build your site/)

    expect(errors).toEqual([])
  })

  test('owner can open core dashboard pages for their org', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const suffix = Date.now()
    const userId = `e2e-dashboard-org-pages-${suffix}`
    const login = await page.goto(devLoginUrl(baseURL!, userId), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)

    // Signup no longer auto-creates an org (see server/utils/auth.ts), so a
    // brand-new user lands on /dashboard/onboarding, not their own org's
    // dashboard. Create a real site/org on demand — the same on-demand path
    // any first-time owner actually goes through — before exercising the
    // org-scoped settings/billing/support pages below.
    const createSiteRes = await page.request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Dashboard Pages Test ${suffix}`,
        subdomain: `e2e-dashboard-pages-${suffix}`,
        vertical: 'restaurant',
      },
    })
    expect(createSiteRes.status()).toBe(200)

    // /dashboard itself never redirects to /dashboard/{orgSlug} (it's a real
    // page, not a redirect) — get the slug from the API instead of the URL.
    const contextRes = await page.request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { organization?: { slug?: string } }
    const orgSlug = context.organization?.slug
    expect(orgSlug).toBeTruthy()

    const pages = [
      `/dashboard/${orgSlug}/settings/general`,
      `/dashboard/${orgSlug}/settings/billing`,
      `/dashboard/${orgSlug}/support`,
    ]

    for (const route of pages) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'load' })
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('body')).not.toContainText('Site Not Found')
      await expect(page.locator('body')).not.toContainText('Vite Error')
      await expect(page.locator('body')).not.toContainText('wrong link sando')
    }

    const nonHydrationErrors = errors.filter((err) => !err.includes('Hydration completed but contains mismatches.'))
    expect(nonHydrationErrors).toEqual([])
  })

  test('canonical account, organization, site, and location routes render with responsive navigation', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)

    const routes = [
      ['/dashboard/account/profile', 'Profile'],
      ['/dashboard/pottery-house-krabi', 'Sites'],
      ['/dashboard/pottery-house-krabi/settings', 'Organization Settings'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house', 'Pottery House Krabi'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations', 'Locations'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/settings', 'Site Settings'],
      // The navbar falls back to the literal 'Location Overview' only when the
      // location hasn't loaded yet (see locations/[locationSlug]/index.vue) —
      // the Krabi fixture location always has a real title, so it renders
      // that instead; asserting the fallback string here never matched.
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi', 'Pottery House Krabi'],
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/settings', 'Location Settings'],
    ] as const

    for (const [path, visibleText] of routes) {
      const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'load' })
      expect(response?.status(), path).toBeLessThan(400)
      await expect(page.getByText(visibleText, { exact: true }).first()).toBeVisible()
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house`, { waitUntil: 'load' })
    await expect(page.locator('[data-sidebar-control-ready="true"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /Search dashboard, docs, help/i })).toBeVisible()
    await page.getByRole('button', { name: /Search dashboard, docs, help/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('dashboard-account-menu-button').click()
    await expect(page.getByText('Account settings', { exact: true })).toBeVisible()
    await expect(page.getByText('Platform Status', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('[data-sidebar-control-ready]')).toHaveAttribute('data-sidebar-control-ready', 'true')
    await page.getByRole('button', { name: 'Open sidebar' }).first().click()
    await expect(page.getByRole('link', { name: 'Locations', exact: true })).toBeVisible()

    expect((await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/new`)).status()).toBe(404)
    expect((await page.request.patch(`${baseURL}/api/dashboard/location-preference`, {
      headers: {
        ...dashboardOrgHeaders('pottery-house-krabi'),
        'x-dashboard-site-slug': 'pottery-house',
      },
      data: { locationId: 'loc-pottery-house' },
    })).status()).toBe(404)
  })

  test('site-wide manager reaches its site workspace but not organization settings', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    const memberResponse = await page.request.post(`${baseURL}/api/dev/test-member`, {
      headers: devLoginHeaders(),
      data: { role: 'editor', organizationId: 'org-pottery-house', name: 'E2E Site Manager' },
    })
    expect(memberResponse.status()).toBe(200)
    const member = await memberResponse.json() as { user: { id: string } }

    await page.goto(devLoginUrl(baseURL!, member.user.id), { waitUntil: 'load' })
    const siteSettings = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/settings`, { waitUntil: 'load' })
    expect(siteSettings?.status()).toBeLessThan(400)
    await expect(page.getByText('Site Settings', { exact: true }).first()).toBeVisible()

    const organizationSettings = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/settings`, { waitUntil: 'load' })
    expect(organizationSettings?.status()).toBe(404)
  })

  test('capability-gated manager routes 404 when the vertical does not expose them, and resolve when it does', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    // Pottery House is an experience/saya site, not a restaurant (config/cms-registry.ts
    // verticalDefaultFeatures — verified against the live seed via `yarn seed:pottery-local`,
    // not assumed from the fixture name). Its default feature set has 'experiences'
    // ('location.experiences') but not 'menu' — that's restaurant-only — and 'site.services' has
    // no catalog entry in the saya template at all regardless of vertical.
    // toBeLessThan(400) alone would also pass on a 3xx redirect to some unrelated page (e.g. a
    // stale auth bounce to /login) — assert the exact success status AND that the final URL (after
    // following any redirect) is still the requested path, so a redirect can't silently satisfy this.
    // This test intentionally asserts manager behavior rather than mutable client-authored records.
    const experiences = await page.goto(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/experiences`, { waitUntil: 'load' })
    expect(experiences?.status(), 'location.experiences should resolve for an experience-vertical site').toBe(200)
    expect(new URL(page.url()).pathname).toBe('/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/experiences')
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add experience' }).first()).toBeVisible()

    const services = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/professional-services`)
    expect(services.status(), 'site.services has no catalog entry for saya and must 404, never redirect or render').toBe(404)

    const locationMenu = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/menu`)
    expect(locationMenu.status(), 'location.menu is restaurant-only and off by default for the experience vertical').toBe(404)

    const testimonials = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/testimonials`)
    expect(testimonials.status(), 'owner-entered testimonials are the site reputation manager').toBe(200)

    const oldSiteReviews = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/reviews`)
    expect(oldSiteReviews.status(), 'site-level reviews route was renamed to testimonials and must not redirect').toBe(404)

    const siteMedia = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/media`)
    expect(siteMedia.status(), 'media library is site-managed').toBe(200)

    const locationMedia = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/media`)
    expect(locationMedia.status(), 'location media was removed because it exposed the site library').toBe(404)

    const locationPhotos = await page.request.get(`${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi/photos`)
    expect(locationPhotos.status(), 'location photos remain the location-specific gallery manager').toBe(200)
  })

  test('location experiences page distinguishes populated, empty, and failed list states', async ({ page, baseURL }) => {
    test.setTimeout(60_000)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    await page.goto(devLoginUrl(baseURL!, 'user-pottery-house'), { waitUntil: 'load' })

    // The experiences page fetches its list via a direct server-side call during
    // SSR (see loadDashboardLocationExperiences in dashboard-editor-resources.ts),
    // which never goes through the browser's network stack — page.route() cannot
    // intercept it on a page.goto/page.reload (hard) navigation. It only fetches
    // client-side (interceptable) when the component mounts via an in-app SPA
    // transition, so every mocked visit below arrives via a NuxtLink click from
    // the location overview page rather than a URL navigation. That click must
    // land after hydration completes — waitUntil: 'load' resolves as soon as the
    // document and its resources finish loading, which can race ahead of Vue
    // attaching NuxtLink's client-side router interception; a click before that
    // point falls through to the anchor's plain href and forces a hard reload
    // (bypassing the mock again). 'networkidle' waits out that gap reliably.
    const overviewUrl = `${baseURL}/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi`
    const experiencesLink = page.locator('[id^="dashboard-sidebar"]').getByRole('link', { name: 'Experiences' })

    // The route mock must be registered before the overview page loads, not
    // after — NuxtLink eagerly prefetches its target route's data as soon as
    // the link scrolls into view, so registering the mock after page.goto
    // would let that prefetch slip through with real data, which the later
    // click would then reuse from cache instead of hitting our mock.
    await page.route('**/api/editor/sites/site-pottery-house/experiences?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ experiences: [] }),
      })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await experiencesLink.click()
    await expect(page).toHaveURL(/\/experiences$/)
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add experience' }).first()).toBeVisible()
    await expect(page.getByText('No experiences yet')).toBeVisible()
    await page.unroute('**/api/editor/sites/site-pottery-house/experiences?**')

    // A fresh hard navigation back to the overview page discards the client-side
    // Nuxt payload cache, so the next click below performs a genuine new fetch
    // under the 500 mock rather than reusing the cached empty result above.
    await page.route('**/api/editor/sites/site-pottery-house/experiences?**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test failure' }),
      })
    })
    await page.goto(overviewUrl, { waitUntil: 'networkidle' })
    await experiencesLink.click()
    await expect(page).toHaveURL(/\/experiences$/)
    await expect(page.getByText('Experiences', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Could not load experiences')).toBeVisible()
    await expect(page.getByText('No experiences yet')).toBeHidden()
  })
})
