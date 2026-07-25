import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('universal CMS', () => {
  test('opens at the site scope and exposes canonical CMS managers', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content')

    await expect(page.getByRole('heading', { name: 'Content', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit' }).first()).toHaveAttribute('href', '/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content/home')
    await expect(page.getByRole('link', { name: 'Blog posts' })).toHaveAttribute('href', '/dashboard/mcp-free-fixture/sites/mcp-free-fixture/blog')
    await expect(page.getByRole('link', { name: 'Media library' })).toHaveAttribute('href', '/dashboard/mcp-free-fixture/sites/mcp-free-fixture/media')
    await expect(page).toHaveURL(/\/dashboard\/mcp-free-fixture\/sites\/mcp-free-fixture\/content$/)
  })

  test('unsupported page deep links fail instead of redirecting to another page', async ({ page, baseURL }) => {
    await loginAs(page.request, baseURL!, 'user-mcp-free')
    await page.goto('/dashboard/mcp-free-fixture/sites/mcp-free-fixture/content/services')
    await expect(page.getByText('Error 404', { exact: true })).toBeVisible()
    await expect(page.locator('body')).toContainText('Page is not available for this site: services')
    await expect(page).toHaveURL(/\/dashboard\/mcp-free-fixture\/sites\/mcp-free-fixture\/content\/services$/)
  })
})
