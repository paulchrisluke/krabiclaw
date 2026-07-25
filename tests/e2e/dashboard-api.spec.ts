import { expect, test } from '@playwright/test'
import { dashboardOrgHeaders, devLoginHeaders, devLoginUrl } from './test-env'

test.describe('dashboard API smoke', () => {
  test('dashboard APIs work after dev login', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextResponse = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextResponse.status()).toBe(200)
    const contextBody = await contextResponse.json()
    expect(contextBody.organization?.id).toEqual(expect.any(String))
    const orgHeaders = dashboardOrgHeaders(contextBody.organization.slug)

    const requestsResponse = await request.get(`${baseURL}/api/dashboard/work-requests`, { headers: orgHeaders })
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
    const orgHeaders = dashboardOrgHeaders(context.organization.slug)
    const siteId = context?.site?.id as string | undefined
    const hasSite = Boolean(siteId)

    const uniqueTitle = `Dashboard E2E ${Date.now()}`

    if (!hasSite) return

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

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`, { headers: orgHeaders })
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

    const removedAlias = await request.post(`${baseURL}/api/dashboard/editor/content/save`, {
      headers: orgHeaders,
      data: {
        page: 'home',
        changes: { 'hero.title': uniqueTitle },
      },
    })
    expect(removedAlias.status()).toBe(404)
  })

  test('location id dashboard API ignores stale dashboard headers and checks the location owner org', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!, 'user-pottery-house'), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const noHeader = await request.get(`${baseURL}/api/dashboard/locations/loc-pottery-house`)
    expect(noHeader.status()).toBe(200)
    await expect(noHeader.json()).resolves.toMatchObject({
      success: true,
      location: {
        id: 'loc-pottery-house',
        site_id: 'site-pottery-house',
        organization_id: 'org-pottery-house',
      },
    })

    const staleHeader = await request.get(`${baseURL}/api/dashboard/locations/loc-pottery-house`, {
      headers: dashboardOrgHeaders('ember-slice-demo'),
    })
    expect(staleHeader.status()).toBe(200)
    await expect(staleHeader.json()).resolves.toMatchObject({
      success: true,
      location: {
        id: 'loc-pottery-house',
        organization_id: 'org-pottery-house',
      },
    })

    const otherOrg = await request.get(`${baseURL}/api/dashboard/locations/loc-demo`)
    expect(otherOrg.status()).toBe(404)
  })
})
