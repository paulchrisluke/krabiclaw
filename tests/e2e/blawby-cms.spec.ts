import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { blawbyExtraHeaders } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'

const OWNER_USER_ID = 'user-ncls-blawby'
const SITE_ID = 'site-ncls-blawby'
const DASHBOARD_BASE = '/dashboard/north-carolina-legal-services/sites/ncls'

async function loginAsNclsOwner(page: Page, baseURL: string) {
  await page.setExtraHTTPHeaders(devLoginHeaders() ?? {})
  const login = await page.goto(devLoginUrl(baseURL, OWNER_USER_ID), {
    waitUntil: 'load',
    referer: baseURL,
  })
  expect(login?.status()).toBeLessThan(400)
}

async function publicRoute(request: APIRequestContext, baseURL: string, recipe: string) {
  const response = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blawby/document`, {
    headers: blawbyExtraHeaders,
    params: { recipe },
  })
  expect(response.status()).toBe(200)
  const payload = await response.json()
  return payload.route as {
    page: {
      title: string
      summary: string | null
      blocks: Array<{ id: string; type: string; data: Record<string, unknown> }>
    }
  }
}

function block(page: { blocks: Array<{ id: string; type: string; data: Record<string, unknown> }> }, type: string) {
  return page.blocks.find(item => item.type === type) ?? { id: '', type, data: {} }
}

test.describe('Blawby professional_service CMS editing', () => {
  test.describe.configure({ mode: 'serial' })

  test('NCLS home/about/contact page blocks are editable from the Pages manager', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    const fixture = await page.request.get(`${baseURL}/api/public/sites/${SITE_ID}/blawby/document`, {
      headers: blawbyExtraHeaders,
      params: { recipe: 'home' },
    })
    test.skip(fixture.status() === 404, 'NCLS Blawby fixture is not seeded in this environment')
    await loginAsNclsOwner(page, baseURL!)

    const index = await page.goto(`${baseURL}${DASHBOARD_BASE}/pages`, { waitUntil: 'load' })
    expect(index?.status()).toBe(200)
    await expect(page.getByText('Site pages', { exact: true })).toBeVisible()
    const rootPage = page.locator('button').filter({ has: page.locator('span').filter({ hasText: /^\/$/ }) })
    await expect(rootPage).toHaveCount(1)
    await rootPage.click()
    await expect(rootPage).toHaveClass(/border-primary/)
    await expect(page.getByText('Block type', { exact: true })).toBeVisible()
    await expect(page.getByText('Block data JSON', { exact: true })).toHaveCount(0)

    const newBlockType = page.getByRole('combobox', { name: 'New block type' })
    await newBlockType.click()
    await page.getByRole('option', { name: 'Image', exact: true }).click()
    await page.getByRole('button', { name: 'Add block', exact: true }).click()
    await expect(page.getByText('Media asset', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Select media/ })).toBeVisible()
    await expect(page.getByText('Needs attention', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Delete block' }).last().click()
    await expect(page.getByText('Media asset', { exact: true })).toHaveCount(0)

    const edits = [
      { pageId: 'home', recipe: 'home' },
      { pageId: 'about', recipe: 'about' },
      { pageId: 'contact', recipe: 'contact' },
    ] as const

    const originals = new Map<string, { pageTitle: string; heroTitle: string }>()
    try {
      for (const edit of edits) {
        const route = await publicRoute(page.request, baseURL!, edit.recipe)
        const originalHeroTitle = String(block(route.page, 'hero').data.title ?? route.page.title)
        originals.set(edit.pageId, { pageTitle: route.page.title, heroTitle: originalHeroTitle })

        const updatedTitle = `E2E ${edit.pageId} title ${Date.now()}`
        const pages = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages`)
        const pageSummary = ((await pages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(item => item.path === `/${edit.pageId === 'home' ? '' : edit.pageId}`.replace('//', '/'))
        expect(pageSummary).toBeTruthy()
        const detail = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary!.id}`)
        const detailBody = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
        const blocks = detailBody.page.blocks.map(item => item.type === 'hero' ? { ...item, data: { ...item.data, title: updatedTitle } } : item)
        const save = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary!.id}`, {
          data: { title: updatedTitle, blocks, expectedDocumentUpdatedAt: detailBody.page.document.updated_at },
        })
        expect(save.status(), `save ${edit.pageId}`).toBe(200)
        const saveBody = await save.json() as { page: { title: string; blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
        expect(saveBody.page.title).toBe(updatedTitle)
        expect(block(saveBody.page, 'hero').data.title).toBe(updatedTitle)

        const publish = await page.request.post(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary!.id}/publish`, {
          data: { expectedDocumentUpdatedAt: saveBody.page.document.updated_at },
        })
        expect(publish.status(), `publish ${edit.pageId}`).toBe(200)

        const updatedRoute = await publicRoute(page.request, baseURL!, edit.recipe)
        expect(block(updatedRoute.page, 'hero').data.title).toBe(updatedTitle)
        expect(updatedRoute.page.title).toBe(updatedTitle)
      }
    } finally {
      for (const edit of edits) {
        const original = originals.get(edit.pageId)
        if (!original) continue
        const pages = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages`)
        const pageSummary = ((await pages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(item => item.path === `/${edit.pageId === 'home' ? '' : edit.pageId}`.replace('//', '/'))
        if (!pageSummary) continue
        const detail = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary.id}`)
        const detailBody = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
        const blocks = detailBody.page.blocks.map(item => item.type === 'hero' ? { ...item, data: { ...item.data, title: original.heroTitle } } : item)
        const restore = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary.id}`, {
          data: { title: original.pageTitle, blocks, expectedDocumentUpdatedAt: detailBody.page.document.updated_at },
        })
        expect(restore.status(), `restore ${edit.pageId}`).toBe(200)
        const restoreBody = await restore.json() as { page: { document: { updated_at: string } } }
        const restorePublish = await page.request.post(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary.id}/publish`, {
          data: { expectedDocumentUpdatedAt: restoreBody.page.document.updated_at },
        })
        expect(restorePublish.status(), `republish ${edit.pageId}`).toBe(200)
      }
    }
  })

  test('NCLS professional-services dashboard exposes editable offerings and policy pages', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    const fixture = await page.request.get(`${baseURL}/api/public/sites/${SITE_ID}/blawby/document`, {
      headers: blawbyExtraHeaders,
      params: { recipe: 'home' },
    })
    test.skip(fixture.status() === 404, 'NCLS Blawby fixture is not seeded in this environment')
    await loginAsNclsOwner(page, baseURL!)

    const dashboard = await page.goto(`${baseURL}${DASHBOARD_BASE}/professional-services`, { waitUntil: 'load' })
    expect(dashboard?.status()).toBe(200)
    await expect(page.getByText('Services and practice areas', { exact: true })).toBeVisible()

    const current = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`)
    expect(current.status()).toBe(200)
    const payload = await current.json() as { offerings: ApiRecord[] }
    const offering = payload.offerings[0]
    expect(offering?.id).toBeTruthy()

    const originalOfferingSummary = offering.summary
    try {
      const offeringSummary = `E2E offering summary ${Date.now()}`
      const offeringSave = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { offerings: [{ ...offering, summary: offeringSummary }] },
      })
      expect(offeringSave.status()).toBe(200)

      const updated = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`)
      expect(updated.status()).toBe(200)
      const updatedPayload = await updated.json() as { offerings: ApiRecord[] }
      expect(updatedPayload.offerings.find(item => item.id === offering.id)?.summary).toBe(offeringSummary)
    } finally {
      await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { offerings: [{ ...offering, summary: originalOfferingSummary }] },
      })
    }
  })
})
