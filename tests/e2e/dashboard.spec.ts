import { expect, test } from '@playwright/test'
import { collectPageErrors } from './helpers'

test.describe('dashboard smoke', () => {
  test('dev login opens the owner dashboard and sites list', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)

    const login = await page.goto(`${baseURL}/api/dev/login`, { waitUntil: 'networkidle' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).toContainText('Dashboard')

    const sites = await page.goto(`${baseURL}/dashboard/sites`, { waitUntil: 'networkidle' })
    expect(sites?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText('Websites')
    await expect(page.locator('body')).toContainText('demo')

    expect(errors).toEqual([])
  })
})
