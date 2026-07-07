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
    const [id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at] = params
    db.contentBlocks.push({ id, document_id, parent_block_id, type, position: Number(position), level, data_json, created_at, updated_at })
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('INSERT INTO content_revisions')) {
    const [id, document_id, snapshot_json, body_markdown, created_by, label, created_at] = params
    db.contentRevisions.push({ id, document_id, snapshot_json, body_markdown, created_by, label, created_at })
    return { meta: { changes: 1 } }
  }

  if (query.startsWith('UPDATE content_documents SET draft_revision_id = ?, published_revision_id = ?')) {
    const [draft_revision_id, published_revision_id, updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { draft_revision_id, published_revision_id, updated_at })
    return { meta: { changes: document ? 1 : 0 } }
  }

  if (query.startsWith('UPDATE content_documents SET draft_revision_id = ?')) {
    const [draft_revision_id, updated_at, id] = params
    const document = db.contentDocuments.find(row => row.id === id)
    if (document) Object.assign(document, { draft_revision_id, updated_at })
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
  for (const item of queries) await execute(db, item.query, item.params)
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
  publishContentDocumentRevision,
  renderContentPreview,
  replaceContentBlock,
  syncContentDocumentFromMarkdown,
} = await import('../../server/utils/content-documents.ts')

test('syncContentDocumentFromMarkdown creates blocks and a published revision', async () => {
  const db = createStore()
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
  assert.equal(document.draft_revision_id, result.revision_id)
  assert.equal(document.published_revision_id, result.revision_id)
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
