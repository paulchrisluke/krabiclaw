import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import thaiPlatformMessages from '../../i18n/catalogs/th.json' with { type: 'json' }
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

function includesLocaleCatalog(value: unknown, expectedLocale: string): boolean {
  if (!value || typeof value !== 'object' || !('catalogs' in value)) return false
  const catalogs = value.catalogs
  return Array.isArray(catalogs) && catalogs.some((catalog) => (
    catalog !== null
    && typeof catalog === 'object'
    && 'locale' in catalog
    && catalog.locale === expectedLocale
  ))
}

async function putLocalization(
  request: APIRequestContext,
  resourceType: string,
  resourceId: string,
  body: Record<string, unknown>,
) {
  const response = await request.put(
    `/api/editor/sites/${siteId}/localization/${resourceType}/${resourceId}/${locale}`,
    { data: body },
  )
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
  let admin: APIRequestContext
  let owner: APIRequestContext
  let links: { page: { id: string }; items: Array<{ id: string; label: string }> }
  let dashboardContext: BrowserContext
  let cms: Page

  test.beforeAll(async ({ playwright }) => {
    baseURL = testBaseUrl()
    admin = await playwright.request.newContext({ baseURL })
    owner = await playwright.request.newContext({ baseURL })
    await loginAs(admin, baseURL, 'user-e2e-platform-admin')
    await loginAs(owner, baseURL, 'user-e2e-ncls-owner')
  })

  test.afterAll(async () => {
    await dashboardContext?.close()
    await admin.dispose()
    await owner.dispose()
  })

  test('publishes the platform catalog and enables Thai for the tenant', async () => {
    const catalogsResponse = await admin.get('/api/admin/localization')
    await expectStatus(catalogsResponse, 200)
    if (!includesLocaleCatalog(await catalogsResponse.json(), locale)) {
      await expectStatus(await admin.post('/api/admin/localization', {
        data: { locale, label: 'ไทย', direction: 'ltr' },
      }), 200)
    }
    await expectStatus(await admin.post(`/api/admin/localization/${locale}/publish`, {
      data: { messages: thaiPlatformMessages },
    }), 200)

    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/enable`, {
      data: { label: 'ไทย' },
    }), 200)

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
  })

  test('stores the Thai home page variant without a site localization', async () => {
    await createPageVariant(owner, {
      pageId: 'page_ncls_home',
      path: '/',
      title: 'ความยุติธรรมสำหรับทุกคน',
      summary: 'บริการกฎหมายภาษาไทยที่เข้าใจง่าย',
    })
  })

  test('stores the Thai services page variant without a site localization', async () => {
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
          type: 'offering_grid',
          position: 1,
          data: { section: 'services', source: 'site_offerings' },
          media: [],
        },
      ],
    })
  })

  test('stores the Thai blog page variant without a site localization', async () => {
    await createPageVariant(owner, {
      pageId: 'page_ncls_blog',
      path: '/blog',
      title: 'บทความกฎหมาย',
      summary: 'ความรู้ทางกฎหมายสำหรับผู้อ่านภาษาไทย',
    })
  })

  test('stores directly requested Thai resources without a site localization', async () => {
    await expectStatus(await owner.get(`/api/editor/sites/${siteId}/localization/site/${siteId}/${locale}`), 404)
    await putLocalization(owner, 'offering', 'offering_ncls_family', {
      route_path: '/th/services/family-th',
      values: {
        name: 'กฎหมายครอบครัวภาษาไทย',
        summary: 'คำแนะนำเรื่องครอบครัวที่ชัดเจน',
        body: 'ทีมกฎหมายของเราช่วยอธิบายทางเลือกและขั้นตอนเป็นภาษาไทย',
      },
    })
    await putLocalization(owner, 'tenant_blog_post', 'blog_ncls_writing-your-own-will-how-it-works', {
      route_path: '/th/article/will-th',
      values: {
        title: 'คู่มือพินัยกรรมภาษาไทย',
        excerpt: 'สิ่งที่ควรรู้ก่อนจัดทำพินัยกรรม',
      },
      content_blocks: [{
        type: 'markdown',
        position: 0,
        data: { markdown: 'บทความนี้อธิบายขั้นตอนจัดทำพินัยกรรมเป็นภาษาไทย', editor_mode: 'source' },
        media: [],
      }],
    })
  })

  test('hydrates sparse Thai page collections', async () => {
    const localizedServicesResponse = await owner.get(`/api/public/sites/${siteId}/localized-pages/${locale}?path=${encodeURIComponent('/services')}`)
    await expectStatus(localizedServicesResponse, 200)
    const localizedServices = await localizedServicesResponse.json() as { page: { blocks: unknown[] } }
    expect(JSON.stringify(localizedServices.page.blocks)).toContain('กฎหมายครอบครัวภาษาไทย')
  })

  test('stores the Thai link page translation', async () => {
    await putLocalization(owner, 'site_link_page', links.page.id, {
      route_path: '/th/links',
      values: {
        title: 'ลิงก์ที่มีประโยชน์',
        seo_title: 'ลิงก์ที่มีประโยชน์',
        seo_description: 'ลิงก์กฎหมายภาษาไทย',
      },
    })
  })

  for (const [index, label] of ['บริการกฎหมายครอบครัวเก่า', 'ติดต่อทีมงานเก่า'].entries()) {
    test(`stores Thai copy for initial link ${index + 1}`, async () => {
      await putLocalization(owner, 'site_link_item', links.items[index]!.id, {
        values: { label },
      })
    })
  }

  test('renders initialized Thai link translations', async ({ page }) => {
    const primedLinks = await openTenantPage(page, `${blawbyBaseURL}/th/links`, blawbyExtraHeaders)
    expect(primedLinks?.status()).toBeLessThan(400)
    await expect(page.locator('main')).toContainText('บริการกฎหมายครอบครัวเก่า')
  })

  test.describe('Thai link copy in the CMS', () => {
    test.beforeAll(async ({ browser }) => {
      dashboardContext = await browser.newContext({ baseURL, storageState: await owner.storageState() })
      cms = await dashboardContext.newPage()
      await openTenantPage(cms, `${baseURL}/dashboard/north-carolina-legal-services/sites/ncls/links`, {})
    })

    test('loads seeded translations', async () => {
      await expect(cms.getByTestId('links-translation-locale')).toHaveValue(locale)
      await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์ที่มีประโยชน์')
    })

    test('saves the Thai page translation', async () => {
      await cms.getByTestId('links-translation-title').fill('ลิงก์กฎหมายภาษาไทย')
      await cms.getByTestId('links-translation-seo-title').fill('ลิงก์กฎหมายภาษาไทย')
      await cms.getByTestId('links-translation-seo-description').fill('ลิงก์ที่ผ่านการตรวจสอบสำหรับผู้อ่านภาษาไทย')
      const pageTranslationSave = await Promise.all([
        cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/site_link_page/${links.page.id}/th`)),
        cms.getByTestId('links-save-page-translation').click(),
      ]).then(([response]) => response)
      expect(pageTranslationSave.status()).toBe(200)
    })

    const translatedLabels = ['บริการกฎหมายครอบครัว', 'ติดต่อทีมงานของเรา'] as const
    for (const index of [0, 1] as const) {
      test(`saves Thai copy for link ${index + 1}`, async () => {
        const item = links.items[index]!
        const editor = cms.getByTestId(`links-item-translation-${item.id}`)
        await editor.getByTestId('links-item-translation-label').fill(translatedLabels[index])
        const itemTranslationSave = await Promise.all([
          cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/site_link_item/${item.id}/th`)),
          editor.getByTestId('links-save-item-translation').click(),
        ]).then(([response]) => response)
        expect(itemTranslationSave.status()).toBe(200)
      })
    }

    test('reloads the saved Thai link copy', async () => {
      const localizationReads = [
        `/localization/site_link_page/${links.page.id}/th`,
        ...links.items.map(item => `/localization/site_link_item/${item.id}/th`),
      ].map(path => cms.waitForResponse(response => (
        response.request().method() === 'GET'
        && response.url().includes(path)
      )))
      const [responses] = await Promise.all([
        Promise.all(localizationReads),
        cms.reload({ waitUntil: 'domcontentloaded' }),
      ])
      for (const response of responses) {
        expect(response.status()).toBe(200)
      }
      await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
      for (const [index, item] of links.items.entries()) {
        await expect(cms.getByTestId(`links-item-translation-${item.id}`).getByTestId('links-item-translation-label')).toHaveValue(translatedLabels[index]!)
      }
    })
  })

  test('keeps dirty Thai form state after a rejected save', async () => {
    await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/disable`), 200)
    await expectStatus(await owner.get(`/api/editor/sites/${siteId}/localization/site_link_page/${links.page.id}/${locale}`), 402)

    const unsavedTitle = 'ฉบับร่างที่ยังไม่ได้บันทึก'
    await cms.getByTestId('links-translation-title').fill(unsavedTitle)
    const failedSave = await Promise.all([
      cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/site_link_page/${links.page.id}/th`)),
      cms.getByTestId('links-save-page-translation').click(),
    ]).then(([response]) => response)
    expect(failedSave.status()).toBe(402)
    await expect(cms.locator('p.text-error')).toBeVisible()
    await expect(cms.getByTestId('links-translation-title')).toHaveValue(unsavedTitle)

    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/enable`, {
      data: { label: 'ไทย' },
    }), 200)
    await cms.reload()
    await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
  })

  async function verifyThaiLinksAndHome(page: Page, viewport: { width: number; height: number }) {
    await page.setViewportSize(viewport)
    await openTenantPage(page, `${blawbyBaseURL}/th/links`, blawbyExtraHeaders)
    await page.reload()
    await expect(page.locator('main')).toContainText('ลิงก์กฎหมายภาษาไทย')
    await expect(page.locator('main')).toContainText('บริการกฎหมายครอบครัว')
    await expect(page.locator('main')).toContainText('ติดต่อทีมงานของเรา')
    await expect(page.locator('a[href="/th/contact"]')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/Family law services|Contact our team/i)

    await expectThaiRepresentation(page, '/th', '/', 'ความยุติธรรมสำหรับทุกคน', /Access to Justice for All/i)
  }

  async function verifyThaiServiceRoutes(page: Page, viewport: { width: number; height: number }) {
    await page.setViewportSize(viewport)
    await expectThaiRepresentation(page, '/th/services/family-th', '/services/family', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
    await expectThaiRepresentation(page, '/th/services', '/services', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
  }

  async function verifyThaiBlogRoutes(page: Page, viewport: { width: number; height: number }) {
    await page.setViewportSize(viewport)
    await expectThaiRepresentation(page, '/th/blog', '/blog', 'บทความกฎหมาย', /Our Blog|Legal insights/i)
    await expect(page.locator('a[href="/th/article/will-th"]')).toBeVisible()
    await expectThaiRepresentation(page, '/th/article/will-th', '/article/writing-your-own-will-how-it-works', 'คู่มือพินัยกรรมภาษาไทย', /Last Will and Testament in North Carolina/i)
  }

  for (const [viewportName, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    test(`renders Thai links and home navigation on ${viewportName}`, async ({ page }) => {
      await verifyThaiLinksAndHome(page, viewport)
    })

    test(`renders Thai service routes on ${viewportName}`, async ({ page }) => {
      await verifyThaiServiceRoutes(page, viewport)
    })

    test(`renders Thai blog routes on ${viewportName}`, async ({ page }) => {
      await verifyThaiBlogRoutes(page, viewport)
    })
  }

  test('renders a published Thai functional route without a tenant-page variant', async ({ page }) => {
    const response = await openTenantPage(page, `${blawbyBaseURL}/th/locations`, blawbyExtraHeaders)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/th\/locations$/)
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveAttribute('href', /\/th\/locations$/)
  })
})
