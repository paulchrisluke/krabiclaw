import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>
type BatchQuery = { query: string; params?: unknown[] }

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE blog_posts (
    id TEXT PRIMARY KEY,
    site_id TEXT,
    body TEXT,
    status TEXT NOT NULL,
    scheduled_for TEXT,
    scheduled_revision_id TEXT,
    published_at TEXT,
    first_published_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE content_documents (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    draft_revision_id TEXT,
    published_revision_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE content_revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    published_at TEXT
  );
  CREATE TABLE content_blocks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    parent_block_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('markdown')),
    position INTEGER NOT NULL,
    level INTEGER,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

const state: {
  batches: BatchQuery[][]
  beforeBatch: (() => void) | null
} = {
  batches: [],
  beforeBatch: null,
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (sqlite: SqliteDb, query: string, params: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...params)
      return { meta: { changes: Number(result.changes) } }
    },
    executeBatch: async (sqlite: SqliteDb, batch: BatchQuery[]) => {
      state.beforeBatch?.()
      state.beforeBatch = null
      state.batches.push(batch)
      const transaction = sqlite.transaction((statements: BatchQuery[]) => statements.map((statement) => {
        const result = sqlite.prepare(statement.query).run(...(statement.params ?? []))
        return { meta: { changes: Number(result.changes) } }
      }))
      return transaction(batch)
    },
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => (
      sqlite.prepare(query).all(...params) as T[]
    ),
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (
      (sqlite.prepare(query).get(...params) as T | undefined) ?? null
    ),
  },
})

const { publishDueBlogPosts } = await import('../../server/utils/blog-publishing.ts?scheduled-publishing-invariants')

const NOW = new Date('2026-08-13T12:00:00.000Z')
const DUE_AT = '2026-08-13T11:00:00.000Z'
const POST_UPDATED_AT = '2026-08-13T10:00:00.000Z'
const DOCUMENT_UPDATED_AT = '2026-08-13T10:30:00.000Z'

function insertScheduledPost(input: {
  id: string
  siteId?: string | null
  scheduledFor?: string
  revisionId?: string | null
}) {
  const siteId = input.siteId === undefined ? 'site-1' : input.siteId
  const scheduledFor = input.scheduledFor ?? DUE_AT
  const revisionId = input.revisionId === undefined ? `${input.id}-revision` : input.revisionId
  const documentId = `${input.id}-document`
  const ownerType = siteId === null ? 'platform_blog' : 'tenant_blog'
  db.prepare(`INSERT INTO blog_posts
    (id, site_id, body, status, scheduled_for, scheduled_revision_id, published_at, first_published_at, updated_at)
    VALUES (?, ?, 'Old body', 'scheduled', ?, ?, NULL, NULL, ?)`)
    .run(input.id, siteId, scheduledFor, revisionId, POST_UPDATED_AT)
  db.prepare(`INSERT INTO content_documents
    (id, owner_type, owner_id, draft_revision_id, published_revision_id, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?)`)
    .run(documentId, ownerType, input.id, revisionId, DOCUMENT_UPDATED_AT)
  if (revisionId) {
    db.prepare(`INSERT INTO content_revisions (id, document_id, body_markdown, published_at)
      VALUES (?, ?, ?, NULL)`)
      .run(revisionId, documentId, `# ${input.id} scheduled body`)
  }
}

test.beforeEach(() => {
  db.exec(`
    DROP TRIGGER IF EXISTS fail_scheduled_blog_publish;
    DELETE FROM content_blocks;
    DELETE FROM content_revisions;
    DELETE FROM content_documents;
    DELETE FROM blog_posts;
  `)
  state.batches = []
  state.beforeBatch = null
})

test('publishes only due pinned revisions and reports dangling schedules', async () => {
  insertScheduledPost({ id: 'due-tenant' })
  insertScheduledPost({ id: 'not-due', scheduledFor: '2026-08-14T12:00:00.000Z' })
  insertScheduledPost({ id: 'dangling', revisionId: null })

  const result = await publishDueBlogPosts(db as unknown as D1Database, NOW)

  assert.deepEqual(result, { published: 1, scheduled_revision_issues: ['dangling'] })
  assert.equal(state.batches.length, 1)
  assert.equal(state.batches[0]?.length, 4)

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get('due-tenant') as Record<string, unknown>
  assert.equal(post.status, 'published')
  assert.equal(post.body, '# due-tenant scheduled body')
  assert.equal(post.published_at, DUE_AT)
  assert.equal(post.first_published_at, DUE_AT)
  assert.equal(post.scheduled_for, null)
  assert.equal(post.scheduled_revision_id, null)
  assert.equal(post.updated_at, NOW.toISOString())

  const document = db.prepare('SELECT * FROM content_documents WHERE id = ?').get('due-tenant-document') as Record<string, unknown>
  assert.equal(document.published_revision_id, 'due-tenant-revision')
  assert.equal(document.updated_at, NOW.toISOString())
  const revision = db.prepare('SELECT * FROM content_revisions WHERE id = ?').get('due-tenant-revision') as Record<string, unknown>
  assert.equal(revision.published_at, DUE_AT)
  assert.equal(db.prepare('SELECT status FROM blog_posts WHERE id = ?').pluck().get('not-due'), 'scheduled')
  assert.equal(db.prepare('SELECT COUNT(*) FROM content_blocks').pluck().get(), 0)
})

test('a stale pinned revision aborts before mutating the post or document', async () => {
  insertScheduledPost({ id: 'raced' })
  state.beforeBatch = () => {
    db.prepare('DELETE FROM content_revisions WHERE id = ?').run('raced-revision')
  }

  await assert.rejects(
    () => publishDueBlogPosts(db as unknown as D1Database, NOW),
    /CHECK constraint failed/,
  )

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get('raced') as Record<string, unknown>
  assert.equal(post.status, 'scheduled')
  assert.equal(post.scheduled_for, DUE_AT)
  assert.equal(post.scheduled_revision_id, 'raced-revision')
  assert.equal(post.body, 'Old body')
  const document = db.prepare('SELECT * FROM content_documents WHERE id = ?').get('raced-document') as Record<string, unknown>
  assert.equal(document.published_revision_id, null)
  assert.equal(document.updated_at, DOCUMENT_UPDATED_AT)
})

test('a late batch failure rolls back revision, document, and post publication together', async () => {
  insertScheduledPost({ id: 'rollback', siteId: null })
  db.exec(`
    CREATE TRIGGER fail_scheduled_blog_publish
    BEFORE UPDATE OF status ON blog_posts
    WHEN NEW.status = 'published'
    BEGIN
      SELECT RAISE(ABORT, 'forced late publish failure');
    END;
  `)

  await assert.rejects(
    () => publishDueBlogPosts(db as unknown as D1Database, NOW),
    /forced late publish failure/,
  )

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get('rollback') as Record<string, unknown>
  assert.equal(post.status, 'scheduled')
  assert.equal(post.scheduled_for, DUE_AT)
  assert.equal(post.body, 'Old body')
  const document = db.prepare('SELECT * FROM content_documents WHERE id = ?').get('rollback-document') as Record<string, unknown>
  assert.equal(document.published_revision_id, null)
  assert.equal(document.updated_at, DOCUMENT_UPDATED_AT)
  assert.equal(db.prepare('SELECT published_at FROM content_revisions WHERE id = ?').pluck().get('rollback-revision'), null)
})
