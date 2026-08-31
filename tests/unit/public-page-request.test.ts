import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPublicPageUrl, getPublicPageRequest } from '../../composables/usePublicPageRequest.ts'

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

test('published localized resources use a locale path segment', () => {
  const request = { ...getPublicPageRequest('/about'), locale: 'th', token: null }
  assert.equal(
    buildPublicPageUrl('site-1', request, { path: '/th/about', params: {} }),
    '/api/public/sites/site-1/localized-page/th?page=about&datasets=content',
  )
})
