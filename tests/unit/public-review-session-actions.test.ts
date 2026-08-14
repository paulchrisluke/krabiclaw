import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type JsonResult = { body: Record<string, unknown>; status: number }
type BatchQuery = { query: string; params?: unknown[] }
type SqliteDb = InstanceType<typeof Database>

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT,
    email TEXT,
    review_request_opted_out_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    brand_name TEXT,
    public_url TEXT,
    subdomain TEXT
  );
  CREATE TABLE business_locations (
    id TEXT PRIMARY KEY,
    slug TEXT,
    title TEXT,
    google_place_id TEXT,
    google_review_url TEXT
  );
  CREATE TABLE reservation_submissions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    location_id TEXT,
    customer_id TEXT,
    name TEXT,
    email TEXT,
    status TEXT NOT NULL,
    completed_at TEXT,
    review_request_sent_at TEXT,
    review_reminder_sent_at TEXT,
    review_submitted_at TEXT,
    review_id TEXT
  );
  CREATE TABLE review_requests (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    location_id TEXT,
    customer_id TEXT NOT NULL,
    booking_type TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    first_sent_at TEXT,
    reminder_sent_at TEXT,
    submitted_at TEXT,
    clicked_at TEXT,
    revoked_at TEXT,
    send_count INTEGER NOT NULL,
    last_error TEXT,
    anonymous_user_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

const state: {
  body: unknown
  readError: Error | null
  sessionUser: { id: string; isAnonymous: boolean } | null
  beforeBatch: (() => void) | null
  batches: BatchQuery[][]
} = {
  body: { token: 'review-token' },
  readError: null,
  sessionUser: { id: 'real-user-1', isAnonymous: false },
  beforeBatch: null,
  batches: [],
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cleanString: (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '',
    cloudflareEnv: () => ({ DB: db }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => { throw new Error('createAuth is outside this test boundary') },
    getAuthSession: async () => state.sessionUser ? { user: state.sessionUser } : null,
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (
      (sqlite.prepare(query).get(...params) as T | undefined) ?? null
    ),
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => (
      sqlite.prepare(query).all(...params) as T[]
    ),
    execute: async (sqlite: SqliteDb, query: string, params: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...params)
      return { meta: { changes: Number(result.changes) } }
    },
    executeBatch: async (sqlite: SqliteDb, batch: BatchQuery[]) => {
      state.batches.push(batch)
      const beforeBatch = state.beforeBatch
      state.beforeBatch = null
      beforeBatch?.()
      const transaction = sqlite.transaction((statements: BatchQuery[]) => statements.map((statement) => {
        const result = sqlite.prepare(statement.query).run(...(statement.params ?? []))
        return { meta: { changes: Number(result.changes) } }
      }))
      return transaction(batch)
    },
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  readBody: globalThis.readBody,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.readBody = async () => {
  if (state.readError) throw state.readError
  return state.body
}

const { default: bindSession } = await import('../../server/api/public/review-requests/bind-session.post.ts?review-session-actions-test') as {
  default: (_event: object) => Promise<JsonResult>
}
const { default: optOut } = await import('../../server/api/public/review-requests/opt-out.post.ts?review-session-actions-test') as {
  default: (_event: object) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.readBody = previousGlobals.readBody
  db.close()
})

test.beforeEach(async () => {
  state.body = { token: 'review-token' }
  state.readError = null
  state.sessionUser = { id: 'real-user-1', isAnonymous: false }
  state.beforeBatch = null
  state.batches = []
  const tokenHash = await hashToken('review-token')
  db.exec(`
    DELETE FROM review_requests;
    DELETE FROM reservation_submissions;
    DELETE FROM business_locations;
    DELETE FROM customers;
    DELETE FROM sites;
  `)
  db.prepare(`INSERT INTO sites (id, brand_name, public_url, subdomain) VALUES (?, ?, ?, ?)`).run(
    'site-1', 'Test Site', 'https://example.test', 'test-site',
  )
  db.prepare(`INSERT INTO business_locations (id, slug, title, google_place_id, google_review_url) VALUES (?, ?, ?, ?, ?)`).run(
    'location-1', 'location-1', 'Test Location', null, null,
  )
  db.prepare(`INSERT INTO customers (id, organization_id, site_id, user_id, name, email, review_request_opted_out_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`).run(
    'customer-1', 'org-1', 'site-1', 'real-user-1', 'Guest', 'guest@example.test', '2026-08-12T00:00:00.000Z',
  )
  db.prepare(`INSERT INTO reservation_submissions (
      id, organization_id, site_id, location_id, customer_id, name, email, status, completed_at,
      review_request_sent_at, review_reminder_sent_at, review_submitted_at, review_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, NULL, NULL, NULL, NULL)`).run(
    'reservation-1', 'org-1', 'site-1', 'location-1', 'customer-1', 'Guest', 'guest@example.test', '2026-08-11T00:00:00.000Z',
  )
  db.prepare(`INSERT INTO review_requests (
      id, organization_id, site_id, location_id, customer_id, booking_type, booking_id,
      token_hash, expires_at, first_sent_at, reminder_sent_at, submitted_at, clicked_at,
      revoked_at, send_count, last_error, anonymous_user_id, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'reservation', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL, ?, ?, ?, ?)`).run(
    'request-1', 'org-1', 'site-1', 'location-1', 'customer-1', 'reservation-1', tokenHash,
    '2099-01-01T00:00:00.000Z', 'anonymous-user-1', 'real-user-1',
    '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z',
  )
})

test('a real Better Auth session can bind after account linking retains its historical anonymous request identity', async () => {
  const response = await bindSession({})

  assert.deepEqual(response, {
    status: 200,
    body: { success: true, requestId: 'request-1' },
  })
  assert.equal(state.batches.length, 1)
})

test('an unbound request atomically binds its anonymous Better Auth session and customer identity', async () => {
  state.sessionUser = { id: 'anonymous-user-2', isAnonymous: true }
  db.prepare('UPDATE review_requests SET user_id = NULL, anonymous_user_id = NULL WHERE id = ?').run('request-1')
  db.prepare('UPDATE customers SET user_id = NULL WHERE id = ?').run('customer-1')

  const response = await bindSession({})

  assert.equal(response.status, 200)
  const request = db.prepare('SELECT user_id, anonymous_user_id FROM review_requests WHERE id = ?').get('request-1')
  assert.equal(request.user_id, null)
  assert.equal(request.anonymous_user_id, 'anonymous-user-2')
  assert.equal(db.prepare('SELECT user_id FROM customers WHERE id = ?').get('customer-1').user_id, 'anonymous-user-2')
  assert.equal(state.batches.length, 1)
})

test('session binding cannot commit after the presented review token is rotated', async () => {
  const originalUpdatedAt = String(db.prepare('SELECT updated_at FROM review_requests WHERE id = ?').get('request-1').updated_at)
  state.beforeBatch = () => {
    db.prepare('UPDATE review_requests SET token_hash = ? WHERE id = ?').run('rotated-token-hash', 'request-1')
  }

  await assert.rejects(() => bindSession({}), /malformed JSON/)

  const request = db.prepare('SELECT user_id, anonymous_user_id, updated_at FROM review_requests WHERE id = ?').get('request-1')
  assert.equal(request.user_id, 'real-user-1')
  assert.equal(request.anonymous_user_id, 'anonymous-user-1')
  assert.equal(request.updated_at, originalUpdatedAt)
  assert.equal(state.batches.length, 1)
})

test('session binding rolls back its request write when the customer identity guard rejects the session', async () => {
  db.prepare('UPDATE customers SET user_id = ? WHERE id = ?').run('different-user', 'customer-1')
  const originalUpdatedAt = String(db.prepare('SELECT updated_at FROM review_requests WHERE id = ?').get('request-1').updated_at)

  await assert.rejects(() => bindSession({}), /malformed JSON/)

  const request = db.prepare('SELECT user_id, anonymous_user_id, updated_at FROM review_requests WHERE id = ?').get('request-1')
  assert.equal(request.user_id, 'real-user-1')
  assert.equal(request.anonymous_user_id, 'anonymous-user-1')
  assert.equal(request.updated_at, originalUpdatedAt)
  assert.equal(db.prepare('SELECT user_id FROM customers WHERE id = ?').get('customer-1').user_id, 'different-user')
  assert.equal(state.batches.length, 1)
})

test('opt-out cannot commit after the presented review token is rotated', async () => {
  state.beforeBatch = () => {
    db.prepare('UPDATE review_requests SET token_hash = ? WHERE id = ?').run('rotated-token-hash', 'request-1')
  }

  await assert.rejects(() => optOut({}), /malformed JSON/)

  assert.equal(db.prepare('SELECT review_request_opted_out_at FROM customers WHERE id = ?').get('customer-1').review_request_opted_out_at, null)
  assert.equal(state.batches.length, 1)
})

test('opt-out updates only the exact token-scoped customer in one guarded batch', async () => {
  db.prepare(`INSERT INTO customers (
      id, organization_id, site_id, user_id, name, email, review_request_opted_out_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)`).run(
    'customer-other', 'org-2', 'site-2', 'Other Guest', 'other@example.test', '2026-08-12T00:00:00.000Z',
  )

  const response = await optOut({})

  assert.deepEqual(response, { status: 200, body: { optedOut: true } })
  assert.ok(db.prepare('SELECT review_request_opted_out_at FROM customers WHERE id = ?').get('customer-1').review_request_opted_out_at)
  assert.equal(db.prepare('SELECT review_request_opted_out_at FROM customers WHERE id = ?').get('customer-other').review_request_opted_out_at, null)
  assert.equal(state.batches.length, 1)
})

test('malformed request streams remain errors and never mutate bind or opt-out state', async () => {
  state.readError = new Error('Malformed JSON')

  await assert.rejects(() => bindSession({}), /Malformed JSON/)
  await assert.rejects(() => optOut({}), /Malformed JSON/)

  assert.equal(state.batches.length, 0)
  assert.equal(db.prepare('SELECT review_request_opted_out_at FROM customers WHERE id = ?').get('customer-1').review_request_opted_out_at, null)
})
