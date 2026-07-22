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
      ['/dashboard/pottery-house-krabi/sites/pottery-house/locations/krabi', 'Location Overview'],
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
})
