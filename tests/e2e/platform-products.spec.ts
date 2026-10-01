import { expect, test } from '@playwright/test'
import { openTenantPage, waitForNuxtHydration } from './helpers'
import { testBaseUrl } from './test-env'

test('Products retains its authored content, media and canonical identity after hydration', async ({ page, request }) => {
  const legacy = await request.get(`${testBaseUrl()}/features?source=legacy`, { maxRedirects: 0 })
  expect(legacy.status()).toBe(301)
  expect(legacy.headers().location).toBe('/products?source=legacy')
  const response = await openTenantPage(page, `${testBaseUrl()}/products`, {})
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your website is\njust the beginning.')
  await expect(page.getByRole('heading', { name: 'Keep the conversation going.', exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://krabiclaw.com/products')
  const graph = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(graph.join('')).toContain('https://krabiclaw.com/products#webpage')
  const images = page.locator('.kc-products-page img')
  expect(await images.count()).toBe(10)
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  }
  await page.getByRole('navigation', { name: 'Products', exact: true }).getByRole('link', { name: 'Connect', exact: true }).click()
  await expect(page).toHaveURL(/#products-inbox$/)
  await expect(page.getByRole('heading', { name: 'Keep the conversation going.', exact: true })).toBeInViewport()
})

test('Products remains readable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openTenantPage(page, `${testBaseUrl()}/products`, {})
  await waitForNuxtHydration(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('navigation', { name: 'Products', exact: true }).getByRole('link', { name: 'Grow', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Show what’s happening.', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
