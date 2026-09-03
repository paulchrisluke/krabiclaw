import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
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

async function expectExactThaiPage(
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

test('published Thai content saves through the CMS and renders without English fallback', async ({ page, playwright, browser }) => {
  const baseURL = testBaseUrl()
  const admin = await playwright.request.newContext({ baseURL })
  const owner = await playwright.request.newContext({ baseURL })
  try {
    await loginAs(admin, baseURL, 'user-e2e-platform-admin')
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

    await loginAs(owner, baseURL, 'user-e2e-ncls-owner')
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
    const links = await linksResponse.json() as {
      page: { id: string }
      items: Array<{ id: string; label: string }>
    }
    expect(links.items).toHaveLength(2)

    await putLocalization(owner, 'site', siteId, {
      values: {
        brand_name: 'บริการกฎหมายไทยเพื่อทุกคน',
        brand_description: 'คำแนะนำทางกฎหมายที่ชัดเจนและเข้าถึงได้',
      },
    })
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
          type: 'offering_grid',
          position: 1,
          data: { section: 'services', source: 'site_offerings' },
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

    const localizedServicesResponse = await owner.get(`/api/public/sites/${siteId}/localized-pages/${locale}?path=${encodeURIComponent('/services')}`)
    await expectStatus(localizedServicesResponse, 200)
    const localizedServices = await localizedServicesResponse.json() as { page: { blocks: unknown[] } }
    expect(JSON.stringify(localizedServices.page.blocks)).toContain('กฎหมายครอบครัวภาษาไทย')

    await putLocalization(owner, 'site_link_page', links.page.id, {
      route_path: '/th/links',
      values: {
        title: 'ลิงก์ที่มีประโยชน์',
        seo_title: 'ลิงก์ที่มีประโยชน์',
        seo_description: 'ลิงก์กฎหมายภาษาไทย',
      },
    })
    await Promise.all(links.items.map((item, index) => putLocalization(owner, 'site_link_item', item.id, {
      values: { label: index === 0 ? 'บริการกฎหมายครอบครัวเก่า' : 'ติดต่อทีมงานเก่า' },
    })))

    const primedLinks = await openTenantPage(page, `${blawbyBaseURL}/th/links`, blawbyExtraHeaders)
    expect(primedLinks?.status()).toBeLessThan(400)
    await expect(page.locator('main')).toContainText('บริการกฎหมายครอบครัวเก่า')

    const dashboardContext = await browser.newContext({ baseURL, storageState: await owner.storageState() })
    try {
      const cms = await dashboardContext.newPage()
      await cms.goto(`${baseURL}/dashboard/north-carolina-legal-services/sites/ncls/links`)
      await expect(cms.getByTestId('links-translation-locale')).toHaveValue(locale)
      await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์ที่มีประโยชน์')
      await cms.getByTestId('links-translation-title').fill('ลิงก์กฎหมายภาษาไทย')
      await cms.getByTestId('links-translation-seo-title').fill('ลิงก์กฎหมายภาษาไทย')
      await cms.getByTestId('links-translation-seo-description').fill('ลิงก์ที่ผ่านการตรวจสอบสำหรับผู้อ่านภาษาไทย')
      const pageTranslationSave = await Promise.all([
        cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/site_link_page/${links.page.id}/th`)),
        cms.getByTestId('links-save-page-translation').click(),
      ]).then(([response]) => response)
      expect(pageTranslationSave.status()).toBe(200)

      const translatedLabels = ['บริการกฎหมายครอบครัว', 'ติดต่อทีมงานของเรา']
      for (const [index, item] of links.items.entries()) {
        const editor = cms.getByTestId(`links-item-translation-${item.id}`)
        await editor.getByTestId('links-item-translation-label').fill(translatedLabels[index]!)
        const itemTranslationSave = await Promise.all([
          cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/localization/site_link_item/${item.id}/th`)),
          editor.getByTestId('links-save-item-translation').click(),
        ]).then(([response]) => response)
        expect(itemTranslationSave.status()).toBe(200)
      }

      await cms.reload()
      await expect(cms.getByTestId('links-translation-title')).toHaveValue('ลิงก์กฎหมายภาษาไทย')
      for (const [index, item] of links.items.entries()) {
        await expect(cms.getByTestId(`links-item-translation-${item.id}`).getByTestId('links-item-translation-label')).toHaveValue(translatedLabels[index]!)
      }

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
    } finally {
      await dashboardContext.close()
    }

    await page.reload()
    await expect(page.locator('main')).toContainText('ลิงก์กฎหมายภาษาไทย')
    await expect(page.locator('main')).toContainText('บริการกฎหมายครอบครัว')
    await expect(page.locator('main')).toContainText('ติดต่อทีมงานของเรา')
    await expect(page.locator('a[href="/th/contact"]')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/Family law services|Contact our team/i)

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await expectExactThaiPage(page, '/th', '/', 'ความยุติธรรมสำหรับทุกคน', /Access to Justice for All/i)
      await expectExactThaiPage(page, '/th/services/family-th', '/services/family', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
      await expectExactThaiPage(page, '/th/services', '/services', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
      await expectExactThaiPage(page, '/th/blog', '/blog', 'บทความกฎหมาย', /Our Blog|Legal insights/i)
      await expect(page.locator('a[href="/th/article/will-th"]')).toBeVisible()
      await expectExactThaiPage(page, '/th/article/will-th', '/article/writing-your-own-will-how-it-works', 'คู่มือพินัยกรรมภาษาไทย', /Last Will and Testament in North Carolina/i)
    }
  } finally {
    await admin.dispose()
    await owner.dispose()
  }
})
