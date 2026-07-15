import { expect, test } from '@playwright/test'
import { setupTenantHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

test.describe('pottery house dashboard', () => {
  test('workspace routes are healthy for owner, otherwise site access is denied', async ({ page, request, baseURL }) => {
    test.setTimeout(90_000)

    await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)

    // Keep API setup and assertions on Playwright's dedicated request context.
    // page.request has repeatedly stalled after the browser dev-login redirect
    // on deployed preview Workers, while the same request-fixture flow is stable.
    const apiLogin = await request.get(devLoginUrl(baseURL!), {
      headers: devLoginHeaders(),
    })
    expect(apiLogin.status()).toBeLessThan(400)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      organization?: { slug?: string | null }
      site?: { id?: string | null }
    }

    const orgSlug = context.organization?.slug
    const siteId = context.site?.id

    // If current dev session is the Pottery House owner workspace, verify core dashboard pages.
    if (siteId === 'site-pottery-house' && orgSlug) {
      for (const route of [
        `/dashboard/${orgSlug}`,
        `/dashboard/${orgSlug}/support`,
        `/dashboard/${orgSlug}/~/settings/general`,
        `/dashboard/${orgSlug}/~/settings/billing`,
      ]) {
        const res = await page.goto(`${baseURL}${route}`, { waitUntil: 'load' })
        expect(res?.status()).toBeLessThan(400)
        await expect(page.locator('body')).not.toContainText('Site Not Found')
        await expect(page.locator('body')).not.toContainText('Vite Error')
      }
      return
    }

    // Otherwise, assert tenant isolation: this logged-in user cannot write to Pottery House directly.
    const deniedLogin = await request.get(devLoginUrl(baseURL!, `deny-${Date.now()}`), {
      headers: devLoginHeaders() || {},
      maxRedirects: 0,
    })
    expect(deniedLogin.status()).toBe(302)

    const saveRes = await request.post(`${baseURL}/api/editor/sites/site-pottery-house/content/save`, {
      data: {
        page: 'home',
        changes: { 'hero.title': `Unauthorized test ${Date.now()}` },
      },
    })
    expect([401, 403, 404]).toContain(saveRes.status())
  })
})
