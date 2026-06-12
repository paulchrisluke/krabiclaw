import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'

// Two seeded users from different orgs used as the isolation pair.
// POTTERY_HOUSE: org-pottery-house / site-pottery-house
// DEMO: org-demo / site-demo  (role='admin' in user table but owner of org-demo;
//       excluded from default dev-login selection, always accessed by explicit userId)
const POTTERY_HOUSE_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
const POTTERY_HOUSE_SITE_ID = 'site-pottery-house'
const DEMO_USER_ID = 'user-demo'
const DEMO_SITE_ID = 'site-demo'

test.describe('content lifecycle regressions', () => {
  test.describe.configure({ mode: 'serial' })

  test('discard-all is scoped to the requesting org and cannot affect another org drafts', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    // Clean up both orgs' home drafts before the test to start deterministic
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })
    await loginAs(request, baseURL!, DEMO_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })

    // Pottery house (org A) creates a sentinel draft
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const isolationField = `e2e-discard-isolation-${Date.now()}`
    const isolationValue = `pottery-house-sentinel-${Date.now()}`
    const potteryDraftRes = await request.post(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/draft`,
      { data: { page: 'home', changes: { [isolationField]: isolationValue } } },
    )
    expect(potteryDraftRes.status()).toBe(200)

    // Demo org (org B) creates its own draft and then calls discard-all for ITS site only
    await loginAs(request, baseURL!, DEMO_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/draft`, {
      data: { page: 'home', changes: { 'e2e-discard-target': `demo draft ${Date.now()}` } },
    })
    const discardRes = await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/discard`, {
      data: { all: true },
    })
    expect(discardRes.status()).toBe(200)
    const discardBody = await discardRes.json() as { success: boolean; scope: string }
    expect(discardBody.success).toBe(true)
    expect(discardBody.scope).toBe('all')

    // Pottery house sentinel must still exist untouched
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const contentRes = await request.get(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/home`,
    )
    expect(contentRes.status()).toBe(200)
    const contentBody = await contentRes.json() as {
      content: Array<{ field: string; value?: string }>
    }
    const isolationRow = contentBody.content.find(c => c.field === isolationField)
    expect(isolationRow).toBeDefined()
    expect(isolationRow?.value).toBe(isolationValue)

    // Clean up
    await request.post(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })
  })

  test('publish-all is scoped to the requesting org and cannot affect another org drafts', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    // Clean up both orgs' home drafts
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })
    await loginAs(request, baseURL!, DEMO_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })

    // Pottery house (org A) creates a sentinel draft
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const isolationField = `e2e-publish-isolation-${Date.now()}`
    const isolationValue = `pottery-publish-sentinel-${Date.now()}`
    const potteryDraftRes = await request.post(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/draft`,
      { data: { page: 'home', changes: { [isolationField]: isolationValue } } },
    )
    expect(potteryDraftRes.status()).toBe(200)

    // Demo org (org B) creates its own draft and calls publish-all for ITS site
    await loginAs(request, baseURL!, DEMO_USER_ID)
    await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/draft`, {
      data: { page: 'home', changes: { 'e2e-publish-target': `demo draft ${Date.now()}` } },
    })
    const publishRes = await request.post(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/content/publish`, {
      data: { all: true },
    })
    expect(publishRes.status()).toBe(200)
    const publishBody = await publishRes.json() as { success: boolean; scope: string }
    expect(publishBody.success).toBe(true)
    expect(publishBody.scope).toBe('all')

    // Pottery house draft must still be pending (not affected by demo's publish-all)
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)
    const statusRes = await request.get(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/status`,
    )
    expect(statusRes.status()).toBe(200)
    const statusBody = await statusRes.json() as { hasDrafts: boolean }
    expect(statusBody.hasDrafts).toBe(true)

    // Clean up
    await request.post(`${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/content/discard`, {
      data: { page: 'home' },
    })
  })

  test('delete-field removes a field from both live content and drafts', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { restaurant?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

    const testField = `e2e-delete-field-${Date.now()}`
    const testValue = `delete-field sentinel ${Date.now()}`

    // Draft and publish the field so it exists in both live content and drafts tables
    const draftRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/draft`, {
      data: { page: 'home', changes: { [testField]: testValue } },
    })
    expect(draftRes.status()).toBe(200)

    const publishRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/publish`, {
      data: { page: 'home' },
    })
    expect(publishRes.status()).toBe(200)

    // Verify the field is in the merged content before deletion
    const beforeRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as { content: Array<{ field: string; value?: string }> }
    expect(beforeBody.content.some(c => c.field === testField)).toBe(true)

    // Delete the field
    const deleteRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/delete-field`, {
      data: { page: 'home', field: testField },
    })
    expect(deleteRes.status()).toBe(200)
    const deleteBody = await deleteRes.json() as { deleted: boolean; page: string; field: string }
    expect(deleteBody.deleted).toBe(true)
    expect(deleteBody.page).toBe('home')
    expect(deleteBody.field).toBe(testField)

    // Field must not appear in merged content after deletion
    const afterRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/home`)
    expect(afterRes.status()).toBe(200)
    const afterBody = await afterRes.json() as { content: Array<{ field: string }> }
    expect(afterBody.content.some(c => c.field === testField)).toBe(false)
  })

  test('reservation policies are readable and writable via the content system', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!)
    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as { restaurant?: { id?: string | null } }
    const siteId = await ensureSite(request, baseURL!, context.restaurant?.id ?? null)

    const policyValue = `E2E reservation policy ${Date.now()}`

    // Write via draft
    const draftRes = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/draft`, {
      data: {
        page: 'reservations',
        changes: { reservation_policies: policyValue },
      },
    })
    expect(draftRes.status()).toBe(200)

    // Read back — draft must be merged into the GET response
    const getRes = await request.get(`${baseURL}/api/editor/sites/${siteId}/content/reservations`)
    expect(getRes.status()).toBe(200)
    const getBody = await getRes.json() as {
      success: boolean
      content: Array<{ field: string; value?: string }>
      hasDrafts: boolean
    }
    expect(getBody.success).toBe(true)
    expect(getBody.hasDrafts).toBe(true)
    const policyRow = getBody.content.find(c => c.field === 'reservation_policies')
    expect(policyRow).toBeDefined()
    expect(policyRow?.value).toBe(policyValue)

    // Clean up
    await request.post(`${baseURL}/api/editor/sites/${siteId}/content/discard`, {
      data: { page: 'reservations' },
    })
  })
})
