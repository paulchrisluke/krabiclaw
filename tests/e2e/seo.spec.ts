import { expect, test } from '@playwright/test'
import { setupTenantHeaders, tenantBaseURL, tenantExtraHeaders } from './helpers'

function isNonProductionHost(value: string): boolean {
  const host = new URL(value).hostname
  return host === 'preview.krabiclaw.com'
    || host === 'staging.krabiclaw.com'
    || host === 'local.krabiclaw.com'
    || host.endsWith('.pages.dev')
    || host.endsWith('.workers.dev')
    || host.endsWith('.trycloudflare.com')
}

test.describe('platform SEO contracts', () => {
  test('robots and sitemap never advertise private application routes', async ({ request, baseURL }) => {
    expect(baseURL).toBeTruthy()
    const nonProduction = isNonProductionHost(baseURL!)

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    const robotsBody = await robots.text()

    if (nonProduction) {
      expect(robotsBody).toContain('Disallow: /')
      expect(robots.headers()['x-robots-tag']).toContain('noindex')
    } else {
      expect(robotsBody).toContain('Disallow: /admin')
      expect(robotsBody).toContain('Disallow: /dashboard')
      expect(robotsBody).toContain('Sitemap:')
    }

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    const sitemapBody = await sitemap.text()

    for (const forbidden of [
      '/admin',
      '/dashboard',
      '/billing',
      '/login',
      '/oauth',
      '/reset-password',
      '/signup',
      '/tenant-setup-',
      '/dev/',
    ]) {
      expect(sitemapBody).not.toContain(forbidden)
    }

    if (nonProduction) expect(sitemapBody).not.toContain('<loc>')
  })

  test('private routes receive an HTTP noindex directive', async ({ request }) => {
    for (const path of ['/login', '/admin', '/oauth/consent', '/forgot-password']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.headers()['x-robots-tag'], path).toContain('noindex')
      expect(response.headers()['cache-control'], path).toContain('no-store')
    }
  })

  test('legacy billing permanently redirects to canonical pricing', async ({ request }) => {
    const response = await request.get('/billing', { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe('/pricing')
  })

  test('tenant-only route families return 404 on the platform host', async ({ request }) => {
    for (const path of ['/experiences', '/locations', '/menu', '/order', '/reservations', '/reviews']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(404)
    }
  })
})

test.describe('tenant SEO contracts', () => {
  test.beforeEach(async ({ page }) => {
    await setupTenantHeaders(page, tenantBaseURL, tenantExtraHeaders)
  })

  test('tenant pages emit a canonical on the active tenant origin', async ({ page }) => {
    const response = await page.goto(`${tenantBaseURL}/locations`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)

    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    await expect(canonical).toHaveAttribute('href', `${new URL(tenantBaseURL).origin}/locations`)
  })

  test('tenant structured data does not hardcode the platform origin', async ({ page }) => {
    const response = await page.goto(`${tenantBaseURL}/experiences`, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(400)

    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    const combined = jsonLd.join('\n')
    expect(combined).toContain(`${new URL(tenantBaseURL).origin}/experiences`)
    expect(combined).not.toContain('https://krabiclaw.com/experiences')
  })
})
