import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { openTenantPage } from './helpers'
import { loginAs } from './helpers/auth'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders, testBaseUrl } from './test-env'

const siteId = 'site-kikuzuki'
const locale = 'th'

async function expectStatus(response: APIResponse, expected: number) {
  const body = response.status() === expected ? '' : await response.text()
  expect(response.status(), body).toBe(expected)
}

async function putLocalization(
  request: APIRequestContext,
  resourceType: string,
  resourceId: string,
  body: Record<string, unknown>,
) {
  await expectStatus(await request.put(
    `/api/editor/sites/${siteId}/localization/${resourceType}/${resourceId}/${locale}`,
    { data: body },
  ), 200)
}

async function expectLocalizedMenu(page: Page) {
  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true')
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.getByRole('navigation', { name: 'การนำทางหลัก' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'การนำทางหลัก' }).getByRole('link', { name: 'เมนู', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'จองโต๊ะ' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kikuzuki กระบี่ ประเทศไทย' })).toBeVisible()
  const sushiCategories = page.getByRole('button', { name: 'ซูชิ', exact: true })
  await expect(sushiCategories).toHaveCount(2)
  for (const category of await sushiCategories.all()) await expect(category).toBeVisible()
  await expect(page.getByRole('link', { name: 'ซูชิทูน่า' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /🇹🇭 th/ })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Tuna Sushi')
}

test.beforeAll(async ({ playwright }, testInfo) => {
  testInfo.setTimeout(120_000)
  const baseURL = testBaseUrl()
  const owner = await playwright.request.newContext({ baseURL })
  await loginAs(owner, baseURL, 'user-e2e-kikuzuki-owner')

  try {
    await expectStatus(await owner.post(`/api/editor/sites/${siteId}/locales/${locale}/enable`), 200)

    await putLocalization(owner, 'site', siteId, {
      values: {
        brand_name: 'Kikuzuki กระบี่ ประเทศไทย',
        brand_description: 'อาหารญี่ปุ่นต้นตำรับในกระบี่',
      },
    })
    const locationResponse = await owner.get('/api/sites/site-kikuzuki/locations/loc-kikuzuki')
    await expectStatus(locationResponse, 200)
    expect(await locationResponse.json()).toMatchObject({
      location: {
        opening_hours: {
          periods: expect.arrayContaining([2, 3].map(day => ({
            open: { day, hour: 14, minute: 0 }, close: { day, hour: 23, minute: 0 },
          }))),
        },
      },
    })
    await putLocalization(owner, 'business_location', 'loc-kikuzuki', {
      route_path: '/th/locations/kikuzuki-japanese-robatayaki-izakaya',
      values: {
        title: 'Kikuzuki โรบาตายากิและอิซากายะญี่ปุ่น',
        address: '325 ตำบลอ่าวนาง กระบี่ 81180 ประเทศไทย',
        city: 'ตำบลอ่าวนาง',
        description: 'ร้านอาหารญี่ปุ่นใจกลางกระบี่',
        short_description: 'โรบาตายากิและซูชิในอ่าวนาง',
      },
    })
    // Menu sections are collections now; their names localize on the collection.
    await putLocalization(owner, 'collection', 'collection-kikuzuki-sushi', {
      values: { name: 'ซูชิ' },
    })
    await putLocalization(owner, 'product', 'item-kiku-tuna-sushi', {
      route_path: '/th/locations/kikuzuki-japanese-robatayaki-izakaya/menu/tuna-sushi',
      values: {
        name: 'ซูชิทูน่า',
        description: 'ทูน่า',
        tags: [],
      },
    })
  } finally {
    await owner.dispose()
  }
})

test('Kikuzuki keeps its Thai shell and collection translations on a hard load', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const response = await openTenantPage(page, `${kikuzukiTestBaseUrl()}/th/menu`, kikuzukiTestExtraHeaders())
  expect(response?.status()).toBeLessThan(400)
  await expectLocalizedMenu(page)
  await page.reload()
  await expectLocalizedMenu(page)

  await page.getByRole('button', { name: /🇹🇭 th/ }).click()
  await page.getByRole('menuitem', { name: /🇺🇸/ }).click()
  await expect(page).toHaveURL(`${kikuzukiTestBaseUrl()}/menu`)
  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tuna Sushi' }).first()).toBeVisible()

  await page.getByRole('button', { name: /🇺🇸 en/ }).click()
  await page.getByRole('menuitem', { name: /🇹🇭/ }).click()
  await expect(page).toHaveURL(`${kikuzukiTestBaseUrl()}/th/menu`)
  await expectLocalizedMenu(page)

  const contactResponse = await openTenantPage(page, `${kikuzukiTestBaseUrl()}/th/contact`, kikuzukiTestExtraHeaders())
  expect(contactResponse?.status()).toBeLessThan(400)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.getByText('ติดต่อเรา', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /🇹🇭 th/ })).toBeVisible()
  expect(errors.filter(message => message.includes('Localized route representation was not found'))).toEqual([])

  const locationPageResponse = await openTenantPage(
    page,
    `${kikuzukiTestBaseUrl()}/th/locations/kikuzuki-japanese-robatayaki-izakaya`,
    kikuzukiTestExtraHeaders(),
  )
  expect(locationPageResponse?.status()).toBeLessThan(400)
  for (const day of ['วันอังคาร', 'วันพุธ']) {
    const hoursRow = page.getByText(day, { exact: true }).locator('..')
    await expect(hoursRow).toContainText('14:00')
    await expect(hoursRow).toContainText('23:00')
  }

  for (const path of ['/th/reservations', '/th/menu']) {
    const builtInResponse = await openTenantPage(page, `${kikuzukiTestBaseUrl()}${path}`, kikuzukiTestExtraHeaders())
    expect(builtInResponse?.status()).toBeLessThan(400)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('navigation', { name: 'การนำทางหลัก' }).getByRole('link', { name: 'เมนู', exact: true })).toBeVisible()
  }
})


test('Kikuzuki Localize preserves its translated address', async ({ browser, playwright }) => {
  test.setTimeout(90_000)
  const baseURL = testBaseUrl()
  const owner = await playwright.request.newContext({ baseURL })
  try {
    await loginAs(owner, baseURL, 'user-e2e-kikuzuki-owner')
    const dashboardContext = await browser.newContext({ baseURL, storageState: await owner.storageState() })
    const cms = await dashboardContext.newPage()
    try {
      // The settings level, not a `profile` section: that one leaf became
      // name, slug, address, contact and status, and the level's own navbar is
      // what carries Localize either way.
      await openTenantPage(cms, `${baseURL}/dashboard/org-bVY8SxxUuG6Ctk2CQnfCk8T2cPsj4jJX/sites/kikuzuki-krabi-thailand/locations/kikuzuki-japanese-robatayaki-izakaya/settings`, {})
      await cms.getByTestId('localize-resource').click()
      await cms.getByTestId('localize-language').click()
      await cms.getByRole('option', { name: /ไทย \(th\)/ }).click()
      const address = cms.getByTestId('localize-field-address')
      await expect(address).toHaveValue('325 ตำบลอ่าวนาง กระบี่ 81180 ประเทศไทย')
      const saveResponse = await Promise.all([
        cms.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/localization/business_location/loc-kikuzuki/th')),
        cms.getByTestId('localize-save').click(),
      ]).then(([response]) => response)
      expect(saveResponse.status()).toBe(200)
      const payload = saveResponse.request().postDataJSON() as { values: { address: unknown } }
      expect(payload.values.address).toBe('325 ตำบลอ่าวนาง กระบี่ 81180 ประเทศไทย')
    } finally {
      await cms.close()
      await dashboardContext.close()
    }
  } finally {
    await owner.dispose()
  }
})
