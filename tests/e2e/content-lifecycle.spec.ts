import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'

const POTTERY_HOUSE_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
const POTTERY_HOUSE_SITE_ID = 'site-pottery-house'
const DEMO_USER_ID = 'user-demo'
const DEMO_SITE_ID = 'site-demo'

test.describe('content write lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('content writes are scoped to the requested site', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const potteryField = `e2e-site-scope-${Date.now()}`
    const potteryValue = `pottery-${Date.now()}`
    const potterySave = await request.post(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/save`, {
      data: { page: 'home', changes: { [potteryField]: potteryValue } },
    })
    expect(potterySave.status()).toBe(200)

    await loginAs(request, baseURL!, DEMO_USER_ID)
    const demoField = `e2e-site-scope-demo-${Date.now()}`
    const demoSave = await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/save`, {
      data: { page: 'home', changes: { [demoField]: `demo-${Date.now()}` } },
    })
    expect(demoSave.status()).toBe(200)

    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const potteryRead = await request.get(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/home`)
    expect(potteryRead.status()).toBe(200)
    const potteryBody = await potteryRead.json() as { content: Array<{ field: string; value?: string }> }
    expect(potteryBody.content.find((row) => row.field === potteryField)?.value).toBe(potteryValue)
    expect(potteryBody.content.some((row) => row.field === demoField)).toBe(false)
  })

  test('delete-field removes canonical content', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { restaurant?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

    const field = `e2e-delete-field-${Date.now()}`
    const value = `delete-field sentinel ${Date.now()}`

    const saveRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/save`, {
      data: { page: 'home', changes: { [field]: value } },
    })
    expect(saveRes.status()).toBe(200)

    const beforeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as { content: Array<{ field: string; value?: string }> }
    expect(beforeBody.content.find((row) => row.field === field)?.value).toBe(value)

    const deleteRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/delete-field`, {
      data: { page: 'home', field },
    })
    expect(deleteRes.status()).toBe(200)

    const afterRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(afterRes.status()).toBe(200)
    const afterBody = await afterRes.json() as { content: Array<{ field: string }> }
    expect(afterBody.content.some((row) => row.field === field)).toBe(false)
  })

  test('reservation policies are readable and writable through canonical content', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { restaurant?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

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
      content: Array<{ field: string; content?: string; value?: string }>
    }
    expect(getBody.success).toBe(true)
    const policyRow = getBody.content.find((row) => row.field === 'policies.body')
    expect(policyRow).toBeDefined()
    expect(policyRow?.content ?? policyRow?.value).toBe(policyValue)
  })
})
