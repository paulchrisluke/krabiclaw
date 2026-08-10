import { test, expect } from '@playwright/test'
import {
  isDeployedWorkerTarget,
  kikuzukiTestBaseUrl,
  kikuzukiTestExtraHeaders,
  potteryHouseTestBaseUrl,
  potteryHouseTestExtraHeaders,
  testBaseUrl,
} from './test-env'

function expectDeployedFaviconCrawlable(baseUrl: string, headers: Record<string, string>) {
  if (isDeployedWorkerTarget(baseUrl)) {
    expect(headers['x-robots-tag']).toBeUndefined()
  }
}

test.describe('Tenant Favicon Endpoints & Host Isolation E2E Tests', () => {
  test('Platform host serves platform favicon assets and platform manifest', async ({ request }) => {
    const baseUrl = testBaseUrl()
    const resManifest = await request.get(new URL('/site.webmanifest', baseUrl).toString(), { maxRedirects: 5 })
    expect(resManifest.status()).toBe(200)
    const textManifest = await resManifest.text()
    expect(textManifest).toContain('KrabiClaw')

    const faviconUrl = new URL('/favicon.ico', baseUrl).toString()
    const firstFaviconResponse = await request.get(faviconUrl, { maxRedirects: 0 })
    expect(firstFaviconResponse.status()).toBe(302)
    expectDeployedFaviconCrawlable(baseUrl, firstFaviconResponse.headers())

    const resFavicon = await request.get(faviconUrl, { maxRedirects: 5 })
    expect(resFavicon.status()).toBe(200)
    expect(resFavicon.headers()['content-type']).toMatch(/^image\//)
    expectDeployedFaviconCrawlable(baseUrl, resFavicon.headers())
  })

  test('Pottery House tenant host endpoints return tenant-specific assets without platform fallbacks', async ({ request }) => {
    const baseUrl = potteryHouseTestBaseUrl()
    const headers = potteryHouseTestExtraHeaders()

    // Test /tenant-icon.svg returns real SVG with 200 OK
    const resSvg = await request.get(new URL('/tenant-icon.svg', baseUrl).toString(), { headers })
    expect(resSvg.status()).toBe(200)
    expect(resSvg.headers()['content-type']).toContain('image/svg+xml')
    expectDeployedFaviconCrawlable(baseUrl, resSvg.headers())

    // Test /tenant-icon-192.png, /tenant-icon-512.png, /favicon.ico, /apple-touch-icon.png
    const endpoints = ['/tenant-icon-192.png', '/tenant-icon-512.png', '/apple-touch-icon.png', '/favicon.ico']
    for (const ep of endpoints) {
      const endpointUrl = new URL(ep, baseUrl).toString()
      const response = await request.get(endpointUrl, { headers, maxRedirects: 0 })
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(/^image\//)
      expect(response.headers().location).toBeUndefined()
      expectDeployedFaviconCrawlable(baseUrl, response.headers())
    }

    const robots = await request.get(new URL('/robots.txt', baseUrl).toString(), { headers })
    expect(robots.status()).toBe(200)
    const robotsText = await robots.text()
    for (const path of ['/tenant-icon', '/favicon.ico', '/apple-touch-icon.png']) {
      expect(robotsText).not.toContain(`Disallow: ${path}`)
    }

    // Test /site.webmanifest on tenant host redirects to tenant manifest
    const resSiteManifest = await request.get(new URL('/site.webmanifest', baseUrl).toString(), { headers, maxRedirects: 5 })
    expect(resSiteManifest.status()).toBe(200)
    const manifestJson = await resSiteManifest.json()
    expect(manifestJson.name).toContain('Pottery House')
    expect(manifestJson.icons.some((i: { src: string }) => i.src.includes('/tenant-icon-512.png'))).toBe(true)
    expect(manifestJson.icons).toHaveLength(1)
  })

  test('Kikuzuki tenant host endpoints return tenant-specific assets without platform fallbacks', async ({ request }) => {
    const baseUrl = kikuzukiTestBaseUrl()
    const headers = kikuzukiTestExtraHeaders()

    const resSvg = await request.get(new URL('/tenant-icon.svg', baseUrl).toString(), { headers })
    expect(resSvg.status()).toBe(200)
    expect(resSvg.headers()['content-type']).toContain('image/svg+xml')

    const resSiteManifest = await request.get(new URL('/site.webmanifest', baseUrl).toString(), { headers, maxRedirects: 5 })
    expect(resSiteManifest.status()).toBe(200)
    const manifestJson = await resSiteManifest.json()
    expect(manifestJson.name).toContain('Kikuzuki')
  })
})
