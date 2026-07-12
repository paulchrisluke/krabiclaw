import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isNonIndexableHost,
  isPrivateSeoPath,
  isTenantOnlySeoPath,
  PLATFORM_SITEMAP_ROUTES,
  PRIVATE_EXACT_ROUTES,
  PRIVATE_ROUTE_PREFIXES,
} from '../../server/utils/seo-policy.ts'

test('platform sitemap allowlist contains only intentional public content routes', () => {
  assert.deepEqual(PLATFORM_SITEMAP_ROUTES, [
    '/',
    '/about',
    '/blog',
    '/docs',
    '/features',
    '/help',
    '/plugin',
    '/pricing',
    '/privacy',
    '/templates',
    '/terms',
  ])

  for (const route of PLATFORM_SITEMAP_ROUTES) {
    assert.equal(isPrivateSeoPath(route), false, `${route} must not be private`)
    assert.equal(isTenantOnlySeoPath(route), false, `${route} must not be tenant-only`)
  }
})

test('private application route families are never sitemap candidates', () => {
  const examples = [
    '/admin',
    '/admin/blog/new',
    '/api/public/docs',
    '/dashboard/acme',
    '/dev/notifications',
    '/oauth/consent',
    '/preview/site/example',
    '/billing',
    '/forgot-password',
    '/login',
    '/reservations/cancel',
    '/reset-password',
    '/signup',
    '/tenant-setup-pending',
  ]

  for (const route of examples) assert.equal(isPrivateSeoPath(route), true, route)
  for (const route of PLATFORM_SITEMAP_ROUTES) assert.equal(isPrivateSeoPath(route), false, route)
})

test('tenant-only routes cannot render as thin platform pages', () => {
  for (const route of [
    '/contact',
    '/experiences',
    '/experiences/pottery-class',
    '/locations',
    '/locations/krabi',
    '/menu',
    '/menu/pad-thai',
    '/order',
    '/photos',
    '/posts',
    '/qa',
    '/reservations',
    '/reviews',
  ]) {
    assert.equal(isTenantOnlySeoPath(route), true, route)
  }

  assert.equal(isTenantOnlySeoPath('/about'), false)
  assert.equal(isTenantOnlySeoPath('/blog'), false)
  assert.equal(isTenantOnlySeoPath('/docs'), false)
})

test('preview and deployment-provider hosts are globally non-indexable', () => {
  for (const host of [
    'preview.krabiclaw.com',
    'staging.krabiclaw.com',
    'local.krabiclaw.com',
    'krabiclaw.pages.dev',
    'krabiclaw-preview.paulchrisluke.workers.dev',
    'random.trycloudflare.com',
  ]) {
    assert.equal(isNonIndexableHost(host), true, host)
  }

  assert.equal(isNonIndexableHost('krabiclaw.com'), false)
  assert.equal(isNonIndexableHost('www.krabiclaw.com'), false)
  assert.equal(isNonIndexableHost('potteryhousekrabi.com'), false)
})

test('all configured private routes are represented by the classifier', () => {
  for (const route of PRIVATE_EXACT_ROUTES) assert.equal(isPrivateSeoPath(route), true, route)
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    assert.equal(isPrivateSeoPath(prefix), true, prefix)
    assert.equal(isPrivateSeoPath(`${prefix}/example`), true, prefix)
  }
})
