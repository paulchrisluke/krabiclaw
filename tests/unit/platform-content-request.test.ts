import assert from 'node:assert/strict'
import test from 'node:test'
import { platformBlogCreateInput } from '../../server/utils/platform-content-request.ts'

test('platform blog creation preserves a user-provided first-publish slug', () => {
  const input = platformBlogCreateInput({
    title: 'Generated title',
    slug: 'chosen-first-url',
    content_blocks: [{ type: 'markdown', data: { markdown: 'Body' } }],
  })
  assert.equal(input.slug, 'chosen-first-url')
})
