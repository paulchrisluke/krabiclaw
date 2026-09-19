import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL, blawbyExtraHeaders,
  openTenantPage, potteryHouseBaseURL, potteryHouseExtraHeaders, waitForNuxtHydration,
} from './helpers'
import { testBaseUrl } from './test-env'

// Two tenants stand in for the two shells this renderer produces: Pottery
// House on .tenant-layout and NCLS on .blawby-shell. Kikuzuki renders through
// the same Saya shell as Pottery and is exercised by tenant-client-navigation,
// tenant-guest-journeys, and kikuzuki-localization, so repeating the generic
// render matrix for it proves nothing the Pottery pass does not.
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
  // The shell's own theme token, asserted to survive hydration. Saya and
  // blawby name theirs differently.
  themeVar: string
}

const tenants: Tenant[] = [
  {
    name: 'Pottery House', baseURL: potteryHouseBaseURL, headers: potteryHouseExtraHeaders,
    shell: '.tenant-layout', identity: /Pottery House/i, definingContent: /pottery|wheel|clay/i,
    primaryLabel: /product|class|book/i, detailPath: '/locations/krabi/products/pottery-wheel-class',
    detailContent: /Pottery Wheel Class/i, themeVar: '--saya-bg',
    forbidden: [/Come dine with us/i, /Reserve a table/i, /From the kitchen/i, /Also part of Saya/i],
  },
  {
    name: 'North Carolina Legal Services', baseURL: blawbyBaseURL, headers: blawbyExtraHeaders,
    shell: '.blawby-shell', identity: /North Carolina Legal Services/i,
    definingContent: /Access to Justice|affordable legal services/i,
    primaryLabel: /services|get started|consultation/i, detailPath: '/services/family',
    detailContent: /Family Law|child custody|divorce/i, themeVar: '--ui-bg',
    forbidden: [/Ember & Slice/i, /No services/i],
  },
]

async function expectTenantDocument(page: Page, tenant: Tenant) {
  await expect(page.locator(tenant.shell)).toBeVisible()
  await expect(page.locator('header').getByRole('link', { name: tenant.identity }).first()).toBeVisible()
  await expect(page.locator('main')).toContainText(tenant.definingContent)
  await expect(page.locator('footer')).toBeVisible()
  await expect(page.locator('footer')).not.toBeEmpty()
  await expect(page.getByRole('link', { name: tenant.primaryLabel }).first()).toBeVisible()
  // Authored media has to arrive, not merely be referenced: a placement that
  // lost its asset still renders an <img> with a src that 404s.
  const media = page.locator([
    'img[src*="media.krabiclaw.com"]',
    'video[src*="media.krabiclaw.com"]',
    'img[src*="imagedelivery.net"]',
    'video[src*="imagedelivery.net"]',
  ].join(', ')).first()
  await expect(media).toBeVisible()
  for (const text of tenant.forbidden) await expect(page.locator('body')).not.toContainText(text)
  await page.waitForFunction(() => Boolean(
    (document.querySelector('#__nuxt') as (Element & { __vue_app__?: unknown }) | null)?.__vue_app__,
  ))
}

test('KrabiClaw home retains its billing plans after hydration', async ({ page }) => {
  const baseURL = testBaseUrl()
  const response = await openTenantPage(page, `${baseURL}/`, {})
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
  await expect(page.getByRole('heading', { name: 'Starter', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Growth', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get Growth', exact: true })).toHaveAttribute('href', '/signup?plan=growth')
})

for (const tenant of tenants) {
  test(`${tenant.name} renders home and detail routes on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const response = await openTenantPage(page, `${tenant.baseURL}/`, tenant.headers)
    expect(response?.status()).toBeLessThan(400)
    expect(new URL(page.url()).origin).toBe(new URL(tenant.baseURL).origin)
    await expectTenantDocument(page, tenant)
    const route = await page.goto(`${tenant.baseURL}${tenant.detailPath}`, { waitUntil: 'load' })
    expect(route?.status()).toBeLessThan(400)
    await expect(page.locator('main')).toContainText(tenant.detailContent)
    await expect(page.locator(tenant.shell)).toBeVisible()
    // The tenant's own theme tokens must survive hydration; losing them
    // repaints the detail page in the platform default mid-load.
    await expect(page.locator(tenant.shell)).not.toHaveCSS(tenant.themeVar, '')
    for (const text of tenant.forbidden) await expect(page.locator('body')).not.toContainText(text)
  })
}

test('an English-only tenant does not classify one-segment CMS paths as locales', async ({ page }) => {
  for (const path of ['/th', '/th/about', '/th/products', '/th/links']) {
    const response = await openTenantPage(page, `${potteryHouseBaseURL}${path}`, potteryHouseExtraHeaders)
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('body')).not.toContainText(/เนื้อหาภาษาไทย/)
  }
})

test.describe('NCLS representative journeys', () => {
  test.describe.configure({ mode: 'default' })

  // What the navigation says, not how it lays out: whether it wraps or overflows
  // is what a browser at that width shows you in a second.
  test('header and footer carry the site\'s navigation', async ({ page }) => {
    await openTenantPage(page, `${blawbyBaseURL}/`, blawbyExtraHeaders)
    for (const label of ['Services', 'Pricing', 'About', 'Contact', 'Blog', 'Donate'])
      await expect(page.locator('header').getByRole('link', { name: label, exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 900 })
    await page.locator('header summary').click()
    await expect(page.locator('header details').getByRole('link', { name: 'Services', exact: true })).toBeVisible()
    for (const label of ['Family law', 'Request a Legal Consultation', 'About', 'Privacy Policy'])
      await expect(page.locator('footer').getByRole('link', { name: label, exact: true })).toBeVisible()
  })

  // One reader walking the site. Each route is a different page recipe, so the
  // traversal is the coverage; six separate fixtures were not.
  test('renders every route reachable from the header', async ({ page }) => {
    test.setTimeout(90_000)
    for (const journey of [
      { path: '/pricing', text: /pricing|income|calculator/i },
      { path: '/article/writing-your-own-will-how-it-works', text: /will|North Carolina/i },
      { path: '/contact', text: /contact|message/i },
      { path: '/schedule', text: /consultation|schedule/i },
      { path: '/blog', text: /blog|legal/i },
      { path: '/donate', text: /donate|support/i },
    ]) {
      const response = await openTenantPage(page, `${blawbyBaseURL}${journey.path}`, blawbyExtraHeaders)
      expect(response?.status(), journey.path).toBeLessThan(400)
      await expect(page.locator('main'), journey.path).toContainText(journey.text)
    }
  })
})
