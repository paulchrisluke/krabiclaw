import { expect, test } from '@playwright/test'
import { loginAsPage } from './helpers/auth'
import { dashboardSiteHeaders } from './test-env'

test.describe('pottery house dashboard', () => {
  test('workspace routes are healthy for its owner and denied to an outsider', async ({ page, baseURL }) => {
    test.setTimeout(90_000)

    await loginAsPage(page, baseURL!, 'user-e2e-pottery-owner')
    const contextRes = await page.request.get(`${baseURL}/api/dashboard/context`, {
      headers: dashboardSiteHeaders('pottery-house-krabi', 'pottery-house'),
    })
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      organization?: { slug?: string | null }
      site?: { id?: string | null }
    }

    const orgSlug = context.organization?.slug
    const siteId = context.site?.id

    expect(siteId).toBe('site-pottery-house')
    expect(orgSlug).toBe('pottery-house-krabi')
    for (const route of [
      `/dashboard/${orgSlug}`,
      `/dashboard/${orgSlug}/support`,
      `/dashboard/${orgSlug}/settings/general`,
      `/dashboard/${orgSlug}/settings/billing`,
    ]) {
      const res = await page.goto(`${baseURL}${route}`, { waitUntil: 'load' })
      expect(res?.status()).toBeLessThan(400)
      await expect(page.locator('body')).not.toContainText('Site Not Found')
      await expect(page.locator('body')).not.toContainText('Vite Error')
    }

    await page.context().clearCookies()
    await loginAsPage(page, baseURL!, 'user-e2e-dashboard-outsider')
    const pagesRes = await page.request.get(`${baseURL}/api/editor/sites/site-pottery-house/pages`)
    expect([401, 403, 404]).toContain(pagesRes.status())
  })
})
