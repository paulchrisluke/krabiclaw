import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildTenantHeadLinks } from '../../utils/tenant-head.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))

test('head links use only the explicit favicon placement', () => {
  const faviconUrl = 'https://cdn.example.test/site/favicon.webp'
  const siteMedia = [
    { slot: 'logo', public_url: 'https://cdn.example.test/site/logo.webp' },
    { slot: 'favicon', public_url: faviconUrl },
  ]

  assert.deepEqual(buildTenantHeadLinks({ isPlatform: false, siteMedia }), [
    { key: 'app-icon', rel: 'icon', href: faviconUrl },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: faviconUrl },
  ])
  assert.deepEqual(buildTenantHeadLinks({
    isPlatform: false,
    siteMedia: [{ slot: 'logo', public_url: 'https://cdn.example.test/site/logo.webp' }],
  }), [
    { key: 'app-icon', rel: 'icon', href: '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: '/platform/apple-touch-icon.png' },
  ])
  assert.deepEqual(buildTenantHeadLinks({ isPlatform: true, siteMedia }), [
    { key: 'app-icon', rel: 'icon', href: '/platform/favicon.ico' },
    { key: 'app-icon-apple', rel: 'apple-touch-icon', href: '/platform/apple-touch-icon.png' },
  ])
  assert.deepEqual(buildTenantHeadLinks({
    isPlatform: false,
    siteMedia,
    isSitePreview: true,
  }), [])
})

test('favicon delivery has one direct head-link path', () => {
  const iconRoutes = readdirSync(`${root}/server/routes`)
    .filter(file => /(?:favicon|apple-touch-icon|webmanifest|tenant-icon)/.test(file))
    .sort()
  const platformIcons = readdirSync(`${root}/public/platform`).sort()

  assert.deepEqual(iconRoutes, [])
  assert.deepEqual(platformIcons, ['apple-touch-icon.png', 'favicon.ico'])
  assert.equal(existsSync(`${root}/pr_body.md`), false)
})
