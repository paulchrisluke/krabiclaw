import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { publicSurfaceStylesheetForRequest } from '../../utils/public-surface-hints'

test('public HTML cache policy does not leak onto immutable Nuxt assets', async () => {
  const config = await readFile(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  const policy = await readFile(new URL('../../server/plugins/public-html-cache.ts', import.meta.url), 'utf8')
  const siteConfig = await readFile(new URL('../../server/plugins/runtime-site-config.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(config, /'\/\*\*':\s*\{\s*headers:/)
  assert.match(config, /'\/_nuxt\/\*\*':\s*\{\s*headers:\s*\{\s*'cache-control': 'public, max-age=31536000, immutable'/)
  assert.match(policy, /contentType\.includes\('text\/html'\)/)
  assert.match(policy, /response\.headers\.set\('cache-control', nonProduction/)
  assert.match(siteConfig, /hooks\.hook\('site-config:init'/)
  assert.match(siteConfig, /if \(isPrivateSeoPath\(requestURL\.pathname\)\) return/)
  assert.match(siteConfig, /resolveRuntimeSeoSiteConfig/)
  assert.doesNotMatch(policy, /x-robots-tag/)
})

test('public document stylesheet preload follows the owning surface and route', () => {
  assert.equal(
    publicSurfaceStylesheetForRequest({ pathname: '/', tenantType: 'platform' }),
    '/_nuxt/surfaces/platform.css',
  )
  assert.equal(
    publicSurfaceStylesheetForRequest({ pathname: '/about', tenantType: 'platform' }),
    '/_nuxt/surfaces/platform.css',
  )
  assert.equal(
    publicSurfaceStylesheetForRequest({
      pathname: '/',
      tenantType: 'tenant',
      themeId: 'saya-theme-v1',
      vertical: 'experience',
    }),
    '/_nuxt/surfaces/saya.css',
  )
  assert.equal(
    publicSurfaceStylesheetForRequest({
      pathname: '/about',
      tenantType: 'tenant',
      themeId: 'blawby-theme-v1',
      vertical: 'professional_service',
    }),
    '/_nuxt/surfaces/blawby.css',
  )
  assert.equal(
    publicSurfaceStylesheetForRequest({ pathname: '/', tenantType: 'tenant-404' }),
    null,
  )
})
