import { expect, test } from '@playwright/test'
import { collectPageErrors } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

function extractOrgSlug(url: string) {
  const pathname = new URL(url).pathname
  const match = pathname.match(/^\/dashboard\/([^/]+)/)
  if (!match) return null
  const slug = decodeURIComponent(match[1] ?? '')
  return slug && slug !== '~' ? slug : null
}

test.describe('dashboard functional smoke', () => {
  test('dev login opens the owner dashboard', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await page.context().setExtraHTTPHeaders(devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'networkidle' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

    const dashboard = await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    expect(dashboard?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

    expect(errors).toEqual([])
  })

  test('owner can open core dashboard pages for their org', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)
    await page.context().setExtraHTTPHeaders(devLoginHeaders() || {})
    const login = await page.goto(devLoginUrl(baseURL!), { waitUntil: 'networkidle' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)

    const orgSlug = extractOrgSlug(page.url())
    expect(orgSlug).toBeTruthy()

    const pages = [
      `/dashboard/${orgSlug}/~/settings/general`,
      `/dashboard/${orgSlug}/~/settings/billing`,
      `/dashboard/${orgSlug}/support`,
    ]

    for (const route of pages) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator('body')).not.toContainText('Site Not Found')
      await expect(page.locator('body')).not.toContainText('Vite Error')
      await expect(page.locator('body')).not.toContainText('wrong link sando')
    }

    const nonHydrationErrors = errors.filter((err) => !err.includes('Hydration completed but contains mismatches.'))
    expect(nonHydrationErrors).toEqual([])
  })

  test('dashboard APIs work after dev login', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextResponse = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextResponse.status()).toBe(200)
    const contextBody = await contextResponse.json()
    expect(contextBody.organization?.id).toEqual(expect.any(String))

    const requestsResponse = await request.get(`${baseURL}/api/dashboard/work-requests`)
    expect(requestsResponse.status()).toBe(200)
    const requestsBody = await requestsResponse.json()
    expect(Array.isArray(requestsBody.requests)).toBe(true)
  })

  test('owner can draft and publish content via dashboard API', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const hasRestaurant = Boolean(context?.restaurant?.id)

    const uniqueTitle = `Dashboard E2E ${Date.now()}`

    const draftRes = await request.post(`${baseURL}/api/dashboard/editor/content/draft`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': uniqueTitle,
        },
      },
    })
    if (!hasRestaurant) {
      expect(draftRes.status()).toBe(400)
      const draftBody = await draftRes.json()
      expect(String(draftBody.error || '')).toContain('Restaurant workspace has not been created yet')
      return
    }

    expect(draftRes.status()).toBe(200)
    const draftBody = await draftRes.json()
    expect(draftBody.success).toBe(true)

    const publishRes = await request.post(`${baseURL}/api/dashboard/editor/content/publish`, {
      data: { page: 'home' },
    })
    expect(publishRes.status()).toBe(200)
    const publishBody = await publishRes.json()
    expect(publishBody.success).toBe(true)
    expect(publishBody.page).toBe('home')
  })

  test('support work-request submission is enforced by plan entitlement', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const title = `E2E Work Request ${Date.now()}`
    const postRes = await request.post(`${baseURL}/api/dashboard/work-requests`, {
      data: {
        type: 'content_update',
        title,
        description: 'Playwright managed-service workflow test',
        priority: 'normal',
      },
    })

    if (postRes.status() === 403) {
      const body = await postRes.json()
      expect(String(body.error || '')).toContain('Work requests require')
      return
    }

    expect(postRes.status()).toBe(200)
    const body = await postRes.json()
    expect(body.success).toBe(true)
    expect(body.id).toEqual(expect.any(String))

    const listRes = await request.get(`${baseURL}/api/dashboard/work-requests`)
    expect(listRes.status()).toBe(200)
    const listBody = await listRes.json()
    expect(Array.isArray(listBody.requests)).toBe(true)
    expect(listBody.requests.some((row: { title: string }) => row.title === title)).toBe(true)
  })
})
