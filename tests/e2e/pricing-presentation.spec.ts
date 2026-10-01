import { expect, test } from '@playwright/test'
import { openTenantPage, waitForNuxtHydration } from './helpers'
import { testBaseUrl } from './test-env'

// Real page + canonical billing endpoint. No routes replace billing or CMS data.
test('pricing desktop exposes provider details after one reveal and does not replay', async ({ page }, testInfo) => {
  const response = await openTenantPage(page, `${testBaseUrl()}/pricing`, {})
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
  const cards = page.locator('[data-parity-section="plans"] [data-photo-state]')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toHaveAttribute('data-photo-state', 'details')
  await expect(cards.nth(1)).toHaveAttribute('data-photo-state', 'details')
  const authored = await page.request.get(`${testBaseUrl()}/api/public/pages?path=%2Fpricing`)
  expect(authored.status()).toBe(200)
  const document = await authored.json()
  if (JSON.stringify(document).includes('billing_features')) {
    const comparison = page.locator('[data-parity-section="comparison"]')
    await expect(comparison).toBeVisible()
    await expect(comparison.locator('tr[data-feature-id]')).toHaveCount(26)
    await expect(page.getByRole('heading', { name: 'Build your online home', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Keep it current', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Grow when you’re ready', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ready for your next chapter?', exact: true })).toBeVisible()
  }
  const billing = await page.request.get(`${testBaseUrl()}/api/billing/plans`)
  expect(billing.status()).toBe(200)
  const plans = await billing.json() as Array<{ name: string; prices: Array<{ amount: number; interval: string }> }>
  for (const plan of plans) await expect(cards.getByRole('heading', { name: plan.name, exact: true })).toBeVisible()
  const paidAction = cards.nth(1).getByRole('link')
  const target = new URL((await paidAction.getAttribute('href'))!, testBaseUrl())
  expect(target.searchParams.get('plan')).toBe('growth')
  expect(target.searchParams.get('redirect')).toBe('/api/post-login?plan=growth')
  await page.screenshot({ path: testInfo.outputPath('pricing-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.evaluate(() => window.scrollTo(0, 100))
  await expect(page.locator('[data-photo-state="flipping"]')).toHaveCount(0)
})

test('pricing mobile peeks the next card, contains overflow, and respects reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const response = await openTenantPage(page, `${testBaseUrl()}/pricing`, {})
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
  const rail = page.locator('.kc-pricing-plans__rail')
  const cards = rail.locator('[data-photo-state]')
  await expect(cards).toHaveCount(2)
  await expect(page.locator('[data-photo-state="flipping"]')).toHaveCount(0)
  const geometry = await rail.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, secondLeft: element.children[1]!.getBoundingClientRect().left, pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.width)
  expect(geometry.secondLeft).toBeLessThan(geometry.viewport)
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport + 1)
  await page.screenshot({ path: testInfo.outputPath('pricing-mobile-reduced-motion.png'), fullPage: true })
  await cards.nth(1).scrollIntoViewIfNeeded()
  await expect(cards.nth(1).getByRole('link')).toBeVisible()
})

test('pricing keyboard focus exposes the action immediately', async ({ page }, testInfo) => {
  const response = await openTenantPage(page, `${testBaseUrl()}/pricing`, {})
  expect(response?.status()).toBe(200)
  await waitForNuxtHydration(page)
  const card = page.locator('[data-photo-state]').first()
  const action = card.getByRole('link')
  await action.focus()
  await expect(action).toBeFocused()
  await expect(card).toHaveAttribute('data-photo-state', 'details')
  await expect(action).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('pricing-keyboard.png'), fullPage: true })
})

test('pricing remains readable with JavaScript disabled', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    const response = await page.goto(`${testBaseUrl()}/pricing`)
    expect(response?.status()).toBe(200)
    const cards = page.locator('[data-photo-state="details"]')
    await expect(cards).toHaveCount(2)
    await expect(cards.first().getByRole('heading')).toBeVisible()
    await expect(cards.first().getByRole('link')).toBeVisible()
    await expect(page.locator('[data-price-unavailable]')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('pricing-no-javascript.png'), fullPage: true })
  } finally {
    await context.close()
  }
})
