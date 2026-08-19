import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { blawbyExtraHeaders } from './helpers'
import { loginAsPage } from './helpers/auth'

const OWNER_USER_ID = 'user-e2e-ncls-owner'
const SITE_ID = 'site-ncls-blawby'
const DASHBOARD_BASE = '/dashboard/north-carolina-legal-services/sites/ncls'

const CURATED_FIXTURE_TITLES = {
  home: {
    pageTitle: "Access to Justice for All. North Carolina's affordable legal services.",
    heroTitle: "Access to Justice for All.\nNorth Carolina's affordable\nlegal services.",
  },
  about: { pageTitle: 'About Us', heroTitle: 'About Us' },
  contact: { pageTitle: 'Contact Us', heroTitle: 'Contact Us' },
} as const

async function loginAsNclsOwner(page: Page, baseURL: string) {
  await loginAsPage(page, baseURL, OWNER_USER_ID)
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
    test.setTimeout(300_000)
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

    // Exercise the Pages editor's own save path before the API-level block
    // matrix below.  The read only API assertion confirms the UI mutation was
    // persisted; the second UI save restores the fixture before the matrix.
    const pageSettingsCard = page.getByRole('heading', { name: 'Page settings', exact: true })
      .locator('xpath=ancestor::*[@data-slot="root"][1]')
    await expect(pageSettingsCard).toHaveCount(1)
    const rootTitleInput = pageSettingsCard.getByRole('textbox', { name: 'Title', exact: true })
    const originalRootTitle = await rootTitleInput.inputValue()
    const uiTitle = `${originalRootTitle} UI ${Date.now()}`
    const pagesCollectionUrl = `${baseURL}/api/editor/sites/${SITE_ID}/pages?locale=en`
    const rootPagesResponse = await page.request.get(pagesCollectionUrl)
    expect(rootPagesResponse.status()).toBe(200)
    const rootPageSummary = ((await rootPagesResponse.json()) as { pages: Array<{ id: string; path: string; title: string }> }).pages.find(item => item.path === '/')
    expect(rootPageSummary?.id).toBeTruthy()
    const rootPagePatchUrl = `${baseURL}/api/editor/sites/${SITE_ID}/pages/${rootPageSummary!.id}`
    const saveRootTitle = async (title: string) => {
      const patchResponse = page.waitForResponse(candidate => (
        new URL(candidate.url()).pathname === new URL(rootPagePatchUrl).pathname
        && candidate.request().method() === 'PATCH'
      ), { timeout: 45_000 })
      const pagesResponse = page.waitForResponse(candidate => (
        new URL(candidate.url()).pathname === new URL(pagesCollectionUrl).pathname
        && candidate.request().method() === 'GET'
      ), { timeout: 45_000 })
      await rootTitleInput.fill(title)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      expect((await patchResponse).status()).toBe(200)
      expect((await pagesResponse).status()).toBe(200)
      await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible({ timeout: 30_000 })
    }
    await saveRootTitle(uiTitle)

    const uiPages = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages`)
    expect(uiPages.status()).toBe(200)
    const uiPageSummary = ((await uiPages.json()) as { pages: Array<{ id: string; path: string; title: string }> }).pages.find(item => item.path === '/')
    expect(uiPageSummary?.title).toBe(uiTitle)

    await saveRootTitle(originalRootTitle)
    await expect(rootTitleInput).toHaveValue(originalRootTitle)

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

    try {
      for (const edit of edits) {
        await publicRoute(page.request, baseURL!, edit.recipe)

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
        const saveBody = await save.json() as { page: { title: string; blocks: Array<{ type: string; data: Record<string, unknown> }> } }
        expect(saveBody.page.title).toBe(updatedTitle)
        expect(block(saveBody.page, 'hero').data.title).toBe(updatedTitle)

        const updatedRoute = await publicRoute(page.request, baseURL!, edit.recipe)
        expect(block(updatedRoute.page, 'hero').data.title).toBe(updatedTitle)
        expect(updatedRoute.page.title).toBe(updatedTitle)
      }
    } finally {
      for (const edit of edits) {
        const canonical = CURATED_FIXTURE_TITLES[edit.pageId]
        const pages = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages`)
        const pageSummary = ((await pages.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(item => item.path === `/${edit.pageId === 'home' ? '' : edit.pageId}`.replace('//', '/'))
        if (!pageSummary) continue
        const detail = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary.id}`)
        const detailBody = await detail.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
        const blocks = detailBody.page.blocks.map(item => item.type === 'hero' ? { ...item, data: { ...item.data, title: canonical.heroTitle } } : item)
        const restore = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/pages/${pageSummary.id}`, {
          data: { title: canonical.pageTitle, blocks, expectedDocumentUpdatedAt: detailBody.page.document.updated_at },
        })
        expect(restore.status(), `restore ${edit.pageId}`).toBe(200)
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
