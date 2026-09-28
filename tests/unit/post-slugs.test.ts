import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePostInput, providerCaption } from '../../shared/posts.ts'
import { normalizePostSlug, postPublicPath } from '../../utils/post-slugs.ts'

test('a post route segment comes from its words, and words with nothing usable yield none', () => {
  assert.equal(normalizePostSlug(' Fresh Clay & Sunset: July Workshop! '), 'fresh-clay-and-sunset-july-workshop')
  // No placeholder slug: the caller allocates update-<id> for a post with no words.
  assert.equal(normalizePostSlug(''), '')
  assert.equal(normalizePostSlug('🎉🎉'), '')
  assert.equal(postPublicPath('legacy id'), '/posts/legacy%20id')
})

test('the short-post contract keeps the author\'s caption and link, and refuses what it does not carry', () => {
  const post = parsePostInput({ body: '  Pizza night\nFriday 6pm  ', call_to_action: { label: ' Book ', url: 'tel:+66 75 000 000' } }, 'create')
  assert.equal(post.body, 'Pizza night\nFriday 6pm')
  assert.deepEqual(post.call_to_action, { label: 'Book', url: 'tel:+6675000000' })
  // An empty draft is a draft.
  assert.deepEqual(parsePostInput({}, 'create'), {})
  assert.throws(() => parsePostInput({ body: 'x', post_type: 'event' }, 'create'), /unknown field post_type/)
  assert.throws(() => parsePostInput({ body: 'x', scheduled_for: '2030-01-01T00:00:00Z' }, 'create'), /unknown field scheduled_for/)
  assert.throws(() => parsePostInput({ media: [{ asset_id: 'a', slot: 'cover' }] }, 'update'), /media placements/)
  assert.throws(() => parsePostInput({ call_to_action: { label: 'Go', url: 'javascript:alert(1)' } }, 'create'), /https, http or tel/)
  assert.throws(() => parsePostInput({ call_to_action: { label: '', url: 'https://example.com' } }, 'create'), /label is required/)
  assert.throws(() => parsePostInput({ media: [{ asset_id: 'a', slot: 'cover' }, { asset_id: 'a', slot: 'gallery' }] }, 'create'), /more than once/)
})

test('a provider caption is the body, then the author\'s link on its own line, and nothing more', () => {
  assert.equal(providerCaption('Pizza night', { label: 'Book', url: 'https://example.com/book' }), 'Pizza night\n\nBook: https://example.com/book')
  assert.equal(providerCaption(null, { label: 'Book', url: 'https://example.com/book' }), 'Book: https://example.com/book')
  assert.equal(providerCaption(null, null), '')
})
