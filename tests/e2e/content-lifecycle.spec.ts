import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'

const DEMO_USER_ID = 'user-demo'
const FIRST_USER_ID = 'user-demo-growth'

test.describe('content write lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('content writes are scoped to the requested site', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!, FIRST_USER_ID)
    const firstSiteId = await ensureSite(request, baseURL!, null)
    const firstField = 'hero.title'
    const firstValue = `pottery-${Date.now()}`
    const firstSave = await request.post(`${baseURL}/api/editor/sites/${firstSiteId}/content/save`, {
      data: { page: 'home', changes: { [firstField]: firstValue } },
    })
    expect(firstSave.status()).toBe(200)

    await loginAs(request, baseURL!, DEMO_USER_ID)
    const demoSiteId = await ensureSite(request, baseURL!, null)
    const demoField = 'hero.title'
    const demoValue = `demo-${Date.now()}`
    const demoSave = await request.post(`${baseURL}/api/editor/sites/${demoSiteId}/content/save`, {
      data: { page: 'home', changes: { [demoField]: demoValue } },
    })
    expect(demoSave.status()).toBe(200)

    await loginAs(request, baseURL!, FIRST_USER_ID)
    const firstRead = await request.get(`${baseURL}/api/editor/sites/${firstSiteId}/content/home`)
    expect(firstRead.status()).toBe(200)
    const firstBody = await firstRead.json() as { fields?: Array<{ field: string; hero_title?: string; value?: string; content?: string }> }
    expect(firstBody.fields?.find((row) => row.field === 'hero')?.hero_title).toBe(firstValue)
    expect(firstBody.fields?.find((row) => row.field === 'hero')?.hero_title).not.toBe(demoValue)
  })

  test('delete-field removes canonical content', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { site?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const field = 'story.body'
    const value = `delete-field sentinel ${Date.now()}`

    const saveRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/save`, {
      data: { page: 'home', changes: { [field]: value } },
    })
    expect(saveRes.status()).toBe(200)

    const beforeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as { fields: Array<{ field: string; value?: string; content?: string }> }
    expect(beforeBody.fields.find((row) => row.field === field)?.value ?? beforeBody.fields.find((row) => row.field === field)?.content).toBe(value)

    const deleteRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/delete-field`, {
      data: { page: 'home', field },
    })
    expect(deleteRes.status()).toBe(200)

    const afterRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(afterRes.status()).toBe(200)
    const afterBody = await afterRes.json() as { fields: Array<{ field: string }> }
    expect(afterBody.fields.some((row) => row.field === field)).toBe(false)
  })

  test('reservation policies are readable and writable through canonical content', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { site?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const policyValue = `E2E reservation policy ${Date.now()}`
    const saveRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/save`, {
      data: {
        page: 'reservations',
        changes: { 'policies.body': policyValue },
      },
    })
    expect(saveRes.status()).toBe(200)

    const getRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/reservations`)
    expect(getRes.status()).toBe(200)
    const getBody = await getRes.json() as {
      success: boolean
      fields: Array<{ field: string; content?: string; value?: string }>
    }
    expect(getBody.success).toBe(true)
    const policyRow = getBody.fields.find((row) => row.field === 'policies.body')
    expect(policyRow).toBeDefined()
    expect(policyRow?.content ?? policyRow?.value).toBe(policyValue)
  })
})
