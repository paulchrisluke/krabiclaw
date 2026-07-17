import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('universal CMS', () => {
  test('opens at the site scope and exposes canonical CMS managers', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content')

    await expect(page.getByText('Universal CMS', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pages', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blog posts' })).toHaveAttribute('href', '/dashboard/mcp-free-fixture/sites/mcp-free-fixture/blog')
    await expect(page.getByRole('link', { name: 'Menus' })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard\/mcp-free-fixture\/sites\/mcp-free-fixture\/content$/)
  })

  test('unsupported page deep links fail instead of redirecting to another page', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content?page=services')
    await expect(page.getByText('Page is not available for this site: services', { exact: true }).first()).toBeVisible()
  })
})
