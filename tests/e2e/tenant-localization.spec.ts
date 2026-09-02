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
  input: { pageId: string; path: string; title: string; summary: string },
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
      blocks: [{
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

test('published Thai home, offering, and article render exact CMS content', async ({ page, playwright }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_PREVIEW_URL), 'localization authoring uses disposable local D1 only')

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

    await putLocalization(owner, 'site', siteId, {
      values: {
        brand_name: 'บริการกฎหมายไทยเพื่อทุกคน',
        brand_description: 'คำแนะนำทางกฎหมายที่ชัดเจนและเข้าถึงได้',
      },
    })
    await Promise.all([
      createPageVariant(owner, {
        pageId: 'page_ncls_home',
        path: '/',
        title: 'ความยุติธรรมสำหรับทุกคน',
        summary: 'บริการกฎหมายภาษาไทยที่เข้าใจง่าย',
      }),
      createPageVariant(owner, {
        pageId: 'page_ncls_services',
        path: '/services',
        title: 'บริการกฎหมายของเรา',
        summary: 'เลือกบริการที่ตรงกับความต้องการของคุณ',
      }),
      createPageVariant(owner, {
        pageId: 'page_ncls_blog',
        path: '/blog',
        title: 'บทความกฎหมาย',
        summary: 'ความรู้ทางกฎหมายสำหรับผู้อ่านภาษาไทย',
      }),
    ])
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

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await expectExactThaiPage(page, '/th', '/', 'ความยุติธรรมสำหรับทุกคน', /Access to Justice for All/i)
      await expectExactThaiPage(page, '/th/services/family-th', '/services/family', 'กฎหมายครอบครัวภาษาไทย', /Empower your family to move forward confidently/i)
      await expectExactThaiPage(page, '/th/article/will-th', '/article/writing-your-own-will-how-it-works', 'คู่มือพินัยกรรมภาษาไทย', /Last Will and Testament in North Carolina/i)
    }
  } finally {
    await admin.dispose()
    await owner.dispose()
  }
})
