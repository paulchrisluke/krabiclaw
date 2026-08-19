import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL,
  blawbyExtraHeaders,
  potteryHouseBaseURL,
  potteryHouseExtraHeaders,
  collectPageErrors,
  expectHealthyPage,
  setupTenantHeaders,
} from './helpers'
import {
  KIKUZUKI_CANONICAL_URL,
  NCLS_CANONICAL_URL,
  POTTERY_HOUSE_CANONICAL_URL,
  kikuzukiTestBaseUrl,
  kikuzukiTestExtraHeaders,
  testBaseUrl,
} from './test-env'

const isProductionRun = ['krabiclaw.com', 'www.krabiclaw.com'].includes(new URL(testBaseUrl()).hostname)

const journeys = [
  {
    name: 'Pottery House',
    baseURL: potteryHouseBaseURL,
    productionBaseURL: POTTERY_HOUSE_CANONICAL_URL,
    headers: potteryHouseExtraHeaders,
    shell: '.tenant-layout',
    themeVariable: '--saya-bg',
    link: '/experiences',
    content: /Pottery|Experience/i,
  },
  {
    name: 'Kikuzuki',
    baseURL: kikuzukiTestBaseUrl(),
    productionBaseURL: KIKUZUKI_CANONICAL_URL,
    headers: kikuzukiTestExtraHeaders(),
    shell: '.tenant-layout',
    themeVariable: '--saya-bg',
    link: '/reservations',
    content: /Reservation/i,
  },
  {
    name: 'North Carolina Legal Services',
    baseURL: blawbyBaseURL,
    productionBaseURL: NCLS_CANONICAL_URL,
    headers: blawbyExtraHeaders,
    shell: '.blawby-shell',
    themeVariable: '--blawby-bg',
    link: '/pricing',
    content: /Pricing|affordable/i,
  },
] as const

function collectFirstPartyErrors(page: Page, baseURL: string) {
  const errors = collectPageErrors(page)
  const origin = new URL(baseURL).origin
  page.on('response', (response) => {
    if (new URL(response.url()).origin === origin && response.status() >= 400) {
      errors.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })
  return errors
}

function expectFinalOrigin(page: Page, baseURL: string, journeyName: string) {
  expect(new URL(page.url()).origin, `${journeyName} final origin`).toBe(new URL(baseURL).origin)
}

for (const journey of journeys) {
  test(`${journey.name} deployed home navigation keeps real content and styles`, async ({ page }) => {
    if (isProductionRun) {
      expect(journey.baseURL, `${journey.name} production URL`).toBe(journey.productionBaseURL)
      expect(journey.headers, `${journey.name} production headers`).toEqual({})
    }
    await setupTenantHeaders(page, journey.baseURL, journey.headers)
    const errors = collectFirstPartyErrors(page, journey.baseURL)
    const response = await page.goto(`${journey.baseURL}/`, { waitUntil: 'load' })
    expect(response?.status(), journey.name).toBeLessThan(400)
    expectFinalOrigin(page, journey.baseURL, journey.name)
    await expect(page.locator(journey.shell)).toBeVisible()
    await expect(page.locator(journey.shell)).not.toHaveCSS(journey.themeVariable, '')

    const routeResponse = await page.goto(`${journey.baseURL}${journey.link}`, { waitUntil: 'load' })
    expect(routeResponse?.status(), `${journey.name} ${journey.link}`).toBeLessThan(400)

    await expect(page).toHaveURL(new RegExp(`${journey.link}/?$`))
    expectFinalOrigin(page, journey.baseURL, journey.name)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('main')).toContainText(journey.content)
    await expect(page.locator(journey.shell)).not.toHaveCSS(journey.themeVariable, '')
    await expectHealthyPage(page, errors)
  })
}
