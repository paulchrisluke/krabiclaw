import { test, expect } from '@playwright/test'

test.describe('Tenant Favicon & Host Isolation E2E Tests', () => {
  test('Platform pages render platform favicon links and manifest', async ({ page }) => {
    await page.goto('/')
    const iconSvg = page.locator('link[rel="icon"][type="image/svg+xml"]')
    const shortcutIcon = page.locator('link[rel="shortcut icon"]')
    const appleIcon = page.locator('link[rel="apple-touch-icon"]')
    const manifest = page.locator('link[rel="manifest"]')

    await expect(iconSvg).toHaveAttribute('href', '/favicon.svg')
    await expect(shortcutIcon).toHaveAttribute('href', '/favicon.ico')
    await expect(appleIcon).toHaveAttribute('href', '/apple-touch-icon.png')
    await expect(manifest).toHaveAttribute('href', '/site.webmanifest')
  })

  test('Tenant host HTML renders versioned tenant icon, shortcut icon, apple touch icon, and manifest', async ({ page }) => {
    // Test using local tenant preview or header override context
    await page.setExtraHTTPHeaders({ 'x-preview-tenant': 'pottery-house' })
    await page.goto('/preview/site/site-pottery-house')

    const iconTenant = page.locator('link[rel="icon"]')
    const shortcutIcon = page.locator('link[rel="shortcut icon"]')
    const appleIcon = page.locator('link[rel="apple-touch-icon"]')
    const manifest = page.locator('link[rel="manifest"]')

    await expect(iconTenant.first()).toHaveAttribute('href', /\/tenant-icon\?v=/)
    await expect(shortcutIcon).toHaveAttribute('href', /\/favicon\.ico\?v=/)
    await expect(appleIcon).toHaveAttribute('href', /\/apple-touch-icon\.png\?v=/)
    await expect(manifest).toHaveAttribute('href', '/tenant.webmanifest')
  })
})
