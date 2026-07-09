import { expect, test } from '@playwright/test'
import { collectPageErrors, setupTenantHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

test.describe('dashboard functional smoke', () => {
  test('dev login opens the owner dashboard', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

    const dashboard = await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' })
    expect(dashboard?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

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
      `/dashboard/${orgSlug}/~/settings/general`,
      `/dashboard/${orgSlug}/~/settings/billing`,
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
})
