import { randomUUID } from 'node:crypto'
import { expect, test, type APIResponse } from '@playwright/test'
import { openTenantPage, potteryHouseBaseURL, potteryHouseExtraHeaders } from './helpers'
import { loginAs } from './helpers/auth'
import { acquireTenantMutationLock } from './helpers/tenant-mutation-lock'
import { E2E_KIKUZUKI_ORGANIZATION_ID, kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders, testBaseUrl } from './test-env'

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

test('Mali saves through Brand and renders for its tenant before hydration', async ({ browser, playwright }) => {
  // A dashboard save, four tenant pages and an isolation check run in sequence.
  test.setTimeout(120_000)
  const organizationId = E2E_KIKUZUKI_ORGANIZATION_ID
  const baseURL = testBaseUrl()
  const owner = await playwright.request.newContext({ baseURL })
  await loginAs(owner, baseURL, 'user-e2e-kikuzuki-owner')
  const settingsUrl = `/api/organizations/${organizationId}/settings`
  const initial = await owner.get(settingsUrl)
  await expectStatus(initial, 200)
  const original = (await initial.json() as { settings: { font_preset: 'default' | 'mali'; brand_color: string } }).settings
  const localePath = `/api/editor/organizations/${organizationId}/locales`
  const localesBefore = await owner.get(localePath)
  await expectStatus(localesBefore, 200)
  const patch = async (data: Record<string, unknown>) => expectStatus(await owner.patch(settingsUrl, { data }), 200)
  const dashboard = await browser.newContext({ baseURL, storageState: await owner.storageState(), viewport: { width: 1280, height: 900 } })
  try {
    await patch({ font_preset: 'default', brand_color: '' })
    const cms = await dashboard.newPage()
    const brandPath = `${baseURL}/dashboard/${organizationId}/brand/font`
    // The deployed dashboard DOES serve the Zaraz consent modal, whose
    // .cf_modal_container overlay intercepts pointer events until it is dismissed.
    // openTenantPage accepts it; plain goto left every click on this page blocked
    // in CI while passing locally, where Zaraz is absent.
    await openTenantPage(cms, brandPath, {})
    // 'load' and consent both resolve before Nuxt hydrates, and an unhydrated
    // Select trigger swallows the click silently: measured 0 options opened
    // without this wait, 2 with it, three runs each.
    await cms.waitForLoadState('networkidle')
    // The config sets no actionTimeout or navigationTimeout, so an unbounded click
    // on a control the page never rendered burns the whole test cap and reports
    // nothing. Every wait below names what it was waiting for instead.
    await cms.getByRole('combobox').click({ timeout: 30_000 })
    await cms.getByRole('option', { name: 'Mali (Thai and English)', exact: true }).click({ timeout: 30_000 })
    await expect(cms.getByTestId('site-font-preview')).toHaveCSS('font-family', /Mali/)
    const saved = await Promise.all([
      cms.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/api/dashboard/settings', { timeout: 60_000 }),
      cms.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 30_000 }),
    ]).then(([response]) => response)
    expect(saved.status(), await saved.text()).toBe(200)
    await expect(cms.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    const persisted = await owner.get(settingsUrl)
    await expectStatus(persisted, 200)
    expect(await persisted.json()).toMatchObject({ settings: { font_preset: 'mali', brand_color: '' } })
    await expectStatus(await owner.patch(settingsUrl, { data: { font_preset: 'https://example.com/font.css' } }), 400)
    await expectStatus(await owner.post(`${localePath}/th/add`), 200)

    for (const path of ['/', '/menu', '/th/reservations', '/contact']) {
      const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
      try {
        const page = await guest.newPage()
        const errors: string[] = []
        const fontUrls: string[] = []
        page.on('console', message => { if (/hydration.*mismatch|mismatch.*hydration/i.test(message.text())) errors.push(message.text()) })
        page.on('pageerror', error => errors.push(error.message))
        page.on('request', request => {
          const url = new URL(request.url())
          if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) errors.push(`External font request: ${url}`)
          if (url.pathname.includes('/assets/fonts/mali-')) fontUrls.push(request.url())
        })
        // Same reason as the cold samples: the SSR HTML cache is keyed by host
        // and a local tenant resolves by header, so a query string is how this
        // reads the preset it just saved.
        const response = await openTenantPage(page, `${kikuzukiTestBaseUrl()}${path}?sample=${randomUUID()}`, kikuzukiTestExtraHeaders())
        expect(response?.status(), path).toBe(200)
        const html = await response!.text()
        expect(html).toContain('data-font-preset="mali"')
        expect(html).toContain('--font-saya:')
        expect(html).toContain('@font-face{font-family:"Mali"')
        // `optional` is what keeps the swap from reflowing the page.
        expect(html).toContain('font-display:optional;src:url("/assets/fonts/mali-')
        await expect(page.locator('.tenant-layout')).toHaveAttribute('data-hydrated', 'true')
        await expect(page.locator('.tenant-layout')).toHaveCSS('font-family', /Mali/)
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        expect(fontUrls.some(url => url.includes('-latin-'))).toBe(true)
        if (path.startsWith('/th/')) expect(fontUrls.some(url => url.includes('-thai-'))).toBe(true)
        expect(await page.evaluate(() => Array.from(document.fonts).some(font => font.family.replaceAll('"', '') === 'Mali' && font.status === 'loaded'))).toBe(true)
        for (const url of new Set(fontUrls)) {
          expect(new URL(url).origin).toBe(new URL(kikuzukiTestBaseUrl()).origin)
          const font = await guest.request.get(url, { headers: kikuzukiTestExtraHeaders() })
          await expectStatus(font, 200)
          expect(font.headers()['cache-control']).toMatch(/max-age=31536000/)
          expect(Array.from((await font.body()).subarray(0, 4))).toEqual([0x77, 0x4f, 0x46, 0x32])
        }
        expect(errors).toEqual([])
      } finally { await guest.close() }
    }

    const other = await browser.newContext()
    try {
      const page = await other.newPage()
      const fonts: string[] = []
      page.on('request', request => { if (request.url().includes('/assets/fonts/mali-')) fonts.push(request.url()) })
      const response = await openTenantPage(page, `${potteryHouseBaseURL}/`, potteryHouseExtraHeaders)
      expect(response?.status()).toBe(200)
      expect(await response!.text()).not.toContain('@font-face{font-family:"Mali"')
      await expect(page.locator('.tenant-layout')).toHaveAttribute('data-font-preset', 'default')
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      expect(fonts).toEqual([])
    } finally { await other.close() }

    await patch({ font_preset: 'default' })
    const reset = await playwright.request.newContext({ extraHTTPHeaders: kikuzukiTestExtraHeaders() })
    try {
      const response = await reset.get(`${kikuzukiTestBaseUrl()}/contact?sample=${randomUUID()}`)
      await expectStatus(response, 200)
      expect(await response.text()).toContain('data-font-preset="default"')
      expect(await response.text()).not.toContain('@font-face{font-family:"Mali"')
    } finally { await reset.dispose() }
  } finally {
    const assertRestored = await restoreAll([
      ['font_preset and brand_color', () => owner.patch(settingsUrl, { data: { font_preset: original.font_preset, brand_color: original.brand_color } })],
    ])
    await dashboard.close()
    await owner.dispose()
    assertRestored()
  }
})
