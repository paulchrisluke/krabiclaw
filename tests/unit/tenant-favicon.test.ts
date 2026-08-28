import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { resolveTenantFaviconRedirect } from '../../server/utils/tenant-favicon.ts'
import { buildTenantHeadLinks } from '../../utils/tenant-head.ts'
import { TENANT_TYPES } from '../../utils/tenant-routing.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))

test('tenant favicon redirect uses only the explicit favicon placement', () => {
  const faviconUrl = 'https://cdn.example.test/site/favicon.png'
  const site = {
    media: [
      { slot: 'logo', public_url: 'https://cdn.example.test/site/logo.png' },
      { slot: 'favicon', public_url: faviconUrl },
    ],
  }

  assert.equal(resolveTenantFaviconRedirect(TENANT_TYPES.TENANT, site, '/platform/favicon.ico'), faviconUrl)
  assert.equal(resolveTenantFaviconRedirect(TENANT_TYPES.TENANT, site, '/platform/apple-touch-icon.png'), faviconUrl)
})

test('favicon redirect ignores a logo and falls back to the requested platform asset', () => {
  const logoOnlySite = {
    media: [{ slot: 'logo', public_url: 'https://cdn.example.test/site/logo.png' }],
  }

  assert.equal(resolveTenantFaviconRedirect(TENANT_TYPES.TENANT, logoOnlySite, '/platform/favicon.ico'), '/platform/favicon.ico')
  assert.equal(resolveTenantFaviconRedirect(TENANT_TYPES.TENANT, undefined, '/platform/apple-touch-icon.png'), '/platform/apple-touch-icon.png')
  assert.equal(resolveTenantFaviconRedirect(TENANT_TYPES.PLATFORM, {
    media: [{ slot: 'favicon', public_url: 'https://cdn.example.test/site/favicon.png' }],
  }, '/platform/favicon.ico'), '/platform/favicon.ico')
})

test('head links point directly to canonical tenant or static platform assets', () => {
  const faviconUrl = 'https://cdn.example.test/site/favicon.webp'

  assert.deepEqual(buildTenantHeadLinks({ isPlatform: false, tenantFaviconUrl: faviconUrl }), [
    { key: 'app-icon', rel: 'icon', href: faviconUrl },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: faviconUrl },
  ])
  assert.deepEqual(buildTenantHeadLinks({ isPlatform: false }), [
    { key: 'app-icon', rel: 'icon', href: '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: '/platform/apple-touch-icon.png' },
  ])
  assert.deepEqual(buildTenantHeadLinks({ isPlatform: true, tenantFaviconUrl: faviconUrl }), [
    { key: 'app-icon', rel: 'icon', href: '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: '/platform/apple-touch-icon.png' },
  ])
  assert.deepEqual(buildTenantHeadLinks({
    isPlatform: false,
    tenantFaviconUrl: faviconUrl,
    isSitePreview: true,
  }), [])
})

test('only the two redirect routes and two static platform icon assets remain', () => {
  const iconRoutes = readdirSync(`${root}/server/routes`)
    .filter(file => /(?:favicon|apple-touch-icon|webmanifest|tenant-icon)/.test(file))
    .sort()
  const platformIcons = readdirSync(`${root}/public/platform`).sort()

  assert.deepEqual(iconRoutes, ['apple-touch-icon.png.ts', 'favicon.ico.ts'])
  assert.deepEqual(platformIcons, ['apple-touch-icon.png', 'favicon.ico'])
  assert.equal(existsSync(`${root}/pr_body.md`), false)

  const resolver = readFileSync(`${root}/server/utils/tenant-favicon.ts`, 'utf8')
  assert.doesNotMatch(resolver, /fetch\(|sendStream|content-type|logo|transform|resize/)
})
