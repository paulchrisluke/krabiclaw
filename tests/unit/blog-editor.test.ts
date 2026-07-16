import assert from 'node:assert/strict'
import test from 'node:test'
import {
  firstImageAssetId,
  generatedExcerpt,
  normalizeBlogSlug,
  parseScheduledFor,
  resolveBlogSeo,
  structuredComponentsFromBlocks,
  type EditorContentBlock,
} from '../../utils/blog-editor.ts'

const blocks: EditorContentBlock[] = [
  { type: 'image', data: { asset_id: 'image-1', caption: 'Not excerpt prose' } },
  { type: 'faq', data: { items: [{ question: 'Question?', answer: 'Answer.' }] } },
  { type: 'markdown', data: { markdown: 'A useful **introduction** with [context](/about).' } },
  { type: 'how_to', data: { steps: [{ text: 'Do the thing' }] } },
]

test('generated fields use meaningful prose and stable defaults', () => {
  assert.equal(generatedExcerpt(blocks), 'A useful introduction with context.')
  assert.equal(normalizeBlogSlug('  A Better Café Story  '), 'a-better-cafe-story')
  assert.deepEqual(resolveBlogSeo({
    title: 'A title', excerpt: 'An excerpt', slug: 'a-title', baseUrl: 'https://example.com', pathPrefix: '/blog',
  }), {
    title: 'A title', description: 'An excerpt', canonicalUrl: 'https://example.com/blog/a-title', robots: 'index, follow',
  })
})

test('social image and schema data derive from canonical blocks', () => {
  assert.equal(firstImageAssetId(blocks), 'image-1')
  const components = structuredComponentsFromBlocks(blocks)
  assert.deepEqual(components.map(component => component.type), ['faq', 'how_to'])
  assert.equal(components.every(component => component.schema_enabled), true)
})

test('scheduled datetimes require an ISO-compatible value and preserve timezone instant', () => {
  assert.equal(parseScheduledFor('2026-07-20T09:00:00-05:00'), '2026-07-20T14:00:00.000Z')
  assert.equal(parseScheduledFor(null), null)
  assert.throws(() => parseScheduledFor('tomorrow morning'), /ISO 8601/)
})
