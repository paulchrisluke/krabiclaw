import assert from 'node:assert/strict'
import test from 'node:test'
import { publicSurfaceStylesheetForRequest } from '../../utils/public-surface-hints'

test('public document stylesheet preload follows the owning surface and route', () => {
  assert.equal(
    publicSurfaceStylesheetForRequest({ pathname: '/', tenantType: 'platform' }),
    '/_nuxt/surfaces/platform-home.css',
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
    '/_nuxt/surfaces/saya-home.css',
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
