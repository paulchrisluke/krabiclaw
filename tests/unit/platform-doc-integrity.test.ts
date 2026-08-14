import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

type Query = { query: string; params?: unknown[] }
type Row = Record<string, unknown>

type Store = {
  platformDocs: Row[]
  components: Row[]
  contentDocuments: Row[]
  contentBlocks: Row[]
  contentRevisions: Row[]
  batches: Query[][]
  cleanupAttempts: number
  failQueryMatching?: string | null
  failCleanup?: boolean
}

const DOC_ID = 'doc-1'
const DOCUMENT_ID = 'content-document-1'
const OLD_COMPONENT_ID = 'component-old'
const OLD_REVISION_ID = 'revision-old'

Object.assign(globalThis, {
  createError(input: { statusCode: number; statusMessage: string; cause?: unknown }) {
    return Object.assign(new Error(input.statusMessage, { cause: input.cause }), input)
  },
})

function createStore(): Store {
  return {
    platformDocs: [{
      id: DOC_ID,
      title: 'Original title',
      slug: 'original-title',
      body: 'Original body.',
      excerpt: 'Original excerpt.',
      category: null,
      nav_section: null,
      nav_title: null,
      nav_order: null,
      nav_section_order: null,
      nav_group: null,
      nav_group_order: null,
      hide_from_nav: 0,
      featured_order: null,
      difficulty_level: null,
      sort_order: 0,
      parent_doc_id: null,
      featured_image_asset_id: null,
      status: 'draft',
      published_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
    components: [{
      id: OLD_COMPONENT_ID,
      content_type: 'doc',
      content_id: DOC_ID,
      type: 'faq',
      position: 0,
      label: 'Original FAQ',
      status: 'active',
      render_enabled: 1,
      schema_enabled: 1,
      data_json: JSON.stringify({ items: [{ question: 'Old?', answer: 'Old.', position: 0 }] }),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
    contentDocuments: [{
      id: DOCUMENT_ID,
      owner_type: 'platform_doc',
      owner_id: DOC_ID,
      draft_revision_id: OLD_REVISION_ID,
      published_revision_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
    contentBlocks: [{
      id: 'block-old',
      document_id: DOCUMENT_ID,
      parent_block_id: null,
      type: 'markdown',
      position: 0,
      level: null,
      data_json: JSON.stringify({ markdown: 'Original body.', editor_mode: 'source' }),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
    contentRevisions: [{
      id: OLD_REVISION_ID,
      document_id: DOCUMENT_ID,
      snapshot_json: JSON.stringify({ blocks: [] }),
      body_markdown: 'Original body.',
      created_by: 'user-1',
      label: 'Original revision',
      created_at: '2026-01-01T00:00:00.000Z',
      published_at: null,
    }],
    batches: [],
    cleanupAttempts: 0,
  }
}

function dataSnapshot(store: Store) {
  return structuredClone({
    platformDocs: store.platformDocs,
    components: store.components,
    contentDocuments: store.contentDocuments,
    contentBlocks: store.contentBlocks,
    contentRevisions: store.contentRevisions,
  })
}

function parseAssignments(query: string) {
  const match = /SET\s+([\s\S]+?)\s+WHERE\s+id\s*=\s*\?/i.exec(query)
  assert.ok(match?.[1], `Expected UPDATE assignments in query: ${query}`)
  return match[1].split(',').map(value => value.trim())
}

function applyPlatformDocUpdate(store: Store, query: string, params: unknown[]) {
  const docId = params.at(-1)
  const doc = store.platformDocs.find(row => row.id === docId)
  if (!doc) return { meta: { changes: 0 } }
  let paramIndex = 0
  for (const assignment of parseAssignments(query)) {
    const field = assignment.split('=')[0]?.trim()
    if (!field) continue
    if (/= NULL$/i.test(assignment)) doc[field] = null
    else if (assignment.includes('(SELECT r.body_markdown')) {
      const documentId = params[paramIndex++]
      const document = store.contentDocuments.find(row => row.id === documentId)
      const revision = store.contentRevisions.find(row => row.id === document?.draft_revision_id)
      doc[field] = revision?.body_markdown ?? null
    } else {
      doc[field] = params[paramIndex++]
    }
  }
  return { meta: { changes: 1 } }
}

function applyQuery(store: Store, item: Query) {
  const params = item.params ?? []
  const sql = item.query.trim()

  if (sql.startsWith('UPDATE platform_docs')) return applyPlatformDocUpdate(store, sql, params)
  if (sql.startsWith('INSERT INTO content_documents')) {
    const [id, owner_type, owner_id, created_at, updated_at] = params
    store.contentDocuments.push({ id, owner_type, owner_id, draft_revision_id: null, published_revision_id: null, created_at, updated_at })
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('DELETE FROM platform_content_components')) {
    const [contentType, contentId] = params
    store.components = store.components.filter(row => row.content_type !== contentType || row.content_id !== contentId)
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('INSERT INTO platform_content_components')) {
    const [id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at] = params
    store.components.push({ id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at })
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('DELETE FROM content_blocks')) {
    const [documentId] = params
    store.contentBlocks = store.contentBlocks.filter(row => row.document_id !== documentId)
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('INSERT INTO content_blocks')) {
    if (sql.includes('__content_document_concurrency_guard__')) return { meta: { changes: 0 } }
    const [id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at] = params
    store.contentBlocks.push({ id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at })
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('INSERT INTO content_revisions')) {
    const [id, document_id, snapshot_json, body_markdown, created_by, label, created_at, published_at] = params
    store.contentRevisions.push({ id, document_id, snapshot_json, body_markdown, created_by, label, created_at, published_at })
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('UPDATE content_documents SET draft_revision_id')) {
    const documentId = params.at(-1)
    const document = store.contentDocuments.find(row => row.id === documentId)
    if (!document) return { meta: { changes: 0 } }
    if (sql.includes('published_revision_id = ?')) {
      Object.assign(document, { draft_revision_id: params[0], published_revision_id: params[1], updated_at: params[2] })
    } else {
      Object.assign(document, { draft_revision_id: params[0], updated_at: params[1] })
    }
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('UPDATE content_documents SET published_revision_id = NULL')) {
    const documentId = params.at(-1)
    const document = store.contentDocuments.find(row => row.id === documentId)
    if (document) Object.assign(document, { published_revision_id: null, updated_at: params[0] })
    return { meta: { changes: document ? 1 : 0 } }
  }
  if (sql.startsWith('DELETE FROM content_documents')) {
    store.cleanupAttempts += 1
    if (store.failCleanup) throw new Error('forced cleanup failure')
    const [ownerType, ownerId] = params
    store.contentDocuments = store.contentDocuments.filter(row => row.owner_type !== ownerType || row.owner_id !== ownerId)
    return { meta: { changes: 1 } }
  }
  if (sql.startsWith('DELETE FROM platform_docs')) {
    const [docId] = params
    store.platformDocs = store.platformDocs.filter(row => row.id !== docId)
    return { meta: { changes: 1 } }
  }

  throw new Error(`Unexpected write query: ${sql}`)
}

async function execute(store: Store, query: string, params: unknown[] = []) {
  if (query.trim().startsWith('INSERT INTO platform_docs')) {
    const [id, title, slug, body] = params
    store.platformDocs.push({ id, title, slug, body, status: 'draft' })
    return { meta: { changes: 1 } }
  }
  return applyQuery(store, { query, params })
}

async function executeBatch(store: Store, queries: Query[]) {
  store.batches.push(queries)
  const snapshot = dataSnapshot(store)
  try {
    return queries.map((item) => {
      if (store.failQueryMatching && item.query.includes(store.failQueryMatching)) {
        throw new Error(`forced batch failure: ${store.failQueryMatching}`)
      }
      return applyQuery(store, item)
    })
  } catch (error) {
    Object.assign(store, snapshot)
    throw error
  }
}

async function queryFirst<T>(store: Store, query: string, params: unknown[] = []): Promise<T | null> {
  if (query.includes('FROM platform_docs') && query.includes('WHERE id = ?') && !query.includes('LEFT JOIN')) {
    return (store.platformDocs.find(row => row.id === params[0]) ?? null) as T | null
  }
  if (query.includes('FROM platform_docs') && query.includes('WHERE slug = ?')) {
    return (store.platformDocs.find(row => row.slug === params[0] && (params[1] === undefined || row.id !== params[1])) ?? null) as T | null
  }
  if (query.includes('FROM platform_docs d') && query.includes('LEFT JOIN media_assets')) {
    return (store.platformDocs.find(row => row.id === params[0]) ?? null) as T | null
  }
  if (query.includes('FROM content_documents') && query.includes('owner_type = ?')) {
    const [ownerType, ownerId] = params
    return (store.contentDocuments.find(row => row.owner_type === ownerType && row.owner_id === ownerId) ?? null) as T | null
  }
  if (query.includes('FROM content_documents') && query.includes('WHERE id = ?')) {
    return (store.contentDocuments.find(row => row.id === params[0]) ?? null) as T | null
  }
  if (query.trim().startsWith('UPDATE platform_docs')) {
    const result = applyPlatformDocUpdate(store, query.trim(), params)
    return (result.meta.changes ? { id: params.at(-1) } : null) as T | null
  }
  throw new Error(`Unexpected queryFirst: ${query}`)
}

async function queryAll<T>(store: Store, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM platform_content_components')) {
    const [contentType, contentId] = params
    return store.components.filter(row => row.content_type === contentType && row.content_id === contentId) as T[]
  }
  if (query.includes('FROM content_blocks')) {
    return store.contentBlocks.filter(row => row.document_id === params[0]) as T[]
  }
  if (query.includes('FROM media_assets')) return []
  throw new Error(`Unexpected queryAll: ${query}`)
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const { createPlatformDoc, updatePlatformDoc } = await import('../../server/utils/platform-content.ts')

test('a failed platform-doc update leaves metadata, components, and canonical content unchanged', async () => {
  const store = createStore()
  const before = dataSnapshot(store)
  store.failQueryMatching = 'INSERT INTO content_revisions'

  await assert.rejects(() => updatePlatformDoc(store as unknown as D1Database, DOC_ID, {
    body: 'Replacement body.',
    excerpt: 'Replacement excerpt.',
    components: [{
      type: 'faq',
      label: 'Replacement FAQ',
      data: { items: [{ question: 'New?', answer: 'New.', position: 0 }] },
    }],
  }), /forced batch failure/)

  assert.equal(store.batches.length, 1, 'the complete update must use one atomic batch')
  assert.deepEqual(dataSnapshot(store), before)
})

test('a create rollback failure surfaces both the sync and cleanup errors after one cleanup attempt', async () => {
  const store = createStore()
  store.platformDocs = []
  store.components = []
  store.contentDocuments = []
  store.contentBlocks = []
  store.contentRevisions = []
  store.failQueryMatching = 'INSERT INTO content_revisions'
  store.failCleanup = true

  await assert.rejects(
    () => createPlatformDoc(store as unknown as D1Database, 'user-1', {
      title: 'Create failure',
      body: 'This write will fail.',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError)
      assert.deepEqual(error.errors.map(item => (item as Error).message), [
        'forced batch failure: INSERT INTO content_revisions',
        'forced cleanup failure',
      ])
      return true
    },
  )
  assert.equal(store.cleanupAttempts, 1)
})
