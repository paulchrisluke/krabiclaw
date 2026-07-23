import assert from 'node:assert/strict'
import test from 'node:test'

import { getBootstrapParams } from '../../composables/useBootstrapParams.ts'

test('location experiences route requests an experiences page scoped to the location slug', () => {
  assert.deepEqual(getBootstrapParams('/locations/beachfront-pottery/experiences'), {
    page: 'experiences',
    location: 'beachfront-pottery',
    experience: null,
    menu: true,
    data: null,
    blogSlug: null,
  })
})

test('global experiences route keeps the site-wide collection unscoped', () => {
  assert.deepEqual(getBootstrapParams('/experiences'), {
    page: 'experiences',
    location: null,
    experience: null,
    menu: true,
    data: null,
    blogSlug: null,
  })
})
