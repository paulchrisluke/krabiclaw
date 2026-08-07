import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('universal CMS', () => {
  test('opens at the site scope and exposes canonical CMS managers', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/pages', { waitUntil: 'networkidle' })

    await expect(page.getByText('Site pages', { exact: true })).toBeVisible()
    await expect(page.getByText('No pages', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button').filter({ hasText: 'MCP Free Fixture' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'New page', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard\/mcp-free-fixture\/sites\/mcp-free-fixture\/pages$/)
  })

  test('unsupported page deep links fail instead of redirecting to another page', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content/services')
    await expect(page.getByText('Error 404', { exact: true })).toBeVisible()
    await expect(page.locator('body')).toContainText('Page not found')
    await expect(page).toHaveURL(/\/dashboard\/mcp-free-fixture\/sites\/mcp-free-fixture\/content\/services$/)
  })
})
