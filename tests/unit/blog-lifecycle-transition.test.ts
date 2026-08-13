import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

type Query = { query: string; params?: unknown[] }

type BlogPostRow = {
  id: string
  slug: string
  site_id: string | null
  body: string | null
  status: 'draft' | 'published' | 'scheduled'
  published_at: string | null
  first_published_at: string | null
  scheduled_for: string | null
  scheduled_revision_id: string | null
  updated_at: string
}

type ContentDocumentRow = {
  id: string
  owner_type: 'platform_blog' | 'tenant_blog'
  owner_id: string
  draft_revision_id: string | null
  published_revision_id: string | null
  updated_at: string
}

type ContentRevisionRow = {
  id: string
  document_id: string
  body_markdown: string
  published_at: string | null
}

type ContentBlockRow = {
  id: string
  document_id: string
  type: string
}

type Store = {
  blogPosts: BlogPostRow[]
  contentDocuments: ContentDocumentRow[]
  contentRevisions: ContentRevisionRow[]
  contentBlocks: ContentBlockRow[]
  queryAllCalls: Query[]
  queryFirstCalls: Query[]
  executeCalls: Query[]
  batches: Query[][]
  attemptedStatements: number[]
  invalidGuardTypes: string[]
  beforeBatch?: (() => void) | null
  failQueryMatching?: string | null
}

type DataSnapshot = Pick<Store, 'blogPosts' | 'contentDocuments' | 'contentRevisions' | 'contentBlocks'>

const SITE_ID = 'site-1'
const POST_ID = 'post-1'
const POST_SLUG = 'canonical-post'
const DOCUMENT_ID = 'document-1'
const REVISION_ID = 'revision-draft-1'
const POST_TOKEN = '2026-01-01T00:00:00.000Z'
const DOCUMENT_TOKEN = '2026-01-02T00:00:00.000Z'
const DRAFT_BODY = '# Canonical draft\n\nPublished from the current content revision.'

const VALID_CONTENT_BLOCK_TYPES = new Set([
  'heading',
  'markdown',
  'image',
  'gallery',
  'faq',
  'how_to',
  'divider',
  'ai_assistance',
  'cta',
  'callout',
  'hero',
  'button_group',
  'feature_grid',
  'testimonial_grid',
  'contact_cta',
  'booking_cta',
  'donation_choices',
  'offering_grid',
  'location_grid',
])

Object.assign(globalThis, {
  createError(input: { statusCode: number; statusMessage: string }) {
    return Object.assign(new Error(input.statusMessage), input)
  },
})

function createStore(): Store {
  return {
    blogPosts: [{
      id: POST_ID,
      slug: POST_SLUG,
      site_id: SITE_ID,
      body: 'Previously published body.',
      status: 'draft',
      published_at: null,
      first_published_at: null,
      scheduled_for: null,
      scheduled_revision_id: null,
      updated_at: POST_TOKEN,
    }],
    contentDocuments: [{
      id: DOCUMENT_ID,
      owner_type: 'tenant_blog',
      owner_id: POST_ID,
      draft_revision_id: REVISION_ID,
      published_revision_id: null,
      updated_at: DOCUMENT_TOKEN,
    }],
    contentRevisions: [{
      id: REVISION_ID,
      document_id: DOCUMENT_ID,
      body_markdown: DRAFT_BODY,
      published_at: null,
    }],
    contentBlocks: [],
    queryAllCalls: [],
    queryFirstCalls: [],
    executeCalls: [],
    batches: [],
    attemptedStatements: [],
    invalidGuardTypes: [],
  }
}

function dataSnapshot(store: Store): DataSnapshot {
  return structuredClone({
    blogPosts: store.blogPosts,
    contentDocuments: store.contentDocuments,
    contentRevisions: store.contentRevisions,
    contentBlocks: store.contentBlocks,
  })
}

async function queryAll<T>(db: Store, query: string, params: unknown[] = []): Promise<T[]> {
  db.queryAllCalls.push({ query, params })
  if (!query.includes('FROM blog_posts p') || !query.includes('LEFT JOIN content_documents d')) {
    throw new Error(`Unexpected queryAll hydration query: ${query}`)
  }

  const [ownerType, idOrSlug, repeatedIdOrSlug, scopedSiteId] = params
  assert.equal(idOrSlug, repeatedIdOrSlug)
  return db.blogPosts
    .filter(post => (post.id === idOrSlug || post.slug === idOrSlug)
      && (scopedSiteId === undefined ? post.site_id === null : post.site_id === scopedSiteId))
    .map((post) => {
      const document = db.contentDocuments.find(candidate =>
        candidate.owner_type === ownerType && candidate.owner_id === post.id,
      )
      return {
        id: post.id,
        updated_at: post.updated_at,
        document_id: document?.id ?? null,
        draft_revision_id: document?.draft_revision_id ?? null,
        document_updated_at: document?.updated_at ?? null,
      }
    }) as T[]
}

async function queryFirst<T>(db: Store, query: string, params: unknown[] = []): Promise<T | null> {
  db.queryFirstCalls.push({ query, params })
  if (!query.includes('SELECT p.updated_at, d.updated_at AS document_updated_at')) {
    throw new Error(`Unexpected queryFirst hydration query: ${query}`)
  }

  const [documentId, postId] = params
  const post = db.blogPosts.find(candidate => candidate.id === postId)
  if (!post) return null
  const document = db.contentDocuments.find(candidate => candidate.id === documentId)
  return {
    updated_at: post.updated_at,
    document_updated_at: document?.updated_at ?? null,
    draft_revision_id: document?.draft_revision_id ?? null,
  } as T
}

async function execute(db: Store, query: string, params: unknown[] = []) {
  db.executeCalls.push({ query, params })
  throw new Error(`Lifecycle transition must not issue standalone writes: ${query}`)
}

function applyBatchQuery(db: Store, item: Query) {
  const params = item.params ?? []

  if (item.query.startsWith('INSERT INTO content_blocks')) {
    const [
      id,
      documentId,
      ,
      ,
      guardedPostId,
      expectedPostToken,
      guardedDocumentId,
      expectedDocumentToken,
      expectedDraftRevisionId,
    ] = params as string[]
    const type = '__blog_lifecycle_concurrency_guard__'
    if (!item.query.includes(type)) throw new Error(`Unexpected content block insert: ${item.query}`)

    const postMatches = db.blogPosts.some(post =>
      post.id === guardedPostId && post.updated_at === expectedPostToken,
    )
    const documentMatches = db.contentDocuments.some(document =>
      document.id === guardedDocumentId
      && document.updated_at === expectedDocumentToken
      && document.draft_revision_id === expectedDraftRevisionId,
    )
    if (postMatches && documentMatches) return { meta: { changes: 0 } }

    db.invalidGuardTypes.push(type)
    db.contentBlocks.push({ id, document_id: documentId, type })
    if (!VALID_CONTENT_BLOCK_TYPES.has(type)) {
      throw new Error('D1_ERROR: CHECK constraint failed: content_blocks_type_check')
    }
    return { meta: { changes: 1 } }
  }

  if (item.query.includes('UPDATE blog_posts SET scheduled_for = ?')) {
    const [scheduledFor, documentId, updatedAt, postId, expectedToken] = params as string[]
    const post = db.blogPosts.find(candidate => candidate.id === postId && candidate.updated_at === expectedToken)
    if (!post) return { meta: { changes: 0 } }
    const document = db.contentDocuments.find(candidate => candidate.id === documentId)
    Object.assign(post, {
      scheduled_for: scheduledFor,
      scheduled_revision_id: document?.draft_revision_id ?? null,
      published_at: null,
      status: 'scheduled',
      updated_at: updatedAt,
    })
    return { meta: { changes: 1 } }
  }

  if (item.query.includes('UPDATE blog_posts SET body = (')) {
    const publishing = item.query.includes("status = 'published'")
    const documentId = params[0] as string
    const updatedAt = params[publishing ? 3 : 1] as string
    const postId = params[publishing ? 4 : 2] as string
    const expectedToken = params[publishing ? 5 : 3] as string
    const post = db.blogPosts.find(candidate => candidate.id === postId && candidate.updated_at === expectedToken)
    if (!post) return { meta: { changes: 0 } }
    const document = db.contentDocuments.find(candidate => candidate.id === documentId)
    const revision = db.contentRevisions.find(candidate =>
      candidate.id === document?.draft_revision_id && candidate.document_id === documentId,
    )
    Object.assign(post, {
      body: revision?.body_markdown ?? null,
      scheduled_for: null,
      scheduled_revision_id: null,
      published_at: publishing ? params[1] as string : null,
      first_published_at: publishing ? post.first_published_at ?? params[2] as string : post.first_published_at,
      status: publishing ? 'published' : 'draft',
      updated_at: updatedAt,
    })
    return { meta: { changes: 1 } }
  }

  if (item.query.includes('UPDATE content_revisions') && item.query.includes('SET published_at = COALESCE')) {
    const [publishedAt, documentId] = params as string[]
    const document = db.contentDocuments.find(candidate => candidate.id === documentId)
    const revision = db.contentRevisions.find(candidate =>
      candidate.id === document?.draft_revision_id && candidate.document_id === documentId,
    )
    if (!revision) return { meta: { changes: 0 } }
    revision.published_at ??= publishedAt
    return { meta: { changes: 1 } }
  }

  if (item.query.includes('UPDATE content_documents SET published_revision_id = draft_revision_id')) {
    const [updatedAt, documentId] = params as string[]
    const document = db.contentDocuments.find(candidate => candidate.id === documentId)
    if (!document) return { meta: { changes: 0 } }
    document.published_revision_id = document.draft_revision_id
    document.updated_at = updatedAt
    return { meta: { changes: 1 } }
  }

  if (item.query.includes('UPDATE content_documents SET published_revision_id = NULL')) {
    const [updatedAt, documentId] = params as string[]
    const document = db.contentDocuments.find(candidate => candidate.id === documentId)
    if (!document) return { meta: { changes: 0 } }
    document.published_revision_id = null
    document.updated_at = updatedAt
    return { meta: { changes: 1 } }
  }

  throw new Error(`Unexpected lifecycle batch query: ${item.query}`)
}

async function executeBatch(db: Store, queries: Query[]) {
  const beforeBatch = db.beforeBatch
  db.beforeBatch = null
  beforeBatch?.()

  db.batches.push(queries)
  db.attemptedStatements.push(0)
  const batchIndex = db.attemptedStatements.length - 1
  const snapshot = dataSnapshot(db)
  try {
    const results = []
    for (const item of queries) {
      db.attemptedStatements[batchIndex] = (db.attemptedStatements[batchIndex] ?? 0) + 1
      if (db.failQueryMatching && item.query.includes(db.failQueryMatching)) {
        throw new Error(`Forced batch failure at: ${db.failQueryMatching}`)
      }
      results.push(applyBatchQuery(db, item))
    }
    return results
  } catch (error) {
    db.blogPosts = snapshot.blogPosts
    db.contentDocuments = snapshot.contentDocuments
    db.contentRevisions = snapshot.contentRevisions
    db.contentBlocks = snapshot.contentBlocks
    throw error
  }
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const { updatePlatformBlogLifecycle } = await import('../../server/utils/platform-content.ts')

function lifecycleInput(action: 'publish' | 'unpublish') {
  return {
    action,
    expected_updated_at: POST_TOKEN,
    expected_document_updated_at: DOCUMENT_TOKEN,
  }
}

function assertNoEditorThemeOrMediaHydration(store: Store) {
  const readSql = [...store.queryAllCalls, ...store.queryFirstCalls].map(call => call.query).join('\n')
  assert.doesNotMatch(readSql, /FROM content_blocks|FROM content_revisions|media_assets|site_theme_tokens|FROM sites|platform_content_components/i)
}

function assertBudget(store: Store, expected: {
  preflightReads: number
  recoveryReads: number
  batches: number
  batchStatements?: number
  attemptedStatements?: number
}) {
  assert.equal(store.queryAllCalls.length, expected.preflightReads, 'exact lifecycle preflight-read budget')
  assert.equal(store.queryFirstCalls.length, expected.recoveryReads, 'exact failure-recovery read budget')
  assert.equal(store.executeCalls.length, 0, 'standalone write budget')
  assert.equal(store.batches.length, expected.batches, 'atomic batch-call budget')
  if (expected.batchStatements !== undefined) {
    assert.deepEqual(store.batches.map(batch => batch.length), [expected.batchStatements], 'planned batch-statement budget')
  } else {
    assert.deepEqual(store.batches, [])
  }
  if (expected.attemptedStatements !== undefined) {
    assert.deepEqual(store.attemptedStatements, [expected.attemptedStatements], 'attempted batch-statement budget')
  } else if (expected.batches === 0) {
    assert.deepEqual(store.attemptedStatements, [])
  }
  assertNoEditorThemeOrMediaHydration(store)
}

function assertLifecycleError(error: unknown, statusCode: number, message: string) {
  return error instanceof Error
    && error.message === message
    && (error as { statusCode?: number }).statusCode === statusCode
}

test('publish-now returns only lifecycle state while atomically copying the revision body and publishing its document pointer', async () => {
  const store = createStore()

  const result = await updatePlatformBlogLifecycle(
    store as unknown as D1Database,
    POST_ID,
    lifecycleInput('publish'),
    SITE_ID,
  )

  assert.deepEqual(Object.keys(result).sort(), [
    'content_document_updated_at',
    'id',
    'published_at',
    'scheduled_for',
    'status',
    'updated_at',
  ])
  assert.deepEqual(result, {
    id: POST_ID,
    status: 'published',
    published_at: result.updated_at,
    scheduled_for: null,
    updated_at: result.updated_at,
    content_document_updated_at: result.updated_at,
  })
  assert.ok(Date.parse(result.updated_at) > Date.parse(DOCUMENT_TOKEN))
  assert.deepEqual(store.blogPosts[0], {
    id: POST_ID,
    slug: POST_SLUG,
    site_id: SITE_ID,
    body: DRAFT_BODY,
    status: 'published',
    published_at: result.updated_at,
    first_published_at: result.updated_at,
    scheduled_for: null,
    scheduled_revision_id: null,
    updated_at: result.updated_at,
  })
  assert.equal(store.contentRevisions[0]?.published_at, result.updated_at)
  assert.equal(store.contentDocuments[0]?.published_revision_id, REVISION_ID)
  assert.equal(store.contentDocuments[0]?.updated_at, result.content_document_updated_at)
  assertBudget(store, { preflightReads: 1, recoveryReads: 0, batches: 1, batchStatements: 4, attemptedStatements: 4 })
})

test('unpublish clears publication and scheduling pointers while advancing both concurrency tokens', async () => {
  const store = createStore()
  const firstPublishedAt = '2025-12-01T00:00:00.000Z'
  Object.assign(store.blogPosts[0]!, {
    status: 'published',
    published_at: firstPublishedAt,
    first_published_at: firstPublishedAt,
    scheduled_for: '2099-01-01T00:00:00.000Z',
    scheduled_revision_id: REVISION_ID,
  })
  store.contentDocuments[0]!.published_revision_id = REVISION_ID
  store.contentRevisions[0]!.published_at = firstPublishedAt

  const result = await updatePlatformBlogLifecycle(
    store as unknown as D1Database,
    POST_SLUG,
    lifecycleInput('unpublish'),
    SITE_ID,
  )

  assert.deepEqual(result, {
    id: POST_ID,
    status: 'draft',
    published_at: null,
    scheduled_for: null,
    updated_at: result.updated_at,
    content_document_updated_at: result.updated_at,
  })
  assert.deepEqual(store.blogPosts[0], {
    id: POST_ID,
    slug: POST_SLUG,
    site_id: SITE_ID,
    body: DRAFT_BODY,
    status: 'draft',
    published_at: null,
    first_published_at: firstPublishedAt,
    scheduled_for: null,
    scheduled_revision_id: null,
    updated_at: result.updated_at,
  })
  assert.equal(store.contentDocuments[0]?.published_revision_id, null)
  assert.equal(store.contentDocuments[0]?.updated_at, result.updated_at)
  assert.equal(store.contentRevisions[0]?.published_at, firstPublishedAt)
  assertBudget(store, { preflightReads: 1, recoveryReads: 0, batches: 1, batchStatements: 3, attemptedStatements: 3 })
})

test('scheduled publish pins the current draft revision without hydrating or advancing the content document', async () => {
  const store = createStore()
  const scheduledForInput = '2099-05-01T12:00:00+07:00'
  const scheduledFor = '2099-05-01T05:00:00.000Z'

  const result = await updatePlatformBlogLifecycle(
    store as unknown as D1Database,
    POST_ID,
    { ...lifecycleInput('publish'), scheduled_for: scheduledForInput },
    SITE_ID,
  )

  assert.deepEqual(result, {
    id: POST_ID,
    status: 'scheduled',
    published_at: null,
    scheduled_for: scheduledFor,
    updated_at: result.updated_at,
    content_document_updated_at: DOCUMENT_TOKEN,
  })
  assert.deepEqual(store.blogPosts[0], {
    id: POST_ID,
    slug: POST_SLUG,
    site_id: SITE_ID,
    body: 'Previously published body.',
    status: 'scheduled',
    published_at: null,
    first_published_at: null,
    scheduled_for: scheduledFor,
    scheduled_revision_id: REVISION_ID,
    updated_at: result.updated_at,
  })
  assert.equal(store.contentDocuments[0]?.updated_at, DOCUMENT_TOKEN)
  assert.equal(store.contentDocuments[0]?.published_revision_id, null)
  assert.equal(store.contentRevisions[0]?.published_at, null)
  assertBudget(store, { preflightReads: 1, recoveryReads: 0, batches: 1, batchStatements: 2, attemptedStatements: 2 })
})

test('scheduled publish rejects timezone-less and non-ISO datetimes before reading or writing', async () => {
  for (const scheduled_for of ['2099-05-01T12:00:00', 'May 1 2099 12:00:00 GMT+0700']) {
    const store = createStore()
    await assert.rejects(
      () => updatePlatformBlogLifecycle(
        store as unknown as D1Database,
        POST_ID,
        { ...lifecycleInput('publish'), scheduled_for },
        SITE_ID,
      ),
      error => assertLifecycleError(error, 400, 'scheduled_for must be an ISO 8601 datetime with Z or a numeric timezone offset'),
    )
    assertBudget(store, { preflightReads: 0, recoveryReads: 0, batches: 0 })
  }
})

test('a stale post token fails during the single preflight read without opening a batch', async () => {
  const store = createStore()

  await assert.rejects(
    () => updatePlatformBlogLifecycle(
      store as unknown as D1Database,
      POST_ID,
      { ...lifecycleInput('publish'), expected_updated_at: '2025-01-01T00:00:00.000Z' },
      SITE_ID,
    ),
    error => assertLifecycleError(error, 409, 'Blog post was updated by another writer'),
  )

  assertBudget(store, { preflightReads: 1, recoveryReads: 0, batches: 0 })
})

const concurrentScenarios: Array<{
  name: string
  mutate: (_store: Store) => void
  statusCode: number
  message: string
  attemptedStatements: number
  invalidGuardType: string
}> = [
  {
    name: 'post update',
    mutate(store) {
      Object.assign(store.blogPosts[0]!, {
        body: 'Body committed by the concurrent writer.',
        updated_at: '2098-01-01T00:00:00.000Z',
      })
    },
    statusCode: 409,
    message: 'Blog post was updated by another writer',
    attemptedStatements: 1,
    invalidGuardType: '__blog_lifecycle_concurrency_guard__',
  },
  {
    name: 'post deletion',
    mutate(store) {
      store.blogPosts = []
    },
    statusCode: 404,
    message: 'Post not found',
    attemptedStatements: 1,
    invalidGuardType: '__blog_lifecycle_concurrency_guard__',
  },
  {
    name: 'document update',
    mutate(store) {
      Object.assign(store.contentDocuments[0]!, {
        published_revision_id: REVISION_ID,
        updated_at: '2098-01-02T00:00:00.000Z',
      })
    },
    statusCode: 409,
    message: 'Content document was updated by another writer',
    attemptedStatements: 1,
    invalidGuardType: '__blog_lifecycle_concurrency_guard__',
  },
  {
    name: 'document deletion',
    mutate(store) {
      store.contentDocuments = []
      store.contentRevisions = []
    },
    statusCode: 409,
    message: 'Content document was updated by another writer',
    attemptedStatements: 1,
    invalidGuardType: '__blog_lifecycle_concurrency_guard__',
  },
]

for (const scenario of concurrentScenarios) {
  test(`a concurrent ${scenario.name} between preflight and batch trips the D1 CHECK guard and rolls back`, async () => {
    const store = createStore()
    let concurrentState: DataSnapshot | null = null
    store.beforeBatch = () => {
      scenario.mutate(store)
      concurrentState = dataSnapshot(store)
    }

    await assert.rejects(
      () => updatePlatformBlogLifecycle(
        store as unknown as D1Database,
        POST_ID,
        lifecycleInput('publish'),
        SITE_ID,
      ),
      error => assertLifecycleError(error, scenario.statusCode, scenario.message),
    )

    assert.deepEqual(dataSnapshot(store), concurrentState, 'the failed D1 batch must preserve the external concurrent state exactly')
    assert.deepEqual(store.invalidGuardTypes, [scenario.invalidGuardType])
    assert.equal(store.contentBlocks.some(block => block.type === scenario.invalidGuardType), false)
    assertBudget(store, {
      preflightReads: 1,
      recoveryReads: 1,
      batches: 1,
      batchStatements: 4,
      attemptedStatements: scenario.attemptedStatements,
    })
  })
}

test('a late publish statement failure rolls back body, revision, and document writes before the recovery read', async () => {
  const store = createStore()
  const initialState = dataSnapshot(store)
  store.failQueryMatching = 'UPDATE content_documents SET published_revision_id = draft_revision_id'

  await assert.rejects(
    () => updatePlatformBlogLifecycle(
      store as unknown as D1Database,
      POST_ID,
      lifecycleInput('publish'),
      SITE_ID,
    ),
    /Forced batch failure at: UPDATE content_documents SET published_revision_id = draft_revision_id/,
  )

  assert.deepEqual(dataSnapshot(store), initialState)
  assert.deepEqual(store.invalidGuardTypes, [])
  assertBudget(store, { preflightReads: 1, recoveryReads: 1, batches: 1, batchStatements: 4, attemptedStatements: 4 })
})
