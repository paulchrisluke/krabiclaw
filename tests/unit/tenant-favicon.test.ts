import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { buildTenantHeadLinks } from '../../utils/tenant-head'
import { isPlatformAssetUrl, getTenantFaviconSvg, getCloudflareImageVariantUrl } from '../../server/utils/tenant-favicon'

describe('Tenant Favicon Metadata & Isolation Tests', () => {
  test('buildTenantHeadLinks for platform host returns default platform links', () => {
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

  test('buildTenantHeadLinks with extensionless Cloudflare Images URL and tenantLogoMimeType (Kikuzuki PNG)', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f2eb4d12-f586-455f-217f-3f3de95f3700/public',
      tenantLogoMimeType: 'image/png',
      tenantBrandName: 'Kikuzuki',
      isDraftPreview: false,
    })

    const iconLink = links.find((l) => l.key === 'app-icon-tenant')
    const shortcutLink = links.find((l) => l.key === 'app-icon-shortcut')
    const appleLink = links.find((l) => l.key === 'app-icon-apple')
    const manifestLink = links.find((l) => l.key === 'app-manifest')

    assert.equal(iconLink?.type, 'image/png')
    assert.match(iconLink?.href || '', /^\/tenant-icon\?v=/)
    assert.match(shortcutLink?.href || '', /^\/favicon\.ico\?v=/)
    assert.match(appleLink?.href || '', /^\/apple-touch-icon\.png\?v=/)
    assert.equal(manifestLink?.href, '/tenant.webmanifest')
  })

  test('buildTenantHeadLinks with extensionless Cloudflare Images URL and tenantLogoMimeType (Pottery House JPEG)', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/public',
      tenantLogoMimeType: 'image/jpeg',
      tenantBrandName: 'Pottery House Krabi',
      isDraftPreview: false,
    })

    const iconLink = links.find((l) => l.key === 'app-icon-tenant')
    assert.equal(iconLink?.type, 'image/jpeg')
    assert.match(iconLink?.href || '', /^\/tenant-icon\?v=/)
  })

  test('buildTenantHeadLinks omits type attribute when MIME type is absent for extensionless URLs', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/unknown-format/public',
      tenantLogoMimeType: null,
      tenantBrandName: 'Unknown Brand',
      isDraftPreview: false,
    })

    const iconLink = links.find((l) => l.key === 'app-icon-tenant')
    assert.equal(iconLink?.type, undefined)
  })

  test('getCloudflareImageVariantUrl replaces /public with flexible variant options', () => {
    const original = 'https://imagedelivery.net/account/imageid/public'
    const transformed192 = getCloudflareImageVariantUrl(original, 192, 192, 'png')
    const transformed512 = getCloudflareImageVariantUrl(original, 512, 512, 'png')

    assert.equal(transformed192, 'https://imagedelivery.net/account/imageid/w=192,h=192,fit=pad,f=png')
    assert.equal(transformed512, 'https://imagedelivery.net/account/imageid/w=512,h=512,fit=pad,f=png')
  })

  test('isPlatformAssetUrl narrows platform classification so external URLs are allowed', () => {
    assert.equal(isPlatformAssetUrl('/favicon.ico'), true)
    assert.equal(isPlatformAssetUrl('/platform/favicon.ico'), true)
    assert.equal(isPlatformAssetUrl('https://krabiclaw.com/favicon.ico'), true)
    // Valid customer-hosted URLs must NOT be rejected
    assert.equal(isPlatformAssetUrl('https://client.example/favicon.ico'), false)
    assert.equal(isPlatformAssetUrl('https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/43fb6656-0913-4f3b-be60-b5f180f80400/public'), false)
  })

  test('getTenantFaviconSvg wraps logo image in SVG when logoUrl is present', () => {
    const svgWithLogo = getTenantFaviconSvg('Pottery House', 'https://imagedelivery.net/abc/logo/public')
    assert.match(svgWithLogo, /<image href="https:\/\/imagedelivery\.net\/abc\/logo\/public"/)

    const svgInitial = getTenantFaviconSvg('Pottery House', null)
    assert.match(svgInitial, /<text[^>]*>P<\/text>/)
  })
})
