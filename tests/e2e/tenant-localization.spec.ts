import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { blawbyBaseURL, blawbyExtraHeaders, openTenantPage } from './helpers'
import { testBaseUrl } from './test-env'

const siteId = 'site-ncls-blawby'
const locale = 'th'

async function expectStatus(response: APIResponse, expected: number | readonly number[]) {
  const statuses = Array.isArray(expected) ? expected : [expected]
  const body = statuses.includes(response.status()) ? '' : await response.text()
  expect(statuses, body).toContain(response.status())
}

async function putLocalization(
  request: APIRequestContext,
  resourceType: string,
  resourceId: string,
  body: Record<string, unknown>,
) {
  const requestId = randomUUID()
  const startedAt = Date.now()
  console.info('[e2e-localization]', JSON.stringify({ event: 'started', requestId, resourceType }))
  let response: APIResponse
  try {
    response = await request.put(
      `/api/editor/sites/${siteId}/localization/${resourceType}/${resourceId}/${locale}`,
      { data: body, headers: { 'x-request-id': requestId } },
    )
  } catch {
    console.error('[e2e-localization]', JSON.stringify({ event: 'transport_failed', requestId, resourceType, durationMs: Date.now() - startedAt }))
    throw new Error(`Localization transport failed: ${resourceType}; requestId=${requestId}`)
  }
  console.info('[e2e-localization]', JSON.stringify({
    event: 'finished', requestId, resourceType, durationMs: Date.now() - startedAt,
    status: response.status(), rayId: response.headers()['cf-ray'] ?? null,
    serverTiming: response.headers()['server-timing'] ?? null,
  }))
  await expectStatus(response, 200)
}

async function createPageVariant(
  request: APIRequestContext,
  input: { pageId: string; path: string; title: string; summary: string; blocks?: Array<Record<string, unknown>> },
) {
  const response = await request.post(`/api/editor/sites/${siteId}/pages`, {
    data: {
      pageId: input.pageId,
      locale,
      path: input.path,
      title: input.title,
      summary: input.summary,
      seoTitle: input.title,
      seoDescription: input.summary,
      blocks: input.blocks ?? [{
        type: 'hero',
        position: 0,
        data: { section: 'hero', eyebrow: 'เนื้อหาภาษาไทย', title: input.title, subtitle: input.summary },
        media: [],
      }],
    },
  })
  await expectStatus(response, 201)
}

async function expectThaiRepresentation(
  page: Parameters<typeof openTenantPage>[0],
  path: string,
  sourcePath: string,
  translatedText: string,
  sourceText: RegExp,
) {
  const response = await openTenantPage(page, `${blawbyBaseURL}${path}`, blawbyExtraHeaders)
  expect(response?.status()).toBeLessThan(400)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('main')).toContainText(translatedText)
  await expect(page.locator('body')).not.toContainText(sourceText)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path.replaceAll('/', '\\/')}$`))
  await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveAttribute('href', new RegExp(`${path.replaceAll('/', '\\/')}$`))
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', new RegExp(`${sourcePath.replaceAll('/', '\\/')}$`))
}

test.describe.serial('published Thai content saves through the CMS and renders without English fallback', () => {
  let baseURL: string
  let owner: APIRequestContext
  let links: { page: { id: string }; items: Array<{ id: string; label: string }> }
  let dashboardContext: BrowserContext
  let cms: Page

  test.beforeAll(async ({ playwright }, testInfo) => {
    testInfo.setTimeout(120_000)
    baseURL = testBaseUrl()
    owner = await playwright.request.newContext({ baseURL })
    await loginAs(owner, baseURL, 'user-e2e-ncls-owner')

    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/enable`), 200)

    const linksResponse = await owner.patch(`/api/editor/sites/${siteId}/links-page`, {
      data: {
        page: {
          title: 'Helpful links',
          robots: 'noindex,follow',
          seo_title: 'Helpful links',
          seo_description: 'Helpful links from North Carolina Legal Services',
        },
        items: [
          { id: 'tmp_family', label: 'Family law services', destination: '/services/family', sort_order: 0, status: 'active' },
          { id: 'tmp_contact', label: 'Contact our team', destination: '/contact', sort_order: 1, status: 'active' },
        ],
      },
    })
    await expectStatus(linksResponse, 200)
    links = await linksResponse.json() as {
      page: { id: string }
      items: Array<{ id: string; label: string }>
    }
    expect(links.items).toHaveLength(2)

    // A practice area is a page, so it localizes like every other page, and the
    // services grid names the pages it lists. Its id belongs to the tenant, so
    // it is read from the site rather than written here as a constant.
    const pagesResponse = await owner.get(`/api/editor/sites/${siteId}/pages`)
    await expectStatus(pagesResponse, 200)
    const { pages } = await pagesResponse.json() as { pages: Array<{ page_id: string; path: string }> }
    const familyPage = pages.find(page => page.path === '/services/family')
    expect(familyPage, 'NCLS publishes a family practice area page').toBeTruthy()

    await createPageVariant(owner, {
      pageId: 'page_ncls_home',
      path: '/',
      title: 'ความยุติธรรมสำหรับทุกคน',
      summary: 'บริการกฎหมายภาษาไทยที่เข้าใจง่าย',
    })
    await createPageVariant(owner, {
      pageId: 'page_ncls_services',
      path: '/services',
      title: 'บริการกฎหมายของเรา',
      summary: 'เลือกบริการที่ตรงกับความต้องการของคุณ',
      blocks: [
        {
          type: 'hero',
          position: 0,
          data: { section: 'hero', eyebrow: 'เนื้อหาภาษาไทย', title: 'บริการกฎหมายของเรา', subtitle: 'เลือกบริการที่ตรงกับความต้องการของคุณ' },
          media: [],
        },
        {
          type: 'page_grid',
          position: 1,
          data: { section: 'services', page_ids: [familyPage!.page_id] },
          media: [],
        },
      ],
    })
    await createPageVariant(owner, {
      pageId: 'page_ncls_blog',
      path: '/blog',
      title: 'บทความกฎหมาย',
      summary: 'ความรู้ทางกฎหมายสำหรับผู้อ่านภาษาไทย',
    })

    await expectStatus(await owner.get(`/api/editor/sites/${siteId}/localization/site/${siteId}/${locale}`), 404)
    // A page representation carries its own translated body: a Thai page with
    // no blocks is an empty page, which is why the writer rejects one.
    await putLocalization(owner, 'content_document', familyPage!.page_id, {
      route_path: '/th/services/family-th',
      values: {
        title: 'กฎหมายครอบครัวภาษาไทย',
        summary: 'คำแนะนำเรื่องครอบครัวที่ชัดเจน',
      },
      content_blocks: [
        { type: 'heading', position: 0, level: 2, data: { text: 'กฎหมายครอบครัวภาษาไทย' }, media: [] },
        { type: 'markdown', position: 1, data: { markdown: 'ทีมงานของเราช่วยเรื่องครอบครัวเป็นภาษาไทย', editor_mode: 'source' }, media: [] },
      ],
    })
    await putLocalization(owner, 'content_document', 'blog_ncls_writing-your-own-will-how-it-works', {
      route_path: '/th/article/will-th',
      values: {
        title: 'คู่มือพินัยกรรมภาษาไทย',
        summary: 'สิ่งที่ควรรู้ก่อนจัดทำพินัยกรรม',
      },
      content_blocks: [{
        type: 'markdown',
        position: 0,
        data: { markdown: 'บทความนี้อธิบายขั้นตอนจัดทำพินัยกรรมเป็นภาษาไทย', editor_mode: 'source' },
        media: [],
      }],
    })

    await putLocalization(owner, 'content_document', links.page.id, {
      route_path: '/th/links',
      values: {
        title: 'ลิงก์กฎหมายภาษาไทย',
        seo_title: 'ลิงก์กฎหมายภาษาไทย',
        seo_description: 'ลิงก์ที่ผ่านการตรวจสอบสำหรับผู้อ่านภาษาไทย',
      },
      content_blocks: ['บริการกฎหมายครอบครัวเก่า', 'ติดต่อทีมงานของเรา'].map((label, index) => ({ type: 'cta', source_block_id: links.items[index]!.id, data: { label } })),
    })

  })

  test.afterAll(async () => {
    await dashboardContext?.close()
    await owner.dispose()
  })

  test('hydrates sparse Thai page collections', async () => {
    const localizedServicesResponse = await owner.get(`/api/public/sites/${siteId}/localized-pages/${locale}?path=${encodeURIComponent('/services')}`)
    await expectStatus(localizedServicesResponse, 200)
    const localizedServices = await localizedServicesResponse.json() as { page: { blocks: unknown[] } }
    expect(JSON.stringify(localizedServices.page.blocks)).toContain('กฎหมายครอบครัวภาษาไทย')
  })

  test.describe('Thai link copy in the CMS', () => {
    test.beforeAll(async ({ browser }, testInfo) => {
      testInfo.setTimeout(45_000)
      dashboardContext = await browser.newContext({ baseURL, storageState: await owner.storageState() })
      cms = await dashboardContext.newPage()
      const requests = new Map<object, number>()
      cms.on('request', request => {
        const path = new URL(request.url()).pathname
        if (!path.startsWith(`/api/editor/sites/${siteId}/`)) return
        requests.set(request, Date.now())
        console.info('[e2e-localization-cms]', JSON.stringify({ event: 'started', method: request.method(), path }))
      })
      cms.on('response', response => {
        const startedAt = requests.get(response.request())
        if (startedAt === undefined) return
        requests.delete(response.request())
        const headers = response.headers()
        console.info('[e2e-localization-cms]', JSON.stringify({ event: 'finished', method: response.request().method(),
          path: new URL(response.url()).pathname, status: response.status(), durationMs: Date.now() - startedAt,
          requestId: headers['x-request-id'], rayId: headers['cf-ray'], serverTiming: headers['server-timing'] }))
      })
      cms.on('requestfailed', request => {
        const startedAt = requests.get(request)
        if (startedAt === undefined) return
        requests.delete(request)
        console.error('[e2e-localization-cms]', JSON.stringify({ event: 'transport_failed', method: request.method(),
          path: new URL(request.url()).pathname, durationMs: Date.now() - startedAt }))
      })
      // The links leaf, where the list of links lives. The page's own Localize
      // control is in the level's navbar beside it; a link's own Localize is in
      // the navbar of the record the row opens.
      await openTenantPage(cms, `${baseURL}/dashboard/north-carolina-legal-services/sites/ncls/links/items`, {})
    })

    test('loads and saves one representative Thai link translation through Localize', async () => {
      // Preview's two dialog loads consumed 22s before the save in CI 34110539544.
      test.setTimeout(60_000)
      await cms.getByTestId('localize-resource').first().click()
      await cms.getByTestId('localize-language').click()
      await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
      await expect(cms.getByTestId('localize-field-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
      await cms.getByRole('button', { name: 'Cancel' }).click()

      // A row opens the link's own level rather than a sheet, so the Localize
      // that follows is the record's, in that level's navbar.
      await cms.getByTestId('list-editor-toggle').click()
      await cms.getByRole('button', { name: 'Edit Family law services' }).click()
      await expect(cms).toHaveURL(new RegExp(`/links/items/${links.items[0]!.id}$`))
      await cms.getByTestId('localize-resource').click()
      await cms.getByTestId('localize-language').click()
      await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
      await expect(cms.getByTestId('localize-field-label')).toHaveValue('บริการกฎหมายครอบครัวเก่า')
      await cms.getByTestId('localize-field-label').fill('บริการกฎหมายครอบครัว')
      const itemTranslationSave = await Promise.all([
        cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/content_document/${links.page.id}/th`)),
        cms.getByTestId('localize-save').click(),
      ]).then(([response]) => response)
      expect(itemTranslationSave.status()).toBe(200)
    })
  })

  test('keeps dirty Thai Localize state after a rejected save', async () => {
    // This test opens a Localize dialog of its own, and preview spends upwards
    // of 11s on each one, which is why its sibling above also buys headroom.
    test.setTimeout(60_000)
    // Back out of the link's level to the links leaf, whose navbar carries the
    // page's own Localize. The record's navbar carries one too, so the URL has
    // to settle first: mid-transition both are mounted, and the click landed on
    // the record's as it detached.
    await cms.getByTestId('dashboard-navbar-back').click()
    await expect(cms).toHaveURL(/\/links\/items$/)
    await cms.getByTestId('localize-resource').first().click()
    await expect(cms.getByTestId('localize-language')).toBeEnabled()
    await cms.getByTestId('localize-language').click()
    await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
    await expect(cms.getByTestId('localize-field-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/disable`), 200)
    await expectStatus(await owner.get(`/api/editor/sites/${siteId}/localization/content_document/${links.page.id}/${locale}`), 402)

    const unsavedTitle = 'ฉบับร่างที่ยังไม่ได้บันทึก'
    await cms.getByTestId('localize-field-title').fill(unsavedTitle)
    const failedSave = await Promise.all([
      cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/content_document/${links.page.id}/th`)),
      cms.getByTestId('localize-save').click(),
    ]).then(([response]) => response)
    expect(failedSave.status()).toBe(402)
    await expect(cms.getByTestId('localize-field-title')).toHaveValue(unsavedTitle)

    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/enable`), 200)
    const dismissedPrompt = new Promise<void>((resolve) => {
      cms.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('Discard unsaved translation changes?')
        await dialog.dismiss()
        resolve()
      })
    })
    await Promise.all([dismissedPrompt, cms.getByRole('button', { name: 'Cancel' }).click()])
    await expect(cms.getByTestId('localize-field-title')).toHaveValue(unsavedTitle)

    const acceptedPrompt = new Promise<void>((resolve) => {
      cms.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('Discard unsaved translation changes?')
        await dialog.accept()
        resolve()
      })
    })
    await Promise.all([acceptedPrompt, cms.getByRole('button', { name: 'Cancel' }).click()])
    await expect(cms.getByTestId('localize-field-title')).toBeHidden()
  })

  test('keeps page translations attached to canonical block identities after reorder', async () => {
    test.setTimeout(120_000)
    const suffix = randomUUID()
    const firstBlockId = `source-first-${suffix}`
    const secondBlockId = `source-second-${suffix}`
    const path = `/localization-identity-${suffix}`
    const sourceBlocks = [
      { id: firstBlockId, type: 'heading', position: 0, data: { text: 'First source section', level: 2 }, media: [] },
      { id: secondBlockId, type: 'heading', position: 1, data: { text: 'Second source section', level: 2 }, media: [] },
    ]
    const createResponse = await owner.post(`/api/editor/sites/${siteId}/pages`, {
      data: {
        locale: 'en', path, title: 'Localization identity', summary: '', pageType: 'custom', recipe: null,
        seoTitle: null, seoDescription: null, canonicalUrl: null, robots: null, sortOrder: 99, blocks: sourceBlocks,
      },
    })
    await expectStatus(createResponse, 201)
    const source = (await createResponse.json() as { page: { id: string; page_id: string; document: { updated_at: string } } }).page

    await openTenantPage(cms, `${baseURL}/dashboard/north-carolina-legal-services/sites/ncls/pages/${source.id}`, {})
    await cms.getByTestId('localize-resource').click()
    await cms.getByTestId('localize-language').click()
    await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
    await cms.getByTestId('localize-field-title').fill('หน้าอัตลักษณ์การแปล')
    await cms.getByTestId(`localize-field-content:${firstBlockId}:text`).fill('ส่วนแรกภาษาไทย')
    await cms.getByTestId(`localize-field-content:${secondBlockId}:text`).fill('ส่วนที่สองภาษาไทย')
    const translatedCreateResponse = await Promise.all([
      cms.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/editor/sites/${siteId}/pages`),
      cms.getByTestId('localize-save').click(),
    ]).then(([response]) => response)
    expect(translatedCreateResponse.status()).toBe(201)
    const translated = (await translatedCreateResponse.json() as { page: { id: string } }).page

    const reorderedBlocks = [
      { ...sourceBlocks[1]!, position: 0 },
      { ...sourceBlocks[0]!, position: 1 },
    ]
    const reorderResponse = await owner.patch(`/api/editor/sites/${siteId}/pages/${source.id}`, {
      data: {
        pageId: source.page_id, locale: 'en', path, title: 'Localization identity', summary: '',
        pageType: 'custom', recipe: null, seoTitle: null, seoDescription: null, canonicalUrl: null,
        robots: null, sortOrder: 99, blocks: reorderedBlocks, expectedUpdatedAt: source.document.updated_at,
      },
    })
    await expectStatus(reorderResponse, 200)

    await cms.reload()
    await cms.getByTestId('localize-resource').click()
    await cms.getByTestId('localize-language').click()
    await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
    await expect(cms.getByTestId(`localize-field-content:${firstBlockId}:text`)).toHaveValue('ส่วนแรกภาษาไทย')
    await expect(cms.getByTestId(`localize-field-content:${secondBlockId}:text`)).toHaveValue('ส่วนที่สองภาษาไทย')
    const alignedSaveResponse = await Promise.all([
      cms.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/editor/sites/${siteId}/pages/${translated.id}`),
      cms.getByTestId('localize-save').click(),
    ]).then(([response]) => response)
    expect(alignedSaveResponse.status()).toBe(200)
    const aligned = (await alignedSaveResponse.json() as { page: { blocks: Array<{ source_block_id: string | null }> } }).page
    expect(aligned.blocks.map(block => block.source_block_id)).toEqual([secondBlockId, firstBlockId])
    await cms.close()
  })

  async function verifyThaiLinksAndHome(page: Page) {
    await openTenantPage(page, `${blawbyBaseURL}/th/links`, blawbyExtraHeaders)
    await expect(page.locator('main')).toContainText('ลิงก์กฎหมายภาษาไทย')
    await expect(page.locator('main')).toContainText('บริการกฎหมายครอบครัว')
    await expect(page.locator('main')).toContainText('ติดต่อทีมงานของเรา')
    await expect(page.locator('a[href="/th/contact"]')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/Family law services|Contact our team/i)

    await expectThaiRepresentation(page, '/th', '/', 'ความยุติธรรมสำหรับทุกคน', /Access to Justice for All/i)
  }

  async function verifyThaiServiceRoutes(page: Page) {
    await expectThaiRepresentation(page, '/th/services/family-th', '/services/family', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
    await expectThaiRepresentation(page, '/th/services', '/services', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
  }

  async function verifyThaiBlogRoutes(page: Page) {
    await expectThaiRepresentation(page, '/th/blog', '/blog', 'บทความกฎหมาย', /Our Blog|Legal insights/i)
    await expect(page.locator('a[href="/th/article/will-th"]')).toBeVisible()
    await expectThaiRepresentation(page, '/th/article/will-th', '/article/writing-your-own-will-how-it-works', 'คู่มือพินัยกรรมภาษาไทย', /Last Will and Testament in North Carolina/i)
  }

  test('renders Thai links and home navigation', async ({ page }) => {
    await verifyThaiLinksAndHome(page)
  })

  test('renders Thai service routes', async ({ page }) => {
    await verifyThaiServiceRoutes(page)
  })

  test('renders Thai blog routes', async ({ page }) => {
    await verifyThaiBlogRoutes(page)
  })

  test('renders a published Thai functional route without a tenant-page variant', async ({ page }) => {
    const response = await openTenantPage(page, `${blawbyBaseURL}/th/locations`, blawbyExtraHeaders)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/th\/locations$/)
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveAttribute('href', /\/th\/locations$/)
  })
})
