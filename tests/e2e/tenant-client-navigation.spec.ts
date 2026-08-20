import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL, blawbyExtraHeaders, collectPageErrors,
  potteryHouseBaseURL, potteryHouseExtraHeaders, setupTenantHeaders,
} from './helpers'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

async function clientJourney(page: Page, options: {
  baseURL: string
  headers: Record<string, string>
  identity: RegExp
  listPath: string
  detailPath: string
  detailText: RegExp
  forbidden: RegExp[]
}) {
  await setupTenantHeaders(page, options.baseURL, options.headers)
  const errors = collectPageErrors(page, { failOnAllWarnings: true })
  await page.goto(`${options.baseURL}/`, { waitUntil: 'load' })
  await expect(page.locator('body')).toContainText(options.identity)
  await page.locator(`a[href="${options.listPath}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${options.listPath}/?$`))
  await expect(page.locator('body')).toContainText(options.identity)
  await page.locator(`a[href="${options.detailPath}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`${options.detailPath}/?$`))
  await expect(page.locator('main')).toContainText(options.detailText)
  await expect(page.locator('body')).toContainText(options.identity)
  for (const text of options.forbidden) await expect(page.locator('body')).not.toContainText(text)
  await page.waitForTimeout(250)
  await expect(page.locator('main')).toContainText(options.detailText)
  expect(errors).toEqual([])
}

test('Pottery home → experiences → experience detail', async ({ page }) => {
  await clientJourney(page, {
    baseURL: potteryHouseBaseURL, headers: potteryHouseExtraHeaders, identity: /Pottery House/i,
    listPath: '/experiences', detailPath: '/experiences/pottery-wheel-class', detailText: /Pottery Wheel Class/i,
    forbidden: [/Ember & Slice/i, /No experiences yet/i, /Also part of Saya/i],
  })
})

test('Kikuzuki home → menu → menu item', async ({ page }) => {
  await clientJourney(page, {
    baseURL: kikuzukiTestBaseUrl(), headers: kikuzukiTestExtraHeaders(), identity: /Kikuzuki/i,
    listPath: '/menu', detailPath: '/menu/tuna-sushi', detailText: /Tuna Sushi/i,
    forbidden: [/Ember & Slice/i, /Menu coming soon/i],
  })
})

test('NCLS home → services → service detail', async ({ page }) => {
  await clientJourney(page, {
    baseURL: blawbyBaseURL, headers: blawbyExtraHeaders, identity: /North Carolina Legal Services/i,
    listPath: '/services', detailPath: '/services/family', detailText: /Family Law/i,
    forbidden: [/Ember & Slice/i, /No services/i],
  })
})
