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
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

const journeys = [
  {
    name: 'Pottery House',
    baseURL: potteryHouseBaseURL,
    headers: potteryHouseExtraHeaders,
    shell: '.tenant-layout',
    themeVariable: '--saya-bg',
    link: '/experiences',
    content: /Pottery|Experience/i,
  },
  {
    name: 'Kikuzuki',
    baseURL: kikuzukiTestBaseUrl(),
    headers: kikuzukiTestExtraHeaders(),
    shell: '.tenant-layout',
    themeVariable: '--saya-bg',
    link: '/reservations',
    content: /Reservation/i,
  },
  {
    name: 'North Carolina Legal Services',
    baseURL: blawbyBaseURL,
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

test('deployed tenant home navigation keeps real content and styles', async ({ page }) => {
  for (const journey of journeys) {
    await setupTenantHeaders(page, journey.baseURL, journey.headers)
    const errors = collectFirstPartyErrors(page, journey.baseURL)
    const response = await page.goto(`${journey.baseURL}/`, { waitUntil: 'load' })
    expect(response?.status(), journey.name).toBeLessThan(400)
    await expect(page.locator(journey.shell)).toBeVisible()
    await expect(page.locator(journey.shell)).not.toHaveCSS(journey.themeVariable, '')

    const link = page.locator(`a[href="${journey.link}"]`).first()
    await expect(link, `${journey.name} ${journey.link} navigation`).toBeVisible()
    await link.click()

    await expect(page).toHaveURL(new RegExp(`${journey.link}/?$`))
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('main')).toContainText(journey.content)
    await expect(page.locator(journey.shell)).not.toHaveCSS(journey.themeVariable, '')
    await expectHealthyPage(page, errors)
  }
})
