import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { buildTenantHeadLinks } from '../../utils/tenant-head'
import {
  isPlatformAssetUrl,
  getTenantFaviconSvg,
  getCloudflareImageVariantUrl,
  isCloudflareImagesUrl,
} from '../../server/utils/tenant-favicon'

// Production-style extensionless Cloudflare Images URLs
const POTTERY_HOUSE_LOGO = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/public'
const KIKUZUKI_LOGO = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f2eb4d12-f586-455f-217f-3f3de95f3700/public'

describe('Tenant Favicon – Unit Tests', () => {

  describe('buildTenantHeadLinks', () => {
    test('platform host: returns default platform links including manifest', () => {
      const links = buildTenantHeadLinks({
        isPlatform: true,
        tenantLogoUrl: null,
        tenantBrandName: 'KrabiClaw',
        isDraftPreview: false,
      })
      assert.equal(links.length, 5)
      assert.ok(links.some((l) => l.href === '/favicon.ico'))
      assert.ok(links.some((l) => l.href === '/apple-touch-icon.png'))
      assert.ok(links.some((l) => l.href === '/favicon.svg'))
      assert.ok(links.some((l) => l.href === '/site.webmanifest'))
    })

    test('tenant redirect icon leaves the response format authoritative', () => {
      for (const source of [
        KIKUZUKI_LOGO,
        POTTERY_HOUSE_LOGO,
        'https://cdn.example.com/custom-icon.svg',
        'https://cdn.example.com/custom-icon.png',
      ]) {
        const links = buildTenantHeadLinks({
          isPlatform: false,
          tenantLogoUrl: POTTERY_HOUSE_LOGO,
          tenantFaviconUrl: source,
          tenantBrandName: 'Custom Brand',
          isDraftPreview: false,
        })
        const icon = links.find((link) => link.key === 'app-icon-tenant')
        assert.equal(icon?.type, undefined)
        assert.match(icon?.href || '', /^\/tenant-icon\?v=/)
      }
    })

    test('version fingerprint changes when logo URL changes', () => {
      const links1 = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: 'https://imagedelivery.net/v1/logo/public',
        tenantBrandName: 'Tenant',
        isDraftPreview: false,
      })
      const links2 = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: 'https://imagedelivery.net/v2/logo/public',
        tenantBrandName: 'Tenant',
        isDraftPreview: false,
      })
      const icon1 = links1.find((l) => l.key === 'app-icon-tenant')
      const icon2 = links2.find((l) => l.key === 'app-icon-tenant')
      assert.notEqual(icon1?.href, icon2?.href)
    })

    test('draft preview: manifest link is omitted', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: KIKUZUKI_LOGO,
        tenantBrandName: 'Kikuzuki',
        isDraftPreview: true,
      })
      assert.ok(!links.some((l) => l.key === 'app-manifest'))
    })

    test('site preview: root-level icon requests are omitted', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: KIKUZUKI_LOGO,
        tenantBrandName: 'Kikuzuki',
        isDraftPreview: false,
        isSitePreview: true,
      })
      assert.deepEqual(links, [])
    })

    test('site preview wins when both platform and preview context are set', () => {
      const links = buildTenantHeadLinks({
        isPlatform: true,
        tenantLogoUrl: KIKUZUKI_LOGO,
        tenantBrandName: 'Kikuzuki',
        isDraftPreview: false,
        isSitePreview: true,
      })
      assert.deepEqual(links, [])
    })
  })

  describe('isCloudflareImagesUrl / getCloudflareImageVariantUrl', () => {
    test('isCloudflareImagesUrl: detects imagedelivery.net URLs (exact hostname)', () => {
      // True positives — real Cloudflare Images URLs
      assert.equal(isCloudflareImagesUrl(POTTERY_HOUSE_LOGO), true)
      assert.equal(isCloudflareImagesUrl(KIKUZUKI_LOGO), true)

      // True negatives — unrelated hosts
      assert.equal(isCloudflareImagesUrl('https://example.com/logo.jpg'), false)
      assert.equal(isCloudflareImagesUrl('https://cdn.myhost.com/favicon.ico'), false)

      // Lookalike domain — subdomain: my-imagedelivery.net
      assert.equal(isCloudflareImagesUrl('https://my-imagedelivery.net/account/image/public'), false)

      // Lookalike domain — suffix: imagedelivery.net.evil.com
      assert.equal(isCloudflareImagesUrl('https://imagedelivery.net.evil.com/account/image/public'), false)

      // Path-only occurrence: imagedelivery.net appears in path, not hostname
      assert.equal(isCloudflareImagesUrl('https://proxy.example.com/imagedelivery.net/account/image/public'), false)

      // Query-string occurrence: imagedelivery.net appears in a query parameter
      assert.equal(isCloudflareImagesUrl('https://example.com/img?src=https://imagedelivery.net/account/image/public'), false)

      // Invalid / relative URL: should return false without throwing
      assert.equal(isCloudflareImagesUrl('/imagedelivery.net/account/image/public'), false)
      assert.equal(isCloudflareImagesUrl(''), false)
    })

    test('getCloudflareImageVariantUrl uses a Cloudflare-supported output format', () => {
      assert.equal(
        getCloudflareImageVariantUrl(POTTERY_HOUSE_LOGO, 192, 192),
        'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/w=192,h=192,fit=pad,f=webp',
      )
      assert.equal(
        getCloudflareImageVariantUrl(KIKUZUKI_LOGO, 512, 512, 'jpeg'),
        'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f2eb4d12-f586-455f-217f-3f3de95f3700/w=512,h=512,fit=pad,f=jpeg',
      )
    })
  })

  describe('isPlatformAssetUrl', () => {
    test('relative platform paths are classified as platform assets', () => {
      assert.equal(isPlatformAssetUrl('/favicon.ico'), true)
      assert.equal(isPlatformAssetUrl('/platform/favicon.ico'), true)
      assert.equal(isPlatformAssetUrl('/apple-touch-icon.png'), true)
    })

    test('krabiclaw.com favicon paths are classified as platform assets', () => {
      assert.equal(isPlatformAssetUrl('https://krabiclaw.com/favicon.ico'), true)
    })

    test('external customer-hosted favicon URLs are NOT classified as platform assets', () => {
      assert.equal(isPlatformAssetUrl('https://client.example/favicon.ico'), false)
      assert.equal(isPlatformAssetUrl('https://cdn.client.com/apple-touch-icon.png'), false)
      assert.equal(isPlatformAssetUrl(POTTERY_HOUSE_LOGO), false)
      assert.equal(isPlatformAssetUrl(KIKUZUKI_LOGO), false)
    })
  })

  describe('getTenantFaviconSvg', () => {
    test('wraps the configured favicon URL in an SVG image element', () => {
      const svg = getTenantFaviconSvg(POTTERY_HOUSE_LOGO)
      assert.match(svg, /^<svg/)
      assert.match(svg, /<image href="https:\/\/imagedelivery\.net\//)
    })

    test('escapes XML characters in favicon URLs', () => {
      const svg = getTenantFaviconSvg('https://cdn.example.com/logo?a=1&b=2')
      assert.match(svg, /&amp;/)
      assert.ok(!svg.includes('&b=2'))
    })
  })

})
