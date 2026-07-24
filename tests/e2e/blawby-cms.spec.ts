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
  const response = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/blawby/route`, {
    headers: blawbyExtraHeaders,
    params: { recipe },
  })
  expect(response.status()).toBe(200)
  return await response.json() as {
    page: {
      title: string
      summary: string | null
      components: Array<Record<string, unknown>>
    }
  }
}

function component(page: { components: Array<Record<string, unknown>> }, type: string) {
  return page.components.find(item => item.type === type) ?? {}
}

test.describe('Blawby professional_service CMS editing', () => {
  test.describe.configure({ mode: 'serial' })

  test('NCLS home/about/contact page copy is editable from the canonical content editor path', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await loginAsNclsOwner(page, baseURL!)

    const index = await page.goto(`${baseURL}${DASHBOARD_BASE}/content`, { waitUntil: 'load' })
    expect(index?.status()).toBe(200)
    await expect(page.getByText('Home', { exact: true })).toBeVisible()
    await expect(page.getByText('About', { exact: true })).toBeVisible()
    await expect(page.getByText('Contact', { exact: true })).toBeVisible()
    await expect(page.getByText('Office', { exact: true })).toHaveCount(0)

    const edits = [
      { pageId: 'home', recipe: 'home', componentType: 'home_hero' },
      { pageId: 'about', recipe: 'about', componentType: 'page_hero' },
      { pageId: 'contact', recipe: 'contact', componentType: 'page_hero' },
    ] as const

    const originals = new Map<string, string>()
    try {
      for (const edit of edits) {
        const route = await publicRoute(page.request, baseURL!, edit.recipe)
        const originalTitle = String(component(route.page, edit.componentType).title ?? route.page.title)
        originals.set(edit.pageId, originalTitle)

        const updatedTitle = `E2E ${edit.pageId} title ${Date.now()}`
        const save = await page.request.post(`${baseURL}/api/editor/sites/${SITE_ID}/content/save`, {
          data: { page: edit.pageId, changes: { 'hero.title': updatedTitle } },
        })
        expect(save.status(), `save ${edit.pageId}`).toBe(200)

        const updatedRoute = await publicRoute(page.request, baseURL!, edit.recipe)
        expect(component(updatedRoute.page, edit.componentType).title).toBe(updatedTitle)
        expect(updatedRoute.page.title).toBe(updatedTitle)
      }
    } finally {
      for (const edit of edits) {
        const originalTitle = originals.get(edit.pageId)
        if (!originalTitle) continue
        await page.request.post(`${baseURL}/api/editor/sites/${SITE_ID}/content/save`, {
          data: { page: edit.pageId, changes: { 'hero.title': originalTitle } },
        })
      }
    }
  })

  test('NCLS professional-services dashboard exposes editable offerings and policy pages', async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    await loginAsNclsOwner(page, baseURL!)

    const dashboard = await page.goto(`${baseURL}${DASHBOARD_BASE}/professional-services`, { waitUntil: 'load' })
    expect(dashboard?.status()).toBe(200)
    await expect(page.getByText('Services / practice areas', { exact: true })).toBeVisible()
    await expect(page.getByText('Policies & notices', { exact: true })).toBeVisible()
    await expect(page.getByText('Compliance & consultation', { exact: true })).toBeVisible()

    const current = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`)
    expect(current.status()).toBe(200)
    const payload = await current.json() as { offerings: ApiRecord[]; tenantPages: ApiRecord[] }
    const offering = payload.offerings[0]
    const policy = payload.tenantPages.find(item => item.path === '/policies/privacy')
    expect(offering?.id).toBeTruthy()
    expect(policy?.id).toBeTruthy()

    const originalOfferingSummary = offering.summary
    const originalPolicySummary = policy!.summary
    try {
      const offeringSummary = `E2E offering summary ${Date.now()}`
      const offeringSave = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { offerings: [{ ...offering, summary: offeringSummary }] },
      })
      expect(offeringSave.status()).toBe(200)

      const policySummary = `E2E policy summary ${Date.now()}`
      const policySave = await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { tenantPages: [{ ...policy, summary: policySummary }] },
      })
      expect(policySave.status()).toBe(200)

      const updated = await page.request.get(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`)
      expect(updated.status()).toBe(200)
      const updatedPayload = await updated.json() as { offerings: ApiRecord[]; tenantPages: ApiRecord[] }
      expect(updatedPayload.offerings.find(item => item.id === offering.id)?.summary).toBe(offeringSummary)
      expect(updatedPayload.tenantPages.find(item => item.id === policy!.id)?.summary).toBe(policySummary)
    } finally {
      await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { offerings: [{ ...offering, summary: originalOfferingSummary }] },
      })
      await page.request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/professional-services`, {
        data: { tenantPages: [{ ...policy, summary: originalPolicySummary }] },
      })
    }
  })
})
