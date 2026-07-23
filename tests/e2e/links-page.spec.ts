import { expect, test, type APIRequestContext } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders, collectPageErrors, expectHealthyPage, setupTenantHeaders, tenantBaseURL, tenantExtraHeaders } from './helpers'
import { loginAs } from './helpers/auth'
import { devLoginHeaders, devLoginUrl } from './test-env'

const DEMO_OWNER_USER_ID = 'user-demo'
const DEMO_SITE_ID = 'site-demo'
const DEMO_ORG_SLUG = 'ember-slice-demo'
const DEMO_SITE_SLUG = 'demo'

const BLAWBY_OWNER_USER_ID = 'user-ncls-blawby'
const BLAWBY_SITE_ID = 'site-ncls-blawby'

type LinkItemInput = {
  id?: string
  label: string
  destination: string
  description?: string | null
  icon?: string | null
  image_asset_id?: string | null
  sort_order?: number
  status?: 'active' | 'hidden'
}

function alphabeticSuffix() {
  return `run${Date.now().toString(36).replace(/\d/g, 'a')}`
}

async function saveLinksPage(request: APIRequestContext, baseURL: string, siteId: string, input: {
  title: string
  bio?: string | null
  status: 'draft' | 'published' | 'archived'
  robots?: string
  items: LinkItemInput[]
}) {
  const response = await request.patch(`${baseURL}/api/editor/sites/${siteId}/links-page`, {
    data: {
      page: {
        title: input.title,
        bio: input.bio ?? null,
        status: input.status,
        robots: input.robots ?? 'noindex,follow',
      },
      items: input.items.map((item, index) => ({
        ...item,
        sort_order: item.sort_order ?? index,
        status: item.status ?? 'active',
      })),
    },
  })
  expect(response.status()).toBe(200)
  return await response.json() as { page: { status: string }; items: Array<{ id: string; label: string }> }
}

async function resetLinksPage(request: APIRequestContext, baseURL: string, siteId: string, title = 'Links') {
  await saveLinksPage(request, baseURL, siteId, {
    title,
    status: 'draft',
    items: [],
  })
}

test.describe('tenant links page', () => {
  test.describe.configure({ mode: 'serial' })

  test('dashboard manages a site links page and the public Saya page tracks clicks', async ({ page, request, baseURL }) => {
    test.setTimeout(90_000)
    const errors = collectPageErrors(page)
    const suffix = alphabeticSuffix()
    const dashboardTitle = `Demo Links ${suffix}`
    const publicTitle = `Ember & Slice Links ${suffix}`
    const bookingLabel = `Book a table ${suffix}`
    const menuLabel = `View menu ${suffix}`
    const hiddenLabel = `Hidden promo ${suffix}`

    await loginAs(request, baseURL!, DEMO_OWNER_USER_ID)
    await resetLinksPage(request, baseURL!, DEMO_SITE_ID, 'Ember & Slice')

    try {
      await setupTenantHeaders(page, baseURL!, devLoginHeaders() || {})
      const login = await page.goto(devLoginUrl(baseURL!, DEMO_OWNER_USER_ID), { waitUntil: 'load' })
      expect(login?.status()).toBeLessThan(400)

      const dashboardResponse = await page.goto(`${baseURL}/dashboard/${DEMO_ORG_SLUG}/sites/${DEMO_SITE_SLUG}/links`, { waitUntil: 'load' })
      expect(dashboardResponse?.status()).toBeLessThan(400)
      await expect(page.getByRole('heading', { name: 'Links page' })).toBeVisible()

      await page.getByRole('textbox', { name: 'Links page title' }).fill(dashboardTitle)
      await page.getByRole('textbox', { name: 'Links page bio' }).fill('A compact link hub managed from the dashboard.')
      await page.getByRole('button', { name: 'Add link' }).click()
      await page.getByPlaceholder('Label').last().fill(menuLabel)
      await page.getByRole('textbox', { name: 'Link destination' }).last().fill('/menu')

      const saveResponse = page.waitForResponse(response =>
        response.url().includes(`/api/editor/sites/${DEMO_SITE_ID}/links-page`) && response.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: 'Save' }).click()
      expect((await saveResponse).status()).toBe(200)
      await expect(page.getByText('Links page saved', { exact: true })).toBeVisible()

      const editorState = await request.get(`${baseURL}/api/editor/sites/${DEMO_SITE_ID}/links-page`)
      expect(editorState.status()).toBe(200)
      const editorBody = await editorState.json() as { page: { title: string; status: string }; items: Array<{ label: string; destination: string }> }
      expect(editorBody.page.title).toBe(dashboardTitle)
      expect(editorBody.items).toEqual(expect.arrayContaining([expect.objectContaining({ label: menuLabel, destination: '/menu' })]))

      const published = await saveLinksPage(request, baseURL!, DEMO_SITE_ID, {
        title: publicTitle,
        bio: 'Fresh links from the kitchen.',
        status: 'published',
        items: [
          { label: bookingLabel, destination: '/links#featured-links', description: 'Reserve directly from the link page.', icon: 'calendar' },
          { label: menuLabel, destination: '/menu', description: 'See what is cooking.', icon: 'menu' },
          { label: hiddenLabel, destination: '/blog', status: 'hidden' },
        ],
      })
      const clickedItem = published.items.find(item => item.label === bookingLabel)
      expect(clickedItem?.id).toBeTruthy()

      await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
      await page.setViewportSize({ width: 390, height: 844 })
      const publicResponse = await page.goto(`${tenantBaseURL}/links`, { waitUntil: 'load' })
      expect(publicResponse?.status()).toBe(200)
      await expectHealthyPage(page, errors)
      await expect(page.getByRole('heading', { name: publicTitle })).toBeVisible()
      await expect(page.getByRole('link', { name: new RegExp(bookingLabel) })).toBeVisible()
      await expect(page.getByText(hiddenLabel)).toHaveCount(0)

      await page.getByRole('link', { name: new RegExp(bookingLabel) }).click()
      await expect(page).toHaveURL(`${tenantBaseURL}/links#featured-links`)

      const conversionResponse = await request.post(`${tenantBaseURL}/api/public/sites/${DEMO_SITE_ID}/conversion-events`, {
        headers: tenantExtraHeaders,
        data: {
          event_name: 'link_click',
          metadata: { link_item_id: clickedItem!.id },
        },
      })
      expect(conversionResponse.status()).toBe(201)

      await saveLinksPage(request, baseURL!, DEMO_SITE_ID, {
        title: publicTitle,
        status: 'draft',
        items: [{ label: bookingLabel, destination: '/links#featured-links' }],
      })
      const draftResponse = await request.get(`${tenantBaseURL}/links`, { headers: tenantExtraHeaders })
      expect(draftResponse.status()).toBe(404)
    } finally {
      await loginAs(request, baseURL!, DEMO_OWNER_USER_ID)
      await resetLinksPage(request, baseURL!, DEMO_SITE_ID, 'Ember & Slice')
    }
  })

  test('public Blawby links page uses the professional-service shell', async ({ page, request, baseURL }) => {
    test.setTimeout(60_000)
    const errors = collectPageErrors(page)
    await loginAs(request, baseURL!, BLAWBY_OWNER_USER_ID)
    const existing = await request.get(`${baseURL}/api/editor/sites/${BLAWBY_SITE_ID}/links-page`)
    test.skip(existing.status() === 404, 'NCLS Blawby fixture is not seeded in this environment')
    expect(existing.status()).toBe(200)

    const suffix = alphabeticSuffix()
    const title = `NCLS Links ${suffix}`
    const label = `Request help ${suffix}`

    try {
      await saveLinksPage(request, baseURL!, BLAWBY_SITE_ID, {
        title,
        bio: 'Key public legal-service links.',
        status: 'published',
        items: [{ label, destination: '/contact', description: 'Start with the contact page.', icon: 'message-circle' }],
      })

      await setupTenantHeaders(page, blawbyBaseURL, blawbyExtraHeaders)
      const response = await page.goto(`${blawbyBaseURL}/links`, { waitUntil: 'load' })
      expect(response?.status()).toBe(200)
      await expectHealthyPage(page, errors)
      await expect(page.locator('.blawby-shell[data-hydrated="true"]')).toBeVisible()
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await expect(page.getByRole('link', { name: new RegExp(label) })).toBeVisible()
    } finally {
      await loginAs(request, baseURL!, BLAWBY_OWNER_USER_ID)
      const cleanup = await request.get(`${baseURL}/api/editor/sites/${BLAWBY_SITE_ID}/links-page`)
      if (cleanup.status() === 200) await resetLinksPage(request, baseURL!, BLAWBY_SITE_ID, 'Links')
    }
  })
})
