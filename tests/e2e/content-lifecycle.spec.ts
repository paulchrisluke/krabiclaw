import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'

const DEMO_USER_ID = 'user-demo'
const FIRST_USER_ID = 'user-demo-growth'
const TENANT_PAGE_WRITE_STATEMENT_BUDGET = 30

function expectWriteBudget(response: { headers(): Record<string, string> }, maxStatements = TENANT_PAGE_WRITE_STATEMENT_BUDGET) {
  const headers = response.headers()
  const statementCount = Number(headers['x-d1-query-count'])
  const batchCount = Number(headers['x-d1-batch-count'])
  expect(Number.isInteger(statementCount)).toBe(true)
  expect(Number.isInteger(batchCount)).toBe(true)
  expect(statementCount).toBeLessThanOrEqual(maxStatements)
  expect(batchCount).toBe(1)
}

test.describe('content write lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('canonical page writes are scoped to the requested site', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!, FIRST_USER_ID)
    const firstSiteId = await ensureSite(request, baseURL!, null)
    const firstPages = await request.get(`${baseURL}/api/editor/sites/${firstSiteId}/pages`)
    expect(firstPages.status()).toBe(200)
    const firstHome = ((await firstPages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(firstHome).toBeTruthy()
    const firstDetail = await request.get(`${baseURL}/api/editor/sites/${firstSiteId}/pages/${firstHome!.id}`)
    const firstBody = await firstDetail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const firstValue = `pottery-${Date.now()}`
    const firstBlocks = firstBody.page.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, title: firstValue } } : block)
    const firstSave = await request.patch(`${baseURL}/api/editor/sites/${firstSiteId}/pages/${firstHome!.id}`, {
      data: { blocks: firstBlocks, expectedDocumentUpdatedAt: firstBody.page.document.updated_at },
    })
    expectWriteBudget(firstSave)
    expect(firstSave.status()).toBe(200)

    await loginAs(request, baseURL!, DEMO_USER_ID)
    const demoSiteId = await ensureSite(request, baseURL!, null)
    const demoPages = await request.get(`${baseURL}/api/editor/sites/${demoSiteId}/pages`)
    expect(demoPages.status()).toBe(200)
    const demoHome = ((await demoPages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(demoHome).toBeTruthy()
    const demoDetail = await request.get(`${baseURL}/api/editor/sites/${demoSiteId}/pages/${demoHome!.id}`)
    const demoBody = await demoDetail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const demoValue = `demo-${Date.now()}`
    const demoBlocks = demoBody.page.blocks.map(block => block.type === 'hero' ? { ...block, data: { ...block.data, title: demoValue } } : block)
    const demoSave = await request.patch(`${baseURL}/api/editor/sites/${demoSiteId}/pages/${demoHome!.id}`, {
      data: { blocks: demoBlocks, expectedDocumentUpdatedAt: demoBody.page.document.updated_at },
    })
    expectWriteBudget(demoSave)
    expect(demoSave.status()).toBe(200)

    await loginAs(request, baseURL!, FIRST_USER_ID)
    const firstRead = await request.get(`${baseURL}/api/editor/sites/${firstSiteId}/pages/${firstHome!.id}`)
    expect(firstRead.status()).toBe(200)
    const firstReadBody = await firstRead.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }> } }
    expect(firstReadBody.page.blocks.find(block => block.type === 'hero')?.data.title).toBe(firstValue)
    expect(firstReadBody.page.blocks.find(block => block.type === 'hero')?.data.title).not.toBe(demoValue)
  })

  test('canonical block snapshots replace legacy field deletion', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { site?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const pagesRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages`)
    const home = ((await pagesRes.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(home).toBeTruthy()
    const detailRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    const detail = await detailRes.json() as { page: { blocks: Array<{ id: string; type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const value = `canonical block sentinel ${Date.now()}`
    const addedBlock = { id: `e2e-${Date.now()}`, type: 'markdown', position: detail.page.blocks.length, data: { markdown: value } }
    const saveRes = await request.patch(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`, {
      data: { blocks: [...detail.page.blocks, addedBlock], expectedDocumentUpdatedAt: detail.page.document.updated_at },
    })
    expectWriteBudget(saveRes)
    expect(saveRes.status()).toBe(200)

    const beforeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as { page: { blocks: Array<{ id: string; data: Record<string, unknown> }> } }
    expect(beforeBody.page.blocks.find(block => block.id === addedBlock.id)?.data.markdown).toBe(value)

    const deleteRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/delete-field`, { data: { page: 'home', field: 'story.body' } })
    expect(deleteRes.status()).toBe(404)

    const afterDetail = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    const afterBody = await afterDetail.json() as { page: { blocks: Array<{ id: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const afterBlocks = afterBody.page.blocks.filter(block => block.id !== addedBlock.id)
    const afterRes = await request.patch(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`, {
      data: { blocks: afterBlocks, expectedDocumentUpdatedAt: afterBody.page.document.updated_at },
    })
    expectWriteBudget(afterRes)
    expect(afterRes.status()).toBe(200)
    const finalRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages/${home!.id}`)
    const finalBody = await finalRes.json() as { page: { blocks: Array<{ id: string }> } }
    expect(finalBody.page.blocks.some(block => block.id === addedBlock.id)).toBe(false)
  })

  test('reservation policies are readable and writable through canonical booking policy api', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!, null)
    const locationsRes = await request.get(`${baseURL}/api/sites/${siteId}/locations`)
    expect(locationsRes.status()).toBe(200)
    const locationsBody = await locationsRes.json() as { locations?: Array<{ id?: string }> }
    const locationId = locationsBody.locations?.[0]?.id
    expect(locationId).toEqual(expect.any(String))

    type ReservationPolicy = {
      free_cancellation_until_minutes: number | null
      late_arrival_grace_minutes: number | null
      deposit_required: boolean | null
      deposit_trigger_party_size: number | null
    }

    const siteScopeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/booking-policy?policy_type=reservation&scope_type=site`)
    expect(siteScopeRes.status()).toBe(400)

    const beforeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/booking-policy?policy_type=reservation&scope_type=location&location_id=${locationId}`)
    expect(beforeRes.status()).toBe(200)
    expect(((await beforeRes.json()) as { policy: ReservationPolicy | null }).policy).toBeNull()

    const saveRes = await request.patch(`${baseURL}/api/editor/sites/${siteId}/booking-policy`, {
      data: {
        policy_type: 'reservation',
        scope_type: 'location',
        location_id: locationId,
        free_cancellation_until_minutes: 180,
        late_arrival_grace_minutes: 20,
        deposit_required: true,
        deposit_trigger_party_size: 7,
      },
    })
    expect(saveRes.status()).toBe(200)

    const getRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/booking-policy?policy_type=reservation&scope_type=location&location_id=${locationId}`)
    expect(getRes.status()).toBe(200)
    const getBody = await getRes.json() as { success: boolean; resolved_policy: ReservationPolicy }
    expect(getBody.success).toBe(true)
    expect(getBody.resolved_policy.free_cancellation_until_minutes).toBe(180)
    expect(getBody.resolved_policy.late_arrival_grace_minutes).toBe(20)
    expect(getBody.resolved_policy.deposit_required).toBe(true)
    expect(getBody.resolved_policy.deposit_trigger_party_size).toBe(7)
  })
})
