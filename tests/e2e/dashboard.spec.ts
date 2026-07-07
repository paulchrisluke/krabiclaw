import { expect, test } from '@playwright/test'
import { collectPageErrors, setupTenantHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'
import { ensureSite } from './helpers/ensure-site'

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
    const userId = `e2e-dashboard-org-pages-${Date.now()}`
    const login = await page.goto(devLoginUrl(baseURL!, userId), { waitUntil: 'load' })
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
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'load' })
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

  test('owner can update content directly via dashboard API', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const siteId = context?.site?.id as string | undefined
    const hasSite = Boolean(siteId)

    const uniqueTitle = `Dashboard E2E ${Date.now()}`

    if (!hasSite) {
      const saveRes = await request.post(`${baseURL}/api/dashboard/editor/content/save`, {
        data: {
          page: 'home',
          changes: {
            'hero.title': uniqueTitle,
          },
        },
      })
      expect(saveRes.status()).toBe(400)
      const saveBody = await saveRes.json()
      expect(String(saveBody.error || '')).toContain('Site workspace has not been created yet')
      return
    }

    const saveRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/save`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': uniqueTitle,
        },
      },
    })
    expect(saveRes.status()).toBe(200)
    const saveBody = await saveRes.json()
    expect(saveBody.success).toBe(true)

    const contentRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(contentRes.status()).toBe(200)
    const contentBody = await contentRes.json() as { fields: Array<{ field: string; hero_title?: string }> }
    const hero = contentBody.fields.find((entry) => entry.field === 'hero')
    expect(hero?.hero_title).toBe(uniqueTitle)

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`)
    expect(eventsRes.status()).toBe(200)
    const eventsBody = await eventsRes.json() as {
      events: Array<{ event_type: string; entity_type: string | null; metadata: Record<string, unknown> | null }>
    }
    expect(
      eventsBody.events.some((entry) =>
        entry.event_type === 'content.updated'
        && entry.entity_type === 'site_content'
        && entry.metadata?.page === 'home'
      ),
    ).toBe(true)
  })

  test('public contact submission writes a server-owned site event', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    // A fresh dedicated user rather than the shared default dev-login user:
    // /api/dashboard/context only auto-selects a site when the org has exactly
    // one (see resolveSingleOrgSite), and the default user's org can end up with
    // zero or several sites depending on what else ran earlier in the suite.
    // Creating our own site keeps this deterministic.
    const suffix = Date.now()
    const login = await request.get(devLoginUrl(baseURL!, `e2e-dashboard-contact-event-${suffix}`), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const subject = 'general'

    const contactRes = await request.post(`${baseURL}/api/public/sites/${siteId}/contact`, {
      data: {
        name: 'Playwright Analytics Contact',
        email: `analytics-contact-${Date.now()}@example.test`,
        subject,
        message: 'Analytics reset contact coverage from Playwright.',
      },
    })
    expect(contactRes.status()).toBe(201)

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`)
    expect(eventsRes.status()).toBe(200)
    const eventsBody = await eventsRes.json() as {
      events: Array<{ event_type: string; entity_type: string | null; metadata: Record<string, unknown> | null }>
    }
    expect(
      eventsBody.events.some((entry) =>
        entry.event_type === 'contact.created'
        && entry.entity_type === 'contact_submission'
        && entry.metadata?.subject === subject
        && !('guest_email' in (entry.metadata ?? {}))
      ),
    ).toBe(true)
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
      const error = String(body.error || '')
      // MANAGED_SERVICE_ENABLED is off by default at launch, which now blocks
      // work-request submission before the per-plan entitlement check even runs.
      expect(
        error.includes('Work requests require') || error.includes('Managed service is not currently available'),
      ).toBe(true)
      return
    }

    expect(postRes.status()).toBe(201)
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
