import { expect, test, type APIResponse } from '@playwright/test'
import { openTenantPage } from './helpers'
import { loginAs } from './helpers/auth'
import { acquireTenantMutationLock } from './helpers/tenant-mutation-lock'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders, testBaseUrl } from './test-env'

async function expectStatus(response: APIResponse, status: number) {
  expect(response.status(), await response.text()).toBe(status)
}

let releaseTenantMutationLock: (() => Promise<void>) | undefined

test.beforeAll(async ({ browser: _browser }, testInfo) => {
  test.setTimeout(700_000)
  releaseTenantMutationLock = await acquireTenantMutationLock(testInfo, 'site-kikuzuki')
})

test.afterAll(async () => {
  await releaseTenantMutationLock?.()
})

// A restore that fails must not skip the restores after it, or the context
// disposal. These specs mutate shared preview state, so a half-restored tenant
// breaks the next run rather than this one; report the failure after cleanup.
async function restoreAll(steps: Array<[string, () => Promise<APIResponse>]>) {
  // Read status and body now: disposing the request context invalidates every
  // response it produced, and disposal has to happen before these are asserted.
  const results: Array<{ name: string; status?: number; body?: string; error?: unknown }> = []
  for (const [name, run] of steps) {
    try {
      const response = await run()
      results.push({ name, status: response.status(), body: await response.text() })
    } catch (error) {
      results.push({ name, error })
    }
  }
  return () => {
    for (const result of results) {
      expect(result.error, `restoring ${result.name} threw`).toBeUndefined()
      if (result.status !== undefined) expect(result.status, `restoring ${result.name}: ${result.body}`).toBe(200)
    }
  }
}

test('Japanese is a second secondary language and keeps its public shell through hydration', async ({ playwright, page }) => {
  test.setTimeout(180_000)
  const siteId = 'site-kikuzuki'
  const baseURL = testBaseUrl()
  const owner = await playwright.request.newContext({ baseURL })
  await loginAs(owner, baseURL, 'user-e2e-kikuzuki-owner')
  const localePath = `/api/editor/sites/${siteId}/locales`
  const settingsUrl = `/api/sites/${siteId}/settings`
  const originalSettingsResponse = await owner.get(settingsUrl)
  await expectStatus(originalSettingsResponse, 200)
  const originalFontPreset = (await originalSettingsResponse.json() as { settings: { font_preset: 'default' | 'mali' } }).settings.font_preset
  const hydrationErrors: string[] = []
  page.on('console', message => {
    if (/hydration.*mismatch|mismatch.*hydration/i.test(message.text())) hydrationErrors.push(message.text())
  })
  page.on('pageerror', error => hydrationErrors.push(error.message))

  try {
    // Adding a language does not make it public. It is the authoring state,
    // so the site keeps serving only what it already published while the
    // translation is written.
    await expectStatus(await owner.post(`${localePath}/th/add`), 200)
    await expectStatus(await owner.post(`${localePath}/ja/add`), 200)
    await expectStatus(await owner.patch(settingsUrl, { data: { font_preset: 'mali' } }), 200)
    // Adding twice is the same add.
    await expectStatus(await owner.post(`${localePath}/ja/add`), 200)
    const added = await owner.get(localePath)
    await expectStatus(added, 200)
    const settings = await added.json() as { languages: Array<{ locale: string; status: string }> }
    expect(settings.languages.find(language => language.locale === 'ja')?.status).toBe('disabled')


    await expectStatus(await owner.put(`/api/editor/sites/${siteId}/localization/site/${siteId}/ja`, {
      data: { values: { brand_name: '菊月 クラビ', brand_description: 'クラビの日本料理店' } },
    }), 200)
    await expectStatus(await owner.put(`/api/editor/sites/${siteId}/localization/business_location/loc-kikuzuki/ja`, {
      data: {
        route_path: '/ja/locations/kikuzuki-japanese-robatayaki-izakaya',
        values: {
          title: '菊月 炉端焼き・居酒屋',
          address: { addressLines: ['325'], sublocality: 'アオナン', locality: 'クラビ' },
          description: 'クラビの日本料理店', short_description: '炉端焼きと寿司',
        },
      },
    }), 200)

    // A locale shows exactly what has been translated into it: a product with
    // no ja row is absent from /ja, not shown in English. Kikuzuki's one
    // bookable product carries /experiences, so without a ja row that route is
    // an empty collection and 404s by design -- which is what CI measured once
    // experiences became a surface of their own. Translate every bookable
    // product the site actually has, by its own id, the way the Thai journey
    // translates its sushi.
    const productsResponse = await owner.get(`/api/editor/sites/${siteId}/products`)
    await expectStatus(productsResponse, 200)
    const { products } = await productsResponse.json() as { products: Array<{ id: string; slug: string; booking: unknown | null }> }
    const bookable = products.filter(product => product.booking !== null)
    expect(bookable.map(product => product.slug), 'Kikuzuki has one bookable product to translate').toEqual(['teppanyaki-experience'])
    const japaneseExperience = { name: '鉄板焼き体験', description: 'シェフの目の前で楽しむ鉄板焼き', tags: [] as string[] }
    await expectStatus(await owner.put(`/api/editor/sites/${siteId}/localization/product/${bookable[0]!.id}/ja`, {
      data: { values: japaneseExperience },
    }), 200)

    // An added language is not public, which is the whole point of adding
    // before publishing: the routes stay 404 until the translation is finished
    // and the owner publishes it.
    for (const path of ['/ja/reservations', '/ja/contact', '/ja/experiences']) {
      const response = await page.request.get(`${kikuzukiTestBaseUrl()}${path}`, { headers: kikuzukiTestExtraHeaders() })
      expect(response.status(), path).toBe(404)
    }

    // English keeps serving while ja is being written.
    await openTenantPage(page, `${kikuzukiTestBaseUrl()}/reservations`, kikuzukiTestExtraHeaders())
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.tenant-layout')).toHaveAttribute('data-font-preset', 'mali')
    expect(hydrationErrors).toEqual([])

    await expectStatus(await owner.post(`${localePath}/ja/disable`), 200)
    const remaining = await owner.get(localePath)
    await expectStatus(remaining, 200)
    const after = await remaining.json() as { languages: Array<{ locale: string; status: string }> }
    expect(after.languages.filter(language => language.status === 'published').map(language => language.locale).sort()).toEqual(['en', 'th'])
    await openTenantPage(page, `${kikuzukiTestBaseUrl()}/reservations`, kikuzukiTestExtraHeaders())
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('link', { name: 'Reserve a table' }).first()).toBeVisible()
  } finally {
    // Adding a language takes no public slot and leaves an already-published
    // one alone, so only ja — the language this test made public or not — has
    // anything to put back.
    const assertRestored = await restoreAll([
      ['the ja locale', () => owner.post(`${localePath}/ja/disable`)],
      ['font_preset', () => owner.patch(settingsUrl, { data: { font_preset: originalFontPreset } })],
    ])
    await owner.dispose()
    assertRestored()
  }
})
