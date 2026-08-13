import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { dashboardOrgHeaders } from './test-env'

const POTTERY_E2E_OWNER_ID = 'user-e2e-pottery-owner'

test.describe('dashboard API smoke', () => {
  test('dashboard APIs work after credential login', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!)

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

  test('owner can update a canonical tenant page directly via dashboard API', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const orgHeaders = dashboardOrgHeaders(context.organization.slug)
    const siteId = context?.site?.id as string | undefined
    const hasSite = Boolean(siteId)

    if (!hasSite) return

    const pagesRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages`)
    expect(pagesRes.status()).toBe(200)
    const pagesBody = await pagesRes.json() as { pages: Array<{ id: string; path: string }> }
    const home = pagesBody.pages.find((entry) => entry.path === '/')
    expect(home).toBeTruthy()
    const detailRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    expect(detailRes.status()).toBe(200)
    const detailBody = await detailRes.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const uniqueTitle = `Dashboard E2E ${Date.now()}`
    const originalBlocks = detailBody.page.blocks
    const blocks = originalBlocks.map((block) => block.type === 'hero'
      ? { ...block, data: { ...block.data, title: uniqueTitle } }
      : block)
    const saveRes = await request.patch(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`, {
      data: { blocks, expectedDocumentUpdatedAt: detailBody.page.document.updated_at },
    })
    expect(saveRes.status()).toBe(200)
    const saved = await saveRes.json()
    expect(saved.page.blocks.find((entry: { type: string }) => entry.type === 'hero').data.title).toBe(uniqueTitle)

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`, { headers: orgHeaders })
    expect(eventsRes.status()).toBe(200)
    const eventsBody = await eventsRes.json() as {
      events: Array<{ event_type: string; entity_type: string | null; metadata: Record<string, unknown> | null }>
    }
    expect(
      eventsBody.events.some((entry) =>
        entry.event_type === 'content.updated'
        && entry.entity_type === 'tenant_page'
        && entry.metadata?.page === 'home'
      ),
    ).toBe(true)

    const restore = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    const restoreBody = await restore.json() as { page: { document: { updated_at: string }; blocks: Array<Record<string, unknown>> } }
    await request.patch(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`, {
      data: { blocks: originalBlocks, expectedDocumentUpdatedAt: restoreBody.page.document.updated_at },
    })
  })

  test('location id dashboard API ignores stale dashboard headers and checks the location owner org', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, POTTERY_E2E_OWNER_ID)

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
