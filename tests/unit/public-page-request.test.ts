import assert from 'node:assert/strict'
import test from 'node:test'

import { getPublicPageRequest } from '../../composables/usePublicPageRequest.ts'

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
