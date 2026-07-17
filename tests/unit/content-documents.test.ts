import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

type Row = Record<string, unknown> & {
  id?: unknown
  document_id?: unknown
  owner_type?: unknown
  owner_id?: unknown
  position?: number
}
type Store = {
  contentDocuments: Row[]
  contentBlocks: Row[]
  contentRevisions: Row[]
  blogPosts: Row[]
  platformDocs: Row[]
  beforeBatch?: (() => void) | null
  documentWriteTimestamp?: string
}

function createStore(): Store {
  return {
    contentDocuments: [],
    contentBlocks: [],
    contentRevisions: [],
    blogPosts: [],
    platformDocs: [],
  }
}

Object.assign(globalThis, {
  createError(input: { statusCode: number; statusMessage: string }) {
    return Object.assign(new Error(input.statusMessage), input)
  },
})

async function execute(db: Store, query: string, params: unknown[] = []) {
  if (query.startsWith('INSERT INTO content_documents')) {
    const [id, owner_type, owner_id, created_at, updated_at] = params
    db.contentDocuments.push({ id, owner_type, owner_id, draft_revision_id: null, published_revision_id: null, created_at, updated_at })
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('DELETE FROM content_blocks')) {
    const [documentId] = params
    db.contentBlocks = db.contentBlocks.filter(block => block.document_id !== documentId)
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('INSERT INTO content_blocks')) {
    if (query.includes('__content_document_concurrency_guard__')) {
      const [, , , , documentId, expectedUpdatedAt] = params
      const current = db.contentDocuments.find(row => row.id === documentId && row.updated_at === expectedUpdatedAt)
      if (!current) throw new Error('CHECK constraint failed: content_blocks_type_check')
      return { meta: { changes: 0 } }
    }
    const [id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at] = params
    db.contentBlocks.push({ id, document_id, parent_block_id, type, position: Number(position), level, data_json, created_at, updated_at })
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('UPDATE content_blocks SET updated_at = ? WHERE id = ? AND updated_at = ?')) {
    const [updated_at, id, expected_updated_at] = params
    const block = db.contentBlocks.find(row => row.id === id && row.updated_at === expected_updated_at)
    if (block) Object.assign(block, { updated_at })
    return { meta: { changes: block ? 1 : 0 } }
  }

  if (query.startsWith('INSERT INTO content_revisions')) {
    const [id, document_id, snapshot_json, body_markdown, created_by, label, created_at] = params
    db.contentRevisions.push({ id, document_id, snapshot_json, body_markdown, created_by, label, created_at })
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('UPDATE content_documents SET draft_revision_id = ?, published_revision_id = ?')) {
    const [draft_revision_id, published_revision_id, updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { draft_revision_id, published_revision_id, updated_at: db.documentWriteTimestamp ?? updated_at })
    return { meta: { changes: document ? 1 : 0 } }
  }

  if (query.startsWith('UPDATE content_documents SET draft_revision_id = ?')) {
    const [draft_revision_id, updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { draft_revision_id, updated_at: db.documentWriteTimestamp ?? updated_at })
    return { meta: { changes: document ? 1 : 0 } }
  }

  if (query.startsWith('UPDATE content_documents SET published_revision_id = NULL')) {
    const [updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { published_revision_id: null, updated_at })
    return { meta: { changes: document ? 1 : 0 } }
  }

  if (query.startsWith('UPDATE content_documents SET published_revision_id = ?')) {
    const [published_revision_id, updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { published_revision_id, updated_at })
    return { meta: { changes: document ? 1 : 0 } }
  }

  if (query.includes('UPDATE blog_posts')) {
    const [body, published_at, updated_at, id] = params
    const post = db.blogPosts.find(row => row.id === id)
    if (post) Object.assign(post, { body, status: 'published', published_at: post.published_at ?? published_at, updated_at })
    return { meta: { changes: post ? 1 : 0 } }
  }

  if (query.includes('UPDATE platform_docs')) {
    const [body, published_at, updated_at, id] = params
    const doc = db.platformDocs.find(row => row.id === id)
    if (doc) Object.assign(doc, { body, status: 'published', published_at: doc.published_at ?? published_at, updated_at })
    return { meta: { changes: doc ? 1 : 0 } }
  }

  throw new Error(`Unexpected execute query: ${query}`)
}

async function executeBatch(db: Store, queries: Array<{ query: string; params: unknown[] }>) {
  const beforeBatch = db.beforeBatch
  db.beforeBatch = null
  beforeBatch?.()
  const results: Array<{ meta: { changes: number } }> = []
  for (const item of queries) results.push(await execute(db, item.query, item.params))
  return results
}

async function queryFirst<T>(db: Store, query: string, params: unknown[] = []): Promise<T | null> {
  if (query.includes('FROM content_documents') && query.includes('owner_type = ?')) {
    const [owner_type, owner_id] = params
    return (db.contentDocuments.find(row => row.owner_type === owner_type && row.owner_id === owner_id) ?? null) as T | null
  }

  if (query.includes('FROM content_documents') && query.includes('WHERE id = ?')) {
    const [id] = params
    return (db.contentDocuments.find(row => row.id === id) ?? null) as T | null
  }

  if (query.includes('FROM content_blocks') && query.includes('WHERE id = ?')) {
    const [id] = params
    return (db.contentBlocks.find(row => row.id === id) ?? null) as T | null
  }

  if (query.includes('FROM content_revisions') && query.includes('WHERE id = ?')) {
    const [id, document_id] = params
    return (db.contentRevisions.find(row => row.id === id && row.document_id === document_id) ?? null) as T | null
  }

  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(db: Store, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM content_blocks') && query.includes('WHERE document_id = ?')) {
    const [document_id] = params
    return db.contentBlocks
      .filter(row => row.document_id === document_id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(row => ({ ...row })) as T[]
  }

  throw new Error(`Unexpected queryAll query: ${query}`)
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const {
  appendContentBlock,
  getContentOutline,
  mergeLegacyBlogComponents,
  publishContentDocumentRevision,
  renderContentPreview,
  replaceContentBlock,
  replaceContentDocumentBlocks,
  replacePublishedContentDocumentBlocks,
  syncContentDocumentFromMarkdown,
} = await import('../../server/utils/content-documents.ts')

test('syncContentDocumentFromMarkdown creates blocks and a published revision', async () => {
  const db = createStore()
  db.documentWriteTimestamp = 'committed-document-token'
  const d1 = db as unknown as D1Database
  const result = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'platform_blog',
    ownerId: 'post-1',
    bodyMarkdown: '# Intro\n\nWelcome.\n\n## Details\n\nMore copy.',
    createdBy: 'user-1',
    publish: true,
  })

  assert.equal(db.contentDocuments.length, 1)
  assert.equal(db.contentRevisions.length, 1)
  const document = db.contentDocuments[0]
  assert.ok(document)
  assert.equal(result.blocks.length, 4)
  assert.deepEqual(result.blocks.map(block => block.type), ['heading', 'markdown', 'heading', 'markdown'])
  assert.equal(result.blocks.find(block => block.type === 'markdown')?.data.editor_mode, 'source')
  assert.equal(document.draft_revision_id, result.revision_id)
  assert.equal(document.published_revision_id, result.revision_id)
  assert.equal(result.document.updated_at, 'committed-document-token')
  assert.equal(result.document.draft_revision_id, result.revision_id)
  assert.equal(result.document.published_revision_id, result.revision_id)
})

test('divider blocks serialize as thematic breaks without disturbing structured blocks', async () => {
  const db = createStore()
  const d1 = db as unknown as D1Database
  const initial = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'tenant_blog', ownerId: 'post-divider', bodyMarkdown: 'Before',
  })
  await appendContentBlock(d1, initial.document.id, { type: 'divider', data: {} })
  const preview = await renderContentPreview(d1, initial.document.id)
  assert.match(preview.body_markdown, /Before\n\n---/)
  assert.equal(preview.blocks.at(-1)?.type, 'divider')
})

test('block edits produce draft previews and reject stale replacement tokens', async () => {
  const db = createStore()
  const d1 = db as unknown as D1Database
  const initial = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'platform_doc',
    ownerId: 'doc-1',
    bodyMarkdown: '# Start\n\nOriginal body.',
  })

  const appended = await appendContentBlock(d1, initial.document.id, {
    type: 'markdown',
    data: { markdown: 'Appended body.' },
  })

  const outline = await getContentOutline(d1, initial.document.id)
  assert.equal(outline.length, 3)
  const firstBlock = outline[0]
  assert.ok(firstBlock)
  assert.equal(appended.blocks.at(-1)?.data.markdown, 'Appended body.')

  const preview = await renderContentPreview(d1, initial.document.id)
  assert.match(preview.body_markdown, /Appended body\./)

  await assert.rejects(
    () => replaceContentBlock(d1, firstBlock.id, {
      expected_updated_at: 'stale',
      data: { text: 'Changed' },
    }),
    (err: unknown) => typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 409,
  )

  const replaced = await replaceContentBlock(d1, firstBlock.id, {
    expected_updated_at: firstBlock.updated_at,
    data: { text: 'Changed heading' },
  })
  assert.equal(replaced.blocks[0]?.id, firstBlock.id)

  const updatedOutline = await getContentOutline(d1, initial.document.id)
  assert.equal(updatedOutline[0]?.id, firstBlock.id)
})

test('publishContentDocumentRevision writes the compatibility body field', async () => {
  const db = createStore()
  const d1 = db as unknown as D1Database
  db.blogPosts.push({ id: 'post-1', body: 'old', status: 'draft', published_at: null, updated_at: '' })
  const initial = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'platform_blog',
    ownerId: 'post-1',
    bodyMarkdown: '# Draft\n\nNew body.',
  })

  await publishContentDocumentRevision(d1, initial.document.id)

  const post = db.blogPosts[0]
  const document = db.contentDocuments[0]
  assert.ok(post)
  assert.ok(document)
  assert.equal(post.status, 'published')
  assert.match(String(post.body), /New body\./)
  assert.equal(document.published_revision_id, document.draft_revision_id)
})

test('legacy structured backfill replaces placeholders in place and reports duplicates and unmatched placeholders', () => {
  const result = mergeLegacyBlogComponents([
    { type: 'markdown', data: { markdown: 'Before\n\n{{component type="faq"}}\n\nMiddle\n\n{{component type="how_to"}}\n\nAfter' } },
  ], [
    { component_id: 'faq-1', type: 'faq', position: 1, data: { items: [{ question: 'Q', answer: 'A' }] } },
    { component_id: 'faq-2', type: 'faq', position: 2, data: { items: [{ question: 'Q2', answer: 'A2' }] } },
  ])

  assert.deepEqual(result.blocks.map(block => block.type), ['markdown', 'faq', 'markdown', 'markdown', 'markdown'])
  assert.equal(result.blocks.some(block => String(block.data.markdown || '').includes('{{component type="how_to"}}')), true)
  assert.ok(result.findings.some(finding => finding.action === 'unmatched_placeholder'))
  assert.ok(result.findings.some(finding => finding.action === 'duplicate'))
})

test('whole-document replacement rejects a stale token after every prior block id was replaced', async () => {
  const db = createStore()
  db.documentWriteTimestamp = 'initial-document-token'
  const d1 = db as unknown as D1Database
  const initial = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'platform_blog', ownerId: 'post-race', bodyMarkdown: 'Original',
  })
  const token = initial.document.updated_at
  assert.equal(token, 'initial-document-token')
  const revisionCount = db.contentRevisions.length
  let reachedBatch = false

  db.beforeBatch = () => {
    reachedBatch = true
    const document = db.contentDocuments[0]!
    document.updated_at = 'newer-document-token'
    db.contentBlocks = [{
      id: 'replacement-id', document_id: document.id, parent_block_id: null,
      type: 'markdown', position: 0, level: null, data_json: JSON.stringify({ markdown: 'Concurrent replacement' }),
      created_at: '', updated_at: 'newer-block-token',
    }]
  }

  await assert.rejects(
    () => replaceContentDocumentBlocks(d1, 'platform_blog', 'post-race', [{ type: 'markdown', data: { markdown: 'Stale writer' } }], { expected_document_updated_at: token }),
    (error: unknown) => typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 409,
  )
  assert.equal(reachedBatch, true)
  assert.equal(db.contentDocuments[0]?.updated_at, 'newer-document-token')
  assert.equal(db.contentBlocks.length, 1)
  assert.equal(db.contentBlocks[0]?.id, 'replacement-id')
  assert.match(String(db.contentBlocks[0]?.data_json), /Concurrent replacement/)
  assert.equal(db.contentRevisions.length, revisionCount)
})

test('published-snapshot backfill preserves a distinct unpublished draft', async () => {
  const db = createStore()
  const d1 = db as unknown as D1Database
  const published = await syncContentDocumentFromMarkdown(d1, {
    ownerType: 'platform_blog', ownerId: 'post-published', bodyMarkdown: 'Published prose', publish: true,
  })
  await appendContentBlock(d1, published.document.id, { type: 'markdown', data: { markdown: 'Unpublished draft addition' } })
  const document = db.contentDocuments[0]!
  const draftRevisionId = document.draft_revision_id
  const liveDraftIds = db.contentBlocks.map(block => block.id)

  await replacePublishedContentDocumentBlocks(d1, 'platform_blog', 'post-published', [
    { type: 'markdown', data: { markdown: 'Published prose' } },
    { type: 'faq', data: { items: [{ question: 'Q', answer: 'A' }] } },
  ], { expected_document_updated_at: String(document.updated_at) })

  assert.equal(document.draft_revision_id, draftRevisionId)
  assert.notEqual(document.published_revision_id, published.revision_id)
  assert.deepEqual(db.contentBlocks.map(block => block.id), liveDraftIds)
})
