import { expect, test } from '@playwright/test'
import { openTenantPage } from './helpers'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

// Kikuzuki publishes Japanese. Its /ja pages are a Japanese site from the
// server's first byte: the document language, the navigation and the catalogue
// are Japanese before hydration, and hydration does not replace them.
test('Kikuzuki serves its published Japanese site in Japanese', async ({ page }) => {
  test.setTimeout(180_000)
  const hydrationErrors: string[] = []
  page.on('console', message => {
    if (/hydration.*mismatch|mismatch.*hydration/i.test(message.text())) hydrationErrors.push(message.text())
  })
  page.on('pageerror', error => hydrationErrors.push(error.message))

  for (const path of ['/ja', '/ja/menu', '/ja/experiences', '/ja/reservations', '/ja/contact']) {
    const document = await page.request.get(`${kikuzukiTestBaseUrl()}${path}`, { headers: kikuzukiTestExtraHeaders() })
    expect(document.status(), path).toBe(200)
    const html = await document.text()
    expect(html, `${path} is served as a Japanese document`).toMatch(/<html[^>]*\slang="ja"/)
    expect(html, `${path} renders the Japanese navigation on the server`).toContain('aria-label="メインナビゲーション"')
    expect(html, `${path} carries no English navigation`).not.toContain('aria-label="Primary navigation"')

    await openTenantPage(page, `${kikuzukiTestBaseUrl()}${path}`, kikuzukiTestExtraHeaders())
    await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible()
  }

  // The catalogue is the translated one: a dish shows its Japanese name, never
  // its English one.
  await openTenantPage(page, `${kikuzukiTestBaseUrl()}/ja/menu`, kikuzukiTestExtraHeaders())
  await expect(page.getByText('アメリカーノ', { exact: true }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Americano')
  expect(hydrationErrors).toEqual([])
})
