import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL, blawbyExtraHeaders, collectPageErrors,
  openTenantPage, potteryHouseBaseURL, potteryHouseExtraHeaders,
} from './helpers'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

async function clientJourney(page: Page, options: {
  baseURL: string
  headers: Record<string, string>
  listPath: string
  detailPath: string
  detailText: RegExp
}) {
  const errors = collectPageErrors(page, { failOnAllWarnings: true })
  await openTenantPage(page, `${options.baseURL}/`, options.headers)
  await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true')
  await page.locator(`a[href="${options.listPath}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${options.listPath}/?$`))
  await page.locator(`a[href="${options.detailPath}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${options.detailPath}/?$`))
  await expect(page.locator('main')).toContainText(options.detailText)
  await page.waitForTimeout(250)
  await expect(page.locator('main')).toContainText(options.detailText)
  expect(errors).toEqual([])
}

test('Pottery home → experiences → experience detail', async ({ page }) => {
  await clientJourney(page, {
    baseURL: potteryHouseBaseURL, headers: potteryHouseExtraHeaders,
    listPath: '/experiences', detailPath: '/experiences/pottery-wheel-class', detailText: /Pottery Wheel Class/i,
  })
})

test('Kikuzuki home → menu → menu item', async ({ page }) => {
  await clientJourney(page, {
    baseURL: kikuzukiTestBaseUrl(), headers: kikuzukiTestExtraHeaders(),
    listPath: '/menu', detailPath: '/locations/kikuzuki-japanese-robatayaki-izakaya/menu/tuna-sushi', detailText: /Tuna Sushi/i,
  })
})

test('NCLS home → services → service detail', async ({ page }) => {
  await clientJourney(page, {
    baseURL: blawbyBaseURL, headers: blawbyExtraHeaders,
    listPath: '/services', detailPath: '/services/family', detailText: /Family Law/i,
  })
})
