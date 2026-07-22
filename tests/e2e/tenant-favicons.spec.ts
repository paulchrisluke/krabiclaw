import { test, expect } from '@playwright/test'

test.describe('Tenant Favicon Endpoints & Host Isolation E2E Tests', () => {
  test('Platform host serves platform favicon assets and platform manifest', async ({ request }) => {
    const resManifest = await request.get('/site.webmanifest', { maxRedirects: 5 })
    expect(resManifest.status()).toBe(200)
    const textManifest = await resManifest.text()
    expect(textManifest).toContain('KrabiClaw')

    const resFavicon = await request.get('/favicon.ico', { maxRedirects: 5 })
    expect(resFavicon.status()).toBe(200)
    expect(resFavicon.headers()['x-robots-tag']).toBeUndefined()
  })

  test('Pottery House tenant host endpoints return tenant-specific assets without platform fallbacks', async ({ request }) => {
    const headers = { 'x-preview-tenant': 'pottery-house' }

    // Test /tenant-icon.svg returns real SVG with 200 OK
    const resSvg = await request.get('/tenant-icon.svg', { headers })
    expect(resSvg.status()).toBe(200)
    expect(resSvg.headers()['content-type']).toContain('image/svg+xml')
    expect(resSvg.headers()['x-robots-tag']).toBeUndefined()

    // Test /tenant-icon-192.png, /tenant-icon-512.png, /favicon.ico, /apple-touch-icon.png
    const endpoints = ['/tenant-icon-192.png', '/tenant-icon-512.png', '/apple-touch-icon.png', '/favicon.ico']
    for (const ep of endpoints) {
      const res = await request.get(ep, { headers, maxRedirects: 5 })
      expect(res.status()).toBe(200)
      expect(res.headers()['x-robots-tag']).toBeUndefined()
      // Ensure it does not return the platform file
      const url = res.url()
      expect(url).not.toContain('/platform/')
    }

    // Test /site.webmanifest on tenant host redirects to tenant manifest
    const resSiteManifest = await request.get('/site.webmanifest', { headers, maxRedirects: 5 })
    expect(resSiteManifest.status()).toBe(200)
    const manifestJson = await resSiteManifest.json()
    expect(manifestJson.name).toContain('Pottery House')
    expect(manifestJson.icons.some((i: { src: string }) => i.src.includes('/tenant-icon-192.png'))).toBe(true)
    expect(manifestJson.icons.some((i: { src: string }) => i.src.includes('/tenant-icon-512.png'))).toBe(true)
  })

  test('Kikuzuki tenant host endpoints return tenant-specific assets without platform fallbacks', async ({ request }) => {
    const headers = { 'x-preview-tenant': 'kikuzuki' }

    const resSvg = await request.get('/tenant-icon.svg', { headers })
    expect(resSvg.status()).toBe(200)
    expect(resSvg.headers()['content-type']).toContain('image/svg+xml')

    const resSiteManifest = await request.get('/site.webmanifest', { headers, maxRedirects: 5 })
    expect(resSiteManifest.status()).toBe(200)
    const manifestJson = await resSiteManifest.json()
    expect(manifestJson.name).toContain('Kikuzuki')
  })
})
