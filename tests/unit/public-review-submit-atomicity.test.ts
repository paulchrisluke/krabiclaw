import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = { headers: Record<string, string>; req: Request }
type BatchQuery = { query: string; params?: unknown[] }

type SqliteDb = InstanceType<typeof Database>

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE review_requests (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    booking_type TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    revoked_at TEXT,
    submitted_at TEXT,
    expires_at TEXT NOT NULL,
    user_id TEXT,
    anonymous_user_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    site_id TEXT,
    location_id TEXT,
    customer_id TEXT,
    booking_id TEXT,
    booking_type TEXT,
    review_request_id TEXT,
    user_id TEXT,
    author_name TEXT,
    rating INTEGER NOT NULL,
    title TEXT,
    content TEXT,
    status TEXT,
    source TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE reservation_submissions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    customer_id TEXT,
    review_submitted_at TEXT,
    review_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    user_id TEXT,
    last_review_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE review_media (
    media_asset_id TEXT PRIMARY KEY,
    review_request_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    review_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

const state: {
  body: unknown
  readError: Error | null
  authError: Error | null
  batches: BatchQuery[][]
  notificationCalls: number
  notificationError: Error | null
} = {
  body: {},
  readError: null,
  authError: null,
  batches: [],
  notificationCalls: 0,
  notificationError: null,
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
    getAuthSession: async () => {
      if (state.authError) throw state.authError
      return { user: { id: 'anonymous-user-1', isAnonymous: true } }
    },
  },
})

mock.module('../../server/utils/hourly-rate-limit.ts', {
  namedExports: {
    getClientIp: () => '192.0.2.10',
    hashClientIp: async () => 'ip-hash',
    incrementHourlyRateLimit: async () => true,
  },
})

mock.module('../../server/utils/review-requests.ts', {
  namedExports: {
    hashReviewRequestToken: async () => 'token-hash',
    getReviewRequestByToken: async () => ({
      request: {
        id: 'request-1',
        customer_id: 'customer-1',
        booking_id: 'reservation-1',
        booking_type: 'reservation',
        user_id: null,
        anonymous_user_id: 'anonymous-user-1',
      },
      context: {
        organization_id: 'org-1',
        site_id: 'site-1',
        location_id: 'location-1',
        customer_name: 'Guest Reviewer',
        guest_name: 'Guest Reviewer',
        site_name: 'Test Site',
      },
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => (
      sqlite.prepare(query).all(...params) as T[]
    ),
    executeBatch: async (sqlite: SqliteDb, batch: BatchQuery[]) => {
      state.batches.push(batch)
      const transaction = sqlite.transaction((statements: BatchQuery[]) => statements.map((statement) => {
        const result = sqlite.prepare(statement.query).run(...(statement.params ?? []))
        return { meta: { changes: Number(result.changes) } }
      }))
      return transaction(batch)
    },
  },
})

mock.module('../../server/utils/notifications.ts', {
  namedExports: {
    notifyReviewReceived: async () => {
      state.notificationCalls += 1
      if (state.notificationError) throw state.notificationError
    },
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getHeader: globalThis.getHeader,
  readBody: globalThis.readBody,
}

mock.module('nitro/h3', {
  namedExports: {
    getHeader: (event: TestEvent, name: string) => event.headers[name.toLowerCase()],
    readBody: async () => {
      if (state.readError) throw state.readError
      return state.body
    },
  },
})

globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getHeader = (event: TestEvent, name: string) => event.headers[name.toLowerCase()]
globalThis.readBody = async () => {
  if (state.readError) throw state.readError
  return state.body
}

const { default: handler } = await import('../../server/api/public/review-requests/submit.post.ts?review-submit-atomicity-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getHeader = previousGlobals.getHeader
  globalThis.readBody = previousGlobals.readBody
})

test.beforeEach(() => {
  state.body = {
    token: 'review-token',
    title: 'A lovely visit',
    content: 'We had a wonderful visit and would return.',
    rating: 5,
    mediaAssetIds: ['image-1', 'video-1'],
  }
  state.readError = null
  state.authError = null
  state.batches = []
  state.notificationCalls = 0
  state.notificationError = null
  db.exec(`
    DROP TRIGGER IF EXISTS ignore_review_customer_update;
    DELETE FROM review_media;
    DELETE FROM reviews;
    DELETE FROM review_requests;
    DELETE FROM reservation_submissions;
    DELETE FROM customers;
    INSERT INTO customers (id, organization_id, site_id, user_id, last_review_at, updated_at)
    VALUES ('customer-1', 'org-1', 'site-1', NULL, NULL, '2026-08-12T00:00:00.000Z');
    INSERT INTO reservation_submissions
      (id, organization_id, site_id, customer_id, review_submitted_at, review_id, updated_at)
    VALUES ('reservation-1', 'org-1', 'site-1', 'customer-1', NULL, NULL, '2026-08-12T00:00:00.000Z');
    INSERT INTO review_requests
      (id, token_hash, organization_id, site_id, customer_id, booking_type, booking_id,
       revoked_at, submitted_at, expires_at, user_id, anonymous_user_id, updated_at)
    VALUES
      ('request-1', 'token-hash', 'org-1', 'site-1', 'customer-1', 'reservation',
       'reservation-1', NULL, NULL, '2099-01-01T00:00:00.000Z', NULL,
       'anonymous-user-1', '2026-08-12T00:00:00.000Z');
    INSERT INTO review_media
      (media_asset_id, review_request_id, customer_id, review_id, kind, status, updated_at)
    VALUES
      ('image-1', 'request-1', 'customer-1', NULL, 'image', 'pending', '2026-08-12T00:00:00.000Z'),
      ('video-1', 'request-1', 'customer-1', NULL, 'video', 'pending', '2026-08-12T00:00:00.000Z');
  `)
})

function invoke() {
  return handler({
    headers: { 'user-agent': 'atomicity-test' },
    req: new Request('http://localhost/api/public/review-requests/submit', {
      headers: { 'user-agent': 'atomicity-test' },
    }),
  })
}

test('commits the review, request, booking, customer identity, and media links in one guarded batch', async () => {
  const response = await invoke()

  assert.equal(response.status, 201)
  assert.equal(response.body.success, true)
  assert.equal(state.batches.length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count, 1)
  assert.ok(db.prepare('SELECT submitted_at FROM review_requests WHERE id = ?').get('request-1').submitted_at)
  assert.ok(db.prepare('SELECT review_id FROM reservation_submissions WHERE id = ?').get('reservation-1').review_id)
  assert.equal(db.prepare('SELECT user_id FROM customers WHERE id = ?').get('customer-1').user_id, 'anonymous-user-1')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM review_media WHERE review_id IS NOT NULL').get().count, 2)
  const batch = state.batches[0] ?? []
  assert.ok(batch.some(statement => statement.query.includes('rr.submitted_at IS NULL')))
  assert.ok(batch.some(statement => statement.query.includes("status = 'pending'") && statement.query.includes('UPDATE review_media')))
  assert.ok(batch.some(statement => statement.query.includes('changes() = ?')))
  assert.equal(state.notificationCalls, 1)
})

test('does not convert malformed JSON or Better Auth failures into anonymous input', async (t) => {
  await t.test('malformed JSON', async () => {
    state.readError = new Error('Malformed JSON')

    await assert.rejects(() => invoke(), /Malformed JSON/)

    assert.equal(state.batches.length, 0)
    assert.equal(state.notificationCalls, 0)
  })

  await t.test('Better Auth failure', async () => {
    state.readError = null
    state.authError = new Error('Better Auth unavailable')

    await assert.rejects(() => invoke(), /Better Auth unavailable/)

    assert.equal(state.batches.length, 0)
    assert.equal(state.notificationCalls, 0)
  })
})

test('rolls back every staged write and skips notification when a guarded update fails mid-batch', async () => {
  db.exec(`
    CREATE TRIGGER ignore_review_customer_update
    BEFORE UPDATE ON customers
    BEGIN
      SELECT RAISE(IGNORE);
    END;
  `)

  await assert.rejects(() => invoke(), /malformed JSON/)

  assert.equal(state.batches.length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count, 0)
  assert.equal(db.prepare('SELECT submitted_at FROM review_requests WHERE id = ?').get('request-1').submitted_at, null)
  assert.equal(db.prepare('SELECT review_id FROM reservation_submissions WHERE id = ?').get('reservation-1').review_id, null)
  assert.equal(db.prepare('SELECT last_review_at FROM customers WHERE id = ?').get('customer-1').last_review_at, null)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM review_media WHERE review_id IS NOT NULL').get().count, 0)
  assert.equal(state.notificationCalls, 0)
})

test('keeps the committed submission response when best-effort owner notification fails', async (t) => {
  state.notificationError = new Error('notification lookup unavailable')
  const errorLog = t.mock.method(console, 'error', () => {})

  const response = await invoke()

  assert.equal(response.status, 201)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count, 1)
  assert.equal(state.notificationCalls, 1)
  assert.equal(errorLog.mock.callCount(), 1)
})
