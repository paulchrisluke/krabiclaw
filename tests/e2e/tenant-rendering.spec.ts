import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL, blawbyExtraHeaders, collectPageErrors,
  openTenantPage, potteryHouseBaseURL, potteryHouseExtraHeaders,
} from './helpers'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

type Tenant = {
  name: string
  baseURL: string
  headers: Record<string, string>
  shell: string
  identity: RegExp
  definingContent: RegExp
  primaryLabel: RegExp
  detailPath: string
  detailContent: RegExp
  forbidden: RegExp[]
}

const tenants: Tenant[] = [
  {
    name: 'Pottery House', baseURL: potteryHouseBaseURL, headers: potteryHouseExtraHeaders,
    shell: '.tenant-layout', identity: /Pottery House/i, definingContent: /pottery|wheel|clay/i,
    primaryLabel: /experience|class|book/i, detailPath: '/experiences/pottery-wheel-class',
    detailContent: /Pottery Wheel Class/i,
    forbidden: [/Come dine with us/i, /Reserve a table/i, /From the kitchen/i, /Also part of Saya/i],
  },
  {
    name: 'Kikuzuki', baseURL: kikuzukiTestBaseUrl(), headers: kikuzukiTestExtraHeaders(),
    shell: '.tenant-layout', identity: /Kikuzuki/i,
    definingContent: /Japanese|Robatayaki|Izakaya|寿司|อาหารญี่ปุ่น/i,
    primaryLabel: /menu|เมนู|reservation|จอง/i,
    detailPath: '/locations/kikuzuki-japanese-robatayaki-izakaya/menu/tuna-sushi',
    detailContent: /Tuna Sushi/i, forbidden: [/Ember & Slice/i, /Menu coming soon/i],
  },
  {
    name: 'North Carolina Legal Services', baseURL: blawbyBaseURL, headers: blawbyExtraHeaders,
    shell: '.blawby-shell', identity: /North Carolina Legal Services/i,
    definingContent: /Access to Justice|affordable legal services/i,
    primaryLabel: /services|get started|consultation/i, detailPath: '/services/family',
    detailContent: /Family Law|child custody|divorce/i, forbidden: [/Ember & Slice/i, /No services/i],
  },
]

function collectFirstPartyFailures(page: Page, baseURL: string) {
  const failures = collectPageErrors(page, { failOnAllWarnings: true })
  const tenantOrigin = new URL(baseURL).origin
  page.on('response', response => {
    const url = new URL(response.url())
    if ((url.origin === tenantOrigin || url.hostname.endsWith('.krabiclaw.com')) && response.status() >= 400)
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`)
  })
  page.on('requestfailed', request => {
    const url = new URL(request.url())
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    if (url.origin === tenantOrigin || url.hostname.endsWith('.krabiclaw.com'))
      failures.push(`request failed ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  return failures
}

async function waitForNuxtHydration(page: Page) {
  await page.waitForFunction(() => Boolean(
    (document.querySelector('#__nuxt') as (Element & { __vue_app__?: unknown }) | null)?.__vue_app__,
  ))
}

async function expectTenantDocument(page: Page, tenant: Tenant) {
  await expect(page.locator(tenant.shell)).toBeVisible()
  await expect(page.locator('header').getByRole('link', { name: tenant.identity }).first()).toBeVisible()
  await expect(page.locator('main')).toContainText(tenant.definingContent)
  await expect(page.locator('footer')).toBeVisible()
  await expect(page.locator('footer')).not.toBeEmpty()
  await expect(page.getByRole('link', { name: tenant.primaryLabel }).first()).toBeVisible()
  await expect(page.locator([
    'img[src*="media.krabiclaw.com"]',
    'video[src*="media.krabiclaw.com"]',
    'img[src*="imagedelivery.net"]',
    'video[src*="imagedelivery.net"]',
  ].join(', ')).first()).toBeVisible()
  for (const text of tenant.forbidden) await expect(page.locator('body')).not.toContainText(text)
  const canonical = page.locator('link[rel="canonical"]')
  await expect(canonical).toHaveCount(1)
  expect(new URL(await canonical.getAttribute('href') ?? tenant.baseURL).origin).toBe(new URL(tenant.baseURL).origin)
  await expect(page.locator('link[rel~="icon"]')).not.toHaveCount(0)
  await waitForNuxtHydration(page)
}

for (const tenant of tenants) {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${tenant.name} renders and navigates on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const failures = collectFirstPartyFailures(page, tenant.baseURL)
      const manifestResponse = page.waitForResponse(response => response.url().includes('/_nuxt/builds/meta/'))
      const response = await openTenantPage(page, `${tenant.baseURL}/`, tenant.headers)
      expect(response?.status()).toBeLessThan(400)
      expect((await manifestResponse).status()).toBe(200)
      expect(new URL(page.url()).origin).toBe(new URL(tenant.baseURL).origin)
      await expectTenantDocument(page, tenant)
      const route = await page.goto(`${tenant.baseURL}${tenant.detailPath}`, { waitUntil: 'load' })
      expect(route?.status()).toBeLessThan(400)
      await expect(page.locator('main')).toContainText(tenant.detailContent)
      await expect(page.locator(tenant.shell)).toBeVisible()
      const jsonLd = page.locator('script[type="application/ld+json"]')
      await expect(jsonLd).not.toHaveCount(0)
      expect((await jsonLd.allTextContents()).join(' ')).toMatch(tenant.detailContent)
      for (const text of tenant.forbidden) await expect(page.locator('body')).not.toContainText(text)
      if (viewport.name === 'mobile') {
        const menuButton = page.getByRole('button', { name: /menu|navigation/i }).first()
        if (await menuButton.count()) {
          await menuButton.click()
          await expect(page.getByRole('link', { name: tenant.primaryLabel }).first()).toBeVisible()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      }
      expect(failures).toEqual([])
    })
  }
}

test('Pottery House preserves dark-theme hydration and booking context', async ({ page }) => {
  await openTenantPage(page, `${potteryHouseBaseURL}/experiences/pottery-wheel-class`, potteryHouseExtraHeaders)
  await expect(page.locator('.tenant-layout')).not.toHaveCSS('--saya-bg', '')
  await expect(page.locator('main')).toContainText(/Pottery Wheel Class/i)
  await expect(page.locator('#experience-booking-toggle').first()).toBeVisible()
  await page.waitForTimeout(250)
  await expect(page.locator('.tenant-layout')).not.toHaveCSS('--saya-bg', '')
})

test('Kikuzuki keeps customer identity, locations, and reservation entry point', async ({ page }) => {
  const baseURL = kikuzukiTestBaseUrl()
  await openTenantPage(page, `${baseURL}/menu`, kikuzukiTestExtraHeaders())
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('main')).toContainText(/Tuna Sushi|ซูชิ/i)
  await page.goto(`${baseURL}/locations`, { waitUntil: 'load' })
  await expect(page.locator('main')).toContainText(/Kikuzuki|Take Me Away/i)
  await page.goto(`${baseURL}/reservations`, { waitUntil: 'load' })
  await expect(page.locator('#reservation-booking-toggle').first()).toBeVisible()
})

test('Kikuzuki ordering menu uses the published catalog without replacing the SEO menu', async ({ page }) => {
  const baseURL = kikuzukiTestBaseUrl()
  await openTenantPage(page, `${baseURL}/order`, kikuzukiTestExtraHeaders())
  await expect(page.getByRole('region', { name: 'Ordering menu' })).toBeVisible()
  await expect(page.locator('main')).toContainText(/Tuna Sushi/i)
  await waitForNuxtHydration(page)
  await page.getByRole('searchbox', { name: 'Find a dish' }).fill('Tuna Sushi')
  await expect(page.locator('main')).toContainText(/Tuna Sushi/i)
  await page.getByRole('searchbox', { name: 'Find a dish' }).fill('no matching dish')
  await expect(page.locator('main')).toContainText('No dishes match this search.')

  await page.goto(`${baseURL}/menu`, { waitUntil: 'load' })
  await expect(page.locator('main')).toContainText(/Tuna Sushi/i)
  await expect(page.getByRole('region', { name: 'Ordering menu' })).toHaveCount(0)
})

test('NCLS exposes header, footer, pricing, article, contact, taxonomy, and donation journeys', async ({ page, context }) => {
  await openTenantPage(page, `${blawbyBaseURL}/`, blawbyExtraHeaders)
  for (const label of ['Services', 'Pricing', 'About', 'Contact', 'Blog', 'Donate'])
    await expect(page.locator('header').getByRole('link', { name: label, exact: true })).toBeVisible()
  for (const label of ['Family law', 'Request a Consultation', 'About', 'Privacy'])
    await expect(page.locator('footer').getByRole('link', { name: label, exact: true })).toBeVisible()
  await Promise.all([
    { path: '/pricing', text: /pricing|income|calculator/i },
    { path: '/article/writing-your-own-will-how-it-works', text: /will|North Carolina/i },
    { path: '/contact', text: /contact|message/i },
    { path: '/schedule', text: /consultation|schedule/i },
    { path: '/blog', text: /blog|legal/i },
    { path: '/donate', text: /donate|support/i },
  ].map(async (journey) => {
    const routePage = await context.newPage()
    try {
      const errors = collectPageErrors(routePage, { failOnAllWarnings: true })
      const response = await openTenantPage(routePage, `${blawbyBaseURL}${journey.path}`, blawbyExtraHeaders)
      expect(response?.status(), journey.path).toBeLessThan(400)
      await routePage.waitForTimeout(250)
      expect(errors, journey.path).toEqual([])
      await expect(routePage.locator('main')).toContainText(journey.text)
    } finally {
      await routePage.close()
    }
  }))
})
