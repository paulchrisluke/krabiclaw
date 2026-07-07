import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePostSlug, postPublicPath } from '../../utils/post-slugs.ts'

describe('post slug helpers', () => {
  test('normalizes owner post titles into stable URL slugs', () => {
    assert.equal(normalizePostSlug(' Fresh Clay & Sunset: July Workshop! '), 'fresh-clay-and-sunset-july-workshop')
    assert.equal(normalizePostSlug(''), 'post')
    assert.equal(normalizePostSlug(null), 'post')
  })

  test('builds encoded public post paths', () => {
    assert.equal(postPublicPath('fresh-clay'), '/posts/fresh-clay')
    assert.equal(postPublicPath('legacy id'), '/posts/legacy%20id')
  })
})
