import { expect, test } from '@playwright/test'
import { collectPageErrors } from './helpers'

test.describe('dashboard smoke', () => {
  test('dev login opens the owner dashboard', async ({ page, baseURL }) => {
    const errors = collectPageErrors(page)

    const login = await page.goto(`${baseURL}/api/dev/login`, { waitUntil: 'networkidle' })
    expect(login?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

    const dashboard = await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    expect(dashboard?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/Overview|Create your restaurant workspace/)

    expect(errors).toEqual([])
  })
})
