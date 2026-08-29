import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'
import { PLATFORM_SITE_ID } from '../../shared/platform-scope.ts'

type SqliteDb = InstanceType<typeof Database>
type BatchQuery = { query: string; params?: unknown[] }

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE blog_posts (
    id TEXT PRIMARY KEY,
    site_id TEXT,
    status TEXT NOT NULL,
    scheduled_for TEXT,
    published_at TEXT,
    first_published_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE content_documents (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

const state: { batches: BatchQuery[][]; beforeBatch: (() => void) | null } = {
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
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => sqlite.prepare(query).all(...params) as T[],
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (sqlite.prepare(query).get(...params) as T | undefined) ?? null,
  },
})

const { publishDueBlogPosts } = await import('../../server/utils/blog-publishing.ts?current-scheduled-publishing')

const NOW = new Date('2026-08-13T12:00:00.000Z')
const DUE_AT = '2026-08-13T11:00:00.000Z'
const POST_UPDATED_AT = '2026-08-13T10:00:00.000Z'
const DOCUMENT_UPDATED_AT = '2026-08-13T10:30:00.000Z'

function insertScheduledPost(input: { id: string; siteId?: string | null; scheduledFor?: string; withDocument?: boolean }) {
  const siteId = input.siteId === undefined ? 'site-1' : input.siteId
  const scheduledFor = input.scheduledFor ?? DUE_AT
  db.prepare(`INSERT INTO blog_posts (id, site_id, status, scheduled_for, published_at, first_published_at, updated_at)
    VALUES (?, ?, 'scheduled', ?, NULL, NULL, ?)`)
    .run(input.id, siteId, scheduledFor, POST_UPDATED_AT)
  if (input.withDocument !== false) {
    db.prepare(`INSERT INTO content_documents (id, owner_type, owner_id, updated_at) VALUES (?, ?, ?, ?)`)
      .run(`${input.id}-document`, siteId === PLATFORM_SITE_ID ? 'platform_blog' : 'tenant_blog', input.id, DOCUMENT_UPDATED_AT)
  }
}

test.beforeEach(() => {
  db.exec('DROP TRIGGER IF EXISTS fail_scheduled_blog_publish; DELETE FROM content_blocks; DELETE FROM content_documents; DELETE FROM blog_posts;')
  state.batches = []
  state.beforeBatch = null
})

test('publishes only due posts with current content documents', async () => {
  insertScheduledPost({ id: 'due-tenant' })
  insertScheduledPost({ id: 'not-due', scheduledFor: '2026-08-14T12:00:00.000Z' })
  insertScheduledPost({ id: 'missing-content', withDocument: false })

  const result = await publishDueBlogPosts(db as unknown as D1Database, NOW)

  assert.deepEqual(result, { published: 1, scheduled_content_issues: ['missing-content'] })
  assert.equal(state.batches.length, 1)
  assert.equal(state.batches[0]?.length, 2)
  assert.deepEqual(
    db.prepare('SELECT status, scheduled_for, published_at, first_published_at FROM blog_posts WHERE id = ?').get('due-tenant'),
    { status: 'published', scheduled_for: null, published_at: DUE_AT, first_published_at: DUE_AT },
  )
  assert.equal(db.prepare('SELECT updated_at FROM content_documents WHERE id = ?').pluck().get('due-tenant-document'), DOCUMENT_UPDATED_AT)
  assert.equal(db.prepare('SELECT status FROM blog_posts WHERE id = ?').pluck().get('not-due'), 'scheduled')
})

test('a concurrent content edit aborts the scheduled publish atomically', async () => {
  insertScheduledPost({ id: 'raced' })
  state.beforeBatch = () => {
    db.prepare('UPDATE content_documents SET updated_at = ? WHERE id = ?').run('2026-08-13T11:30:00.000Z', 'raced-document')
  }

  await assert.rejects(() => publishDueBlogPosts(db as unknown as D1Database, NOW), /CHECK constraint failed/)
  assert.deepEqual(
    db.prepare('SELECT status, scheduled_for FROM blog_posts WHERE id = ?').get('raced'),
    { status: 'scheduled', scheduled_for: DUE_AT },
  )
})

test('a late post failure rolls back the complete scheduled transition', async () => {
  insertScheduledPost({ id: 'rollback', siteId: PLATFORM_SITE_ID })
  db.exec(`CREATE TRIGGER fail_scheduled_blog_publish BEFORE UPDATE OF status ON blog_posts
    WHEN NEW.status = 'published' BEGIN SELECT RAISE(ABORT, 'forced late publish failure'); END;`)

  await assert.rejects(() => publishDueBlogPosts(db as unknown as D1Database, NOW), /forced late publish failure/)
  assert.deepEqual(
    db.prepare('SELECT status, scheduled_for, published_at FROM blog_posts WHERE id = ?').get('rollback'),
    { status: 'scheduled', scheduled_for: DUE_AT, published_at: null },
  )
})
