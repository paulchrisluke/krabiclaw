import assert from 'node:assert/strict'
import test from 'node:test'

import { getPublicCriticalHomeRequest, getPublicPageRequest } from '../../composables/usePublicPageRequest.ts'

test('homepage critical resource keeps only canonical content data', () => {
  const full = getPublicPageRequest('/')
  const critical = getPublicCriticalHomeRequest({
    ...full,
    locale: 'en',
    token: null,
  })

  assert.deepEqual(critical, {
    page: 'home',
    location: null,
    experience: null,
    datasets: ['content'],
    blogSlug: null,
    locale: 'en',
    token: null,
  })
})
