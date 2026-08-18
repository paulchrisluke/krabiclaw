import assert from 'node:assert/strict'
import test from 'node:test'

import {
  markdownToContentBlocks,
  prepareContentDocumentBlocksReplacement,
  prepareContentDocumentWithBlocks,
  renderContentBlocksToMarkdown,
} from '../../server/utils/content-documents.ts'

test('markdown content is represented directly as ordered current blocks', () => {
  const blocks = markdownToContentBlocks('# Welcome\n\nCurrent body.\n\n## Details')

  assert.deepEqual(blocks.map(block => [block.type, block.position, block.level]), [
    ['heading', 0, 1],
    ['markdown', 1, null],
    ['heading', 2, 2],
  ])
  assert.equal(renderContentBlocksToMarkdown(blocks.map((block, index) => ({
    id: `block-${index}`,
    type: block.type,
    position: block.position,
    level: block.level,
    data_json: JSON.stringify(block.data),
  }))), '# Welcome\n\nCurrent body.\n\n## Details')
})

test('document creation batches the owner, document, current blocks, and timestamp without revisions', () => {
  const ownerInsert = { query: 'INSERT INTO owners (id) VALUES (?)', params: ['owner-1'] }
  const prepared = prepareContentDocumentWithBlocks('tenant_page', 'variant-1', [
    { id: 'block-1', type: 'hero', data: { title: 'Welcome' } },
    { id: 'block-2', type: 'markdown', data: { markdown: 'Current body.' } },
  ], {
    documentId: 'document-1',
    additionalQueriesBefore: [ownerInsert],
  })

  assert.equal(prepared.document.id, 'document-1')
  assert.equal(prepared.queries[0]?.query.startsWith('INSERT INTO content_documents'), true)
  assert.deepEqual(prepared.queries[1], ownerInsert)
  assert.equal(prepared.queries.some(item => item.query.includes('content_revisions')), false)
  assert.equal(prepared.queries.filter(item => item.query.startsWith('INSERT INTO content_blocks')).length, 2)
  assert.equal(prepared.queries.at(-1)?.query, 'UPDATE content_documents SET updated_at = ? WHERE id = ?')
})

test('whole-document replacement uses the document timestamp as an atomic concurrency guard', () => {
  const prepared = prepareContentDocumentBlocksReplacement({
    id: 'document-1',
    owner_type: 'tenant_page',
    owner_id: 'variant-1',
    created_at: '2026-08-18T00:00:00.000Z',
    updated_at: '2026-08-18T01:00:00.000Z',
  }, [
    { id: 'block-1', type: 'markdown', data: { markdown: 'Replacement.' } },
  ], {
    expected_document_updated_at: '2026-08-18T01:00:00.000Z',
    additionalQueriesAfter: [{ query: 'UPDATE owners SET title = ? WHERE id = ?', params: ['Updated', 'owner-1'] }],
  })

  const guard = prepared.queries.find(item => item.query.includes('__content_document_concurrency_guard__'))
  assert.ok(guard)
  assert.deepEqual(guard.params?.slice(-2), ['document-1', '2026-08-18T01:00:00.000Z'])
  assert.equal(prepared.queries.some(item => item.query.includes('content_revisions')), false)
  assert.equal(prepared.queries.at(-1)?.query, 'UPDATE owners SET title = ? WHERE id = ?')
})

test('whole-document replacement rejects a stale preflight timestamp before building writes', () => {
  assert.throws(() => prepareContentDocumentBlocksReplacement({
    id: 'document-1',
    owner_type: 'tenant_page',
    owner_id: 'variant-1',
    created_at: '2026-08-18T00:00:00.000Z',
    updated_at: '2026-08-18T02:00:00.000Z',
  }, [], {
    expected_document_updated_at: '2026-08-18T01:00:00.000Z',
  }), (error: unknown) => Boolean(
    error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 409,
  ))
})
