import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveLocationExperienceHref,
  resolveSiteExperienceHref,
} from '../../utils/experience-navigation.ts'

test('location experience href resolves no, single, and multi-experience destinations', () => {
  assert.equal(resolveLocationExperienceHref('beachfront-pottery', []), null)
  assert.equal(
    resolveLocationExperienceHref('beachfront-pottery', [
      { slug: 'wheel-class', status: 'active' },
    ]),
    '/experiences/wheel-class',
  )
  assert.equal(
    resolveLocationExperienceHref('beachfront-pottery', [
      { slug: 'wheel-class', status: 'active' },
      { slug: 'cocktails-and-clay', status: 'sold_out' },
    ]),
    '/locations/beachfront-pottery/experiences',
  )
})

test('location experience href ignores inactive experiences', () => {
  assert.equal(
    resolveLocationExperienceHref('krabi', [
      { slug: 'draft-class', status: 'inactive' },
    ]),
    null,
  )
  assert.equal(
    resolveLocationExperienceHref('krabi', [
      { slug: 'draft-class', status: 'inactive' },
      { slug: 'published-class', status: 'active' },
    ]),
    '/experiences/published-class',
  )
})

test('site experience href keeps global collection only when multiple experiences are visible', () => {
  assert.equal(resolveSiteExperienceHref([]), null)
  assert.equal(resolveSiteExperienceHref([{ slug: 'single-class', status: 'active' }]), '/experiences/single-class')
  assert.equal(resolveSiteExperienceHref([
    { slug: 'single-class', status: 'active' },
    { slug: 'second-class', status: 'active' },
  ]), '/experiences')
})
