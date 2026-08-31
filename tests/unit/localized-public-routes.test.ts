import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localizedPublicRouteAliases } from '../../build/localized-public-routes.ts'

test('localized aliases retain the normal public page component and parameters', () => {
  const pages = [
    { name: 'index', path: '/', file: '/repo/pages/index.vue' },
    { name: 'menu', path: '/menu', file: '/repo/pages/menu/index.vue' },
    { name: 'location-menu-product', path: '/locations/:slug()/menu/:productSlug()', file: '/repo/pages/locations/[slug]/menu/[productSlug].vue' },
    { name: 'experience', path: '/experiences/:slug()', file: '/repo/pages/experiences/[slug].vue' },
    { name: 'post', path: '/posts/:slug()', file: '/repo/pages/posts/[slug].vue' },
    { name: 'reservation', path: '/reservations', file: '/repo/pages/reservations/index.vue' },
  ]

  assert.deepEqual(localizedPublicRouteAliases(pages), [
    { name: 'localized-index', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)', file: '/repo/pages/index.vue' },
    { name: 'localized-menu', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)/menu', file: '/repo/pages/menu/index.vue' },
    { name: 'localized-location-menu-product', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)/locations/:slug()/menu/:productSlug()', file: '/repo/pages/locations/[slug]/menu/[productSlug].vue' },
    { name: 'localized-experience', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)/experiences/:slug()', file: '/repo/pages/experiences/[slug].vue' },
    { name: 'localized-post', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)/posts/:slug()', file: '/repo/pages/posts/[slug].vue' },
    { name: 'localized-reservation', path: '/:locale([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)/reservations', file: '/repo/pages/reservations/index.vue' },
  ])
})

test('localized aliases exclude private, platform, preview, and catch-all routes', () => {
  const pages = [
    { name: 'admin', path: '/admin/localization', file: '/repo/pages/admin/localization.vue' },
    { name: 'dashboard', path: '/dashboard/:orgSlug()', file: '/repo/pages/dashboard/[orgSlug]/index.vue' },
    { name: 'pricing', path: '/pricing', file: '/repo/pages/pricing.vue' },
    { name: 'preview', path: '/preview/site/:siteId()', file: '/repo/pages/preview/site/[siteId]/index.vue' },
    { name: 'tenant-path', path: '/:tenantPath(.*)*', file: '/repo/pages/[...tenantPath].vue' },
  ]

  assert.deepEqual(localizedPublicRouteAliases(pages), [])
})
