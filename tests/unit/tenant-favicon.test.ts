import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { buildTenantHeadLinks } from '../../utils/tenant-head'
import { isPlatformAssetUrl, getTenantFaviconSvg } from '../../server/utils/tenant-favicon'

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

  test('buildTenantHeadLinks for PNG logo tenant emits shortcut, apple-touch, icon with image/png and version param', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/abc/logo.png',
      tenantBrandName: 'Kikuzuki',
      isDraftPreview: false,
    })

    assert.ok(links.length >= 4)
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

  test('buildTenantHeadLinks for JPEG logo tenant (Pottery House) emits image/jpeg type', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/abc/logo.jpg',
      tenantBrandName: 'Pottery House Krabi',
      isDraftPreview: false,
    })

    const iconLink = links.find((l) => l.key === 'app-icon-tenant')
    assert.equal(iconLink?.type, 'image/jpeg')
    assert.match(iconLink?.href || '', /^\/tenant-icon\?v=/)
  })

  test('buildTenantHeadLinks for dedicated SVG favicon tenant emits image/svg+xml type', () => {
    const links = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: null,
      tenantFaviconUrl: 'https://cdn.example.com/custom-icon.svg',
      tenantBrandName: 'Custom Brand',
      isDraftPreview: false,
    })

    const iconLink = links.find((l) => l.key === 'app-icon-tenant')
    assert.equal(iconLink?.type, 'image/svg+xml')
  })

  test('buildTenantHeadLinks version fingerprint changes when logo URL changes', () => {
    const links1 = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/v1/logo.png',
      tenantBrandName: 'Test Tenant',
      isDraftPreview: false,
    })

    const links2 = buildTenantHeadLinks({
      isPlatform: false,
      tenantLogoUrl: 'https://imagedelivery.net/v2/logo.png',
      tenantBrandName: 'Test Tenant',
      isDraftPreview: false,
    })

    const icon1 = links1.find((l) => l.key === 'app-icon-tenant')
    const icon2 = links2.find((l) => l.key === 'app-icon-tenant')

    assert.notEqual(icon1?.href, icon2?.href)
  })

  test('isPlatformAssetUrl correctly identifies platform static favicon assets', () => {
    assert.equal(isPlatformAssetUrl('/favicon.ico'), true)
    assert.equal(isPlatformAssetUrl('/favicon.svg'), true)
    assert.equal(isPlatformAssetUrl('/apple-touch-icon.png'), true)
    assert.equal(isPlatformAssetUrl('/favicon-96x96.png'), true)
    assert.equal(isPlatformAssetUrl('/platform/favicon.ico'), true)
    assert.equal(isPlatformAssetUrl('https://imagedelivery.net/abc/123/public'), false)
    assert.equal(isPlatformAssetUrl('https://example.com/logo.png'), false)
  })

  test('getTenantFaviconSvg generates brand initial SVG badge', () => {
    const potterySvg = getTenantFaviconSvg('Pottery House')
    assert.match(potterySvg, /<text[^>]*>P<\/text>/)

    const kikuzukiSvg = getTenantFaviconSvg('Kikuzuki')
    assert.match(kikuzukiSvg, /<text[^>]*>K<\/text>/)
  })
})
