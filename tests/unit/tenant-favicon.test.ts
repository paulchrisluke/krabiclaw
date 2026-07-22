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

    test('Kikuzuki (PNG, extensionless URL, tenantLogoMimeType=image/png): icon type is image/png', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: KIKUZUKI_LOGO,
        tenantLogoMimeType: 'image/png',
        tenantBrandName: 'Kikuzuki',
        isDraftPreview: false,
      })
      const icon = links.find((l) => l.key === 'app-icon-tenant')
      assert.equal(icon?.type, 'image/png')
      assert.match(icon?.href || '', /^\/tenant-icon\?v=/)
    })

    test('Pottery House (JPEG, extensionless URL, tenantLogoMimeType=image/jpeg): icon type is image/jpeg', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: POTTERY_HOUSE_LOGO,
        tenantLogoMimeType: 'image/jpeg',
        tenantBrandName: 'Pottery House Krabi',
        isDraftPreview: false,
      })
      const icon = links.find((l) => l.key === 'app-icon-tenant')
      assert.equal(icon?.type, 'image/jpeg')
    })

    test('extensionless URL with no MIME type: type attribute is omitted', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: 'https://imagedelivery.net/account/image/public',
        tenantLogoMimeType: null,
        tenantBrandName: 'Unknown Brand',
        isDraftPreview: false,
      })
      const icon = links.find((l) => l.key === 'app-icon-tenant')
      assert.equal(icon?.type, undefined)
    })

    test('dedicated SVG favicon URL: favicon MIME wins over logo MIME', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: POTTERY_HOUSE_LOGO,
        tenantLogoMimeType: 'image/jpeg',   // logo is JPEG
        tenantFaviconUrl: 'https://cdn.example.com/custom-icon.svg',
        tenantFaviconMimeType: null,          // no explicit MIME — extension inference applies
        tenantBrandName: 'Custom Brand',
        isDraftPreview: false,
      })
      const icon = links.find((l) => l.key === 'app-icon-tenant')
      // Extension of .svg should produce image/svg+xml, NOT image/jpeg from logo
      assert.equal(icon?.type, 'image/svg+xml')
    })

    test('dedicated favicon with no extension and no MIME: type omitted, not inherited from logo', () => {
      const links = buildTenantHeadLinks({
        isPlatform: false,
        tenantLogoUrl: POTTERY_HOUSE_LOGO,
        tenantLogoMimeType: 'image/jpeg',
        tenantFaviconUrl: 'https://cdn.example.com/custom-favicon', // extensionless
        tenantFaviconMimeType: null,
        tenantBrandName: 'Custom Brand',
        isDraftPreview: false,
      })
      const icon = links.find((l) => l.key === 'app-icon-tenant')
      // Must NOT inherit image/jpeg from logo
      assert.equal(icon?.type, undefined)
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
  })

  describe('isCloudflareImagesUrl / getCloudflareImageVariantUrl', () => {
    test('isCloudflareImagesUrl: detects imagedelivery.net URLs', () => {
      assert.equal(isCloudflareImagesUrl(POTTERY_HOUSE_LOGO), true)
      assert.equal(isCloudflareImagesUrl(KIKUZUKI_LOGO), true)
      assert.equal(isCloudflareImagesUrl('https://example.com/logo.jpg'), false)
      assert.equal(isCloudflareImagesUrl('https://cdn.myhost.com/favicon.ico'), false)
    })

    test('getCloudflareImageVariantUrl: replaces /public with w/h/fit/f params', () => {
      assert.equal(
        getCloudflareImageVariantUrl(POTTERY_HOUSE_LOGO, 192, 192, 'png'),
        'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/w=192,h=192,fit=pad,f=png',
      )
      assert.equal(
        getCloudflareImageVariantUrl(KIKUZUKI_LOGO, 512, 512, 'png'),
        'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f2eb4d12-f586-455f-217f-3f3de95f3700/w=512,h=512,fit=pad,f=png',
      )
      assert.equal(
        getCloudflareImageVariantUrl(POTTERY_HOUSE_LOGO, 180, 180, 'png'),
        'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/w=180,h=180,fit=pad,f=png',
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
    test('wraps logo URL in SVG image element when logoUrl is present', () => {
      const svg = getTenantFaviconSvg('Pottery House', POTTERY_HOUSE_LOGO)
      assert.match(svg, /^<svg/)
      assert.match(svg, /<image href="https:\/\/imagedelivery\.net\//)
    })

    test('renders letter badge from brand name when no logo URL', () => {
      const ph = getTenantFaviconSvg('Pottery House', null)
      assert.match(ph, /<text[^>]*>P<\/text>/)

      const kiku = getTenantFaviconSvg('Kikuzuki', null)
      assert.match(kiku, /<text[^>]*>K<\/text>/)
    })

    test('escapes XML characters in logo URLs', () => {
      const svg = getTenantFaviconSvg('Brand', 'https://cdn.example.com/logo?a=1&b=2')
      assert.match(svg, /&amp;/)
      assert.ok(!svg.includes('&b=2'))
    })
  })

})
