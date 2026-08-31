import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPublicPageUrl, getPublicPageRequest } from '../../composables/usePublicPageRequest.ts'
import { splitLocalePrefix } from '../../utils/tenant-locale-path.ts'

test('location experiences route requests an experiences page scoped to the location slug', () => {
  assert.deepEqual(getPublicPageRequest('/locations/beachfront-pottery/experiences'), {
    page: 'experiences',
    location: 'beachfront-pottery',
    experience: null,
    datasets: ['content', 'location', 'experiences', 'experiencePolicies'],
    blogSlug: null,
  })
})

test('global experiences route keeps the site-wide collection unscoped', () => {
  assert.deepEqual(getPublicPageRequest('/experiences'), {
    page: 'experiences',
    location: null,
    experience: null,
    datasets: ['content', 'experiences', 'experiencePolicies'],
    blogSlug: null,
  })
})

test('global reviews and posts routes request their route datasets', () => {
  assert.deepEqual(getPublicPageRequest('/reviews').datasets, ['content', 'reviews'])
  assert.deepEqual(getPublicPageRequest('/posts').datasets, ['content', 'posts'])
})

test('product collection and detail routes request Product data', () => {
  assert.deepEqual(getPublicPageRequest('/products').datasets, ['content', 'products'])
  assert.deepEqual(getPublicPageRequest('/products/handmade-mug').datasets, ['content', 'products'])
})

test('home requests only critical datasets for the initial document', () => {
  assert.deepEqual(getPublicPageRequest('/').datasets, ['content', 'location', 'products', 'experiences'])
})

test('draft public resource URLs never select locale by query parameter', () => {
  const request = {
    ...getPublicPageRequest('/about'),
    locale: 'th',
    token: 'preview-token',
  }
  assert.equal(
    buildPublicPageUrl(null, request, {
      path: '/preview/draft/draft-1/about',
      params: { draftId: 'draft-1' },
    }),
    '/api/public/drafts/draft-1/page?page=about&datasets=content&preview=true&token=preview-token',
  )
})

test('published localized resources use the canonical page endpoint with an explicit locale query', () => {
  const request = { ...getPublicPageRequest('/about'), locale: 'th', token: null }
  assert.equal(
    buildPublicPageUrl('site-1', request, { path: '/th/about', params: {} }),
    '/api/public/sites/site-1/page?page=about&datasets=content&locale=th',
  )
})

test('locale-prefixed routes parse the locale-bare source path', () => {
  const localized = splitLocalePrefix('/th/locations/ao-nang/menu/khao-soi')

  assert.deepEqual(localized, {
    localeSegment: 'th',
    sourcePath: '/locations/ao-nang/menu/khao-soi',
    publicPath: '/th/locations/ao-nang/menu/khao-soi',
  })
  assert.deepEqual(getPublicPageRequest(localized.sourcePath), {
    page: 'menu',
    location: 'ao-nang',
    experience: null,
    datasets: ['content', 'location', 'products', 'experiences', 'experiencePolicies'],
    blogSlug: null,
  })
})

test('source routes remain exact and non-canonical locale prefixes are not stripped', () => {
  assert.deepEqual(splitLocalePrefix('/menu'), {
    localeSegment: null,
    sourcePath: '/menu',
    publicPath: '/menu',
  })
  assert.deepEqual(splitLocalePrefix('/TH/menu'), {
    localeSegment: null,
    sourcePath: '/TH/menu',
    publicPath: '/TH/menu',
  })
})
