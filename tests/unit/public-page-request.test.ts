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

test('home requests only critical datasets for the initial document', () => {
  assert.deepEqual(getPublicPageRequest('/').datasets, ['content', 'location', 'menu', 'experiences'])
})

test('public resource URLs are built from an explicit route snapshot', () => {
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
    '/api/public/drafts/draft-1/page?page=about&datasets=content&locale=th&preview=true&token=preview-token',
  )
})
