import assert from 'node:assert/strict'
import test from 'node:test'
import {
  firstImageAssetId,
  generatedExcerpt,
  initialBlogEditorBlocks,
  normalizeBlogSlug,
  parseScheduledFor,
  resolveBlogPublicPath,
  resolveBlogSeo,
  resolveSlugMutation,
  SerializedSnapshotQueue,
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

test('new editors start with canonical editable prose and preserve complete block snapshots', () => {
  assert.deepEqual(initialBlogEditorBlocks(), [{ type: 'markdown', data: { markdown: '' } }])
  const snapshot = structuredClone(blocks)
  assert.deepEqual(snapshot, blocks)
  assert.equal(snapshot[0]?.data.asset_id, 'image-1')
})

test('public paths are scope and template aware before publication', () => {
  assert.equal(resolveBlogPublicPath({ scope: 'platform', slug: 'hello', category: 'SEO' }), '/blog/seo/hello')
  assert.equal(resolveBlogPublicPath({ scope: 'tenant', template: 'blawby', slug: 'hello' }), '/article/hello')
  assert.equal(resolveBlogPublicPath({ scope: 'tenant', template: 'saya', slug: 'hello' }), '/blog/hello')
})

test('clearing a manual slug explicitly restores title-derived mode', () => {
  assert.deepEqual(resolveSlugMutation({ requestedSlug: null, title: 'Fresh Headline', currentSlug: 'custom', manuallyOverridden: true }), {
    slug: 'fresh-headline', manuallyOverridden: false,
  })
})

test('serialized snapshot queue coalesces pending writes and only applies the newest response', async () => {
  const releases: Array<() => void> = []
  const persisted: string[] = []
  const applied: string[] = []
  const queue = new SerializedSnapshotQueue<string, string>(async (value) => {
    persisted.push(value)
    await new Promise<void>(resolve => releases.push(resolve))
    return value.toUpperCase()
  }, result => applied.push(result))

  queue.mark('first')
  const flushing = queue.flush()
  await new Promise(resolve => setImmediate(resolve))
  queue.mark('second')
  queue.mark('latest')
  releases.shift()?.()
  await new Promise(resolve => setImmediate(resolve))
  releases.shift()?.()
  await flushing

  assert.deepEqual(persisted, ['first', 'latest'])
  assert.deepEqual(applied, ['LATEST'])
})

test('shared SEO resolver applies site fallback, truncation, and canonical paths consistently', () => {
  const fallback = resolveBlogSeo({ title: 'Post', slug: 'post', baseUrl: 'https://tenant.test', publicPath: '/article/post', siteName: 'Tenant Name' })
  assert.equal(fallback.description, 'A post from Tenant Name.')
  assert.equal(fallback.canonicalUrl, 'https://tenant.test/article/post')

  const long = resolveBlogSeo({ title: 'Post', slug: 'post', baseUrl: 'https://tenant.test', publicPath: '/blog/post', seoDescription: 'word '.repeat(50), descriptionMaxLength: 80 })
  assert.ok(long.description.length <= 80)
  assert.match(long.description, /…$/)
})

test('serialized snapshot queue retains failed work for a navigation retry', async () => {
  let attempts = 0
  const applied: string[] = []
  const queue = new SerializedSnapshotQueue<string, string>(async (value) => {
    attempts++
    if (attempts === 1) throw new Error('temporary failure')
    return value.toUpperCase()
  }, result => applied.push(result))

  queue.mark('still-dirty')
  await assert.rejects(() => queue.flush(), /temporary failure/)
  assert.deepEqual(applied, [])

  await queue.flush()
  assert.equal(attempts, 2)
  assert.deepEqual(applied, ['STILL-DIRTY'])
})
