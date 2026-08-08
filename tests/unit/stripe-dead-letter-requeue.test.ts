import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

type SqliteDb = InstanceType<typeof Database>

let beforeBatch: (() => void) | null = null

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function executeBatch(db: SqliteDb, queries: Array<{ query: string; params?: unknown[] }>) {
  beforeBatch?.()
  beforeBatch = null
  const transaction = db.transaction((statements: Array<{ query: string; params?: unknown[] }>) => statements.map((statement) => {
    const result = db.prepare(statement.query).run(...(statement.params ?? []))
    return { meta: { changes: Number(result.changes) } }
  }))
  return transaction(queries)
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst, executeBatch },
})

const {
  applyStripeDeadLetterRequeue,
  assertStripeDeadLetterOperatorSession,
  parseStripeDeadLetterRequeueRequest,
  previewStripeDeadLetterRequeue,
  StripeDeadLetterRequeueError,
} = await import('../../server/utils/stripe-dead-letter-requeue.ts')

const routeSource = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'server', 'api', 'admin', 'billing', 'stripe-dead-letter-requeue.post.ts'),
  'utf8',
)
const oldUtilitySource = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'server', 'utils', 'better-auth-stripe.ts'),
  'utf8',
)

const NOW = new Date('2026-08-10T12:00:00.000Z')
const SECRET = 'stripe-dead-letter-test-secret'
const INPUT = {
  stripeEventId: 'evt_dead_1',
  reason: 'Retry after fixing the projection worker',
  idempotencyKey: 'operator-requeue-1',
}
const RETAINED_PAYLOAD = '{"id":"evt_dead_1","type":"customer.subscription.updated","livemode":false,"data":{"object":{"id":"sub_secret"}}}'

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE stripe_webhook_events (
      id TEXT PRIMARY KEY,
      stripe_event_id TEXT UNIQUE,
      event_type TEXT,
      status TEXT,
      payload TEXT,
      error TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      claim_token TEXT,
      next_attempt_at TEXT,
      attempt_count INTEGER NOT NULL,
      dead_lettered_at TEXT,
      created_at TEXT NOT NULL
    );
  `)
  return db
}

function seedDeadLetter(db: SqliteDb, overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'row-dead-1',
    stripe_event_id: INPUT.stripeEventId,
    event_type: 'customer.subscription.updated',
    status: 'dead_letter',
    payload: RETAINED_PAYLOAD,
    error: 'projection failed',
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    next_attempt_at: null,
    attempt_count: 5,
    dead_lettered_at: '2026-08-09T11:00:00.000Z',
    created_at: '2026-08-09T10:00:00.000Z',
    ...overrides,
  }
  db.prepare(`
    INSERT INTO stripe_webhook_events
      (id, stripe_event_id, event_type, status, payload, error, claimed_at,
       lease_expires_at, claim_token, next_attempt_at, attempt_count,
       dead_lettered_at, created_at)
    VALUES (@id, @stripe_event_id, @event_type, @status, @payload, @error,
            @claimed_at, @lease_expires_at, @claim_token, @next_attempt_at,
            @attempt_count, @dead_lettered_at, @created_at)
  `).run(row)
}

function readRow(db: SqliteDb) {
  return db.prepare('SELECT * FROM stripe_webhook_events WHERE stripe_event_id = ?').get(INPUT.stripeEventId) as Record<string, unknown>
}

function expectError(code: string, statusCode = 409) {
  return (error: unknown) => error instanceof StripeDeadLetterRequeueError
    && error.code === code
    && error.statusCode === statusCode
}

test('request parsing defaults to preview and rejects external event payload fields', () => {
  assert.deepEqual(parseStripeDeadLetterRequeueRequest(INPUT), { mode: 'preview', input: INPUT })
  assert.throws(
    () => parseStripeDeadLetterRequeueRequest({ ...INPUT, payload: RETAINED_PAYLOAD }),
    expectError('invalid_request', 400),
  )
  assert.throws(
    () => parseStripeDeadLetterRequeueRequest({ ...INPUT, mode: 'apply', expectedStateSha256: '0'.repeat(64) }),
    expectError('invalid_request', 400),
  )
})

test('only a direct, non-impersonated operator session supplies the actor', () => {
  assert.equal(assertStripeDeadLetterOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: null } }), 'operator-1')
  assert.throws(
    () => assertStripeDeadLetterOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: 'admin-1' } }),
    expectError('impersonation_forbidden', 403),
  )
  assert.throws(
    () => assertStripeDeadLetterOperatorSession({ user: null, session: null }),
    expectError('authentication_required', 401),
  )
})

test('admin route has billing permission, direct session, and no external payload input', () => {
  assert.match(routeSource, /platformPermissionJsonResponse\(event, env, \{ platform: \['billing'\] \}\)/)
  assert.match(routeSource, /getAuthSession\(event, env\)/)
  assert.match(routeSource, /assertStripeDeadLetterOperatorSession\(session\)/)
  assert.match(routeSource, /parseStripeDeadLetterRequeueRequest\(await readBody<unknown>\(event\)\)/)
  assert.doesNotMatch(routeSource, /Stripe\.Event|payload\s*:/)
  assert.doesNotMatch(oldUtilitySource, /requeueDeadLetterStripeEvent/)
})

test('preview validates retained payload, signs a bounded plan, and exposes no event object data', async () => {
  const db = createDb()
  seedDeadLetter(db)
  const plan = await previewStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', NOW)

  assert.equal(plan.actor, 'operator-1')
  assert.deepEqual(plan.input, INPUT)
  assert.deepEqual(plan.event, {
    stripeEventId: INPUT.stripeEventId,
    eventType: 'customer.subscription.updated',
    livemode: false,
    createdAt: '2026-08-09T10:00:00.000Z',
    deadLetteredAt: '2026-08-09T11:00:00.000Z',
    attemptCount: 5,
  })
  assert.match(plan.payloadSha256, /^[0-9a-f]{64}$/)
  assert.match(plan.expectedStateSha256, /^[0-9a-f]{64}$/)
  assert.match(plan.approvalToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.ok(Date.parse(plan.expiresAt) > NOW.getTime())
  assert.doesNotMatch(JSON.stringify(plan), /sub_secret|"data"/)
  assert.equal(readRow(db).status, 'dead_letter')
})

test('preview blocks missing, expired, malformed, and mismatched retained payloads without writes', async () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['missing', { payload: null }, 'payload_missing'],
    ['expired', { created_at: '2025-01-01T00:00:00.000Z' }, 'payload_expired'],
    ['malformed', { payload: '{not-json' }, 'payload_malformed'],
    ['id mismatch', { payload: RETAINED_PAYLOAD.replace('evt_dead_1', 'evt_other') }, 'payload_mismatch'],
    ['type mismatch', { payload: RETAINED_PAYLOAD.replace('customer.subscription.updated', 'invoice.paid') }, 'payload_mismatch'],
    ['livemode malformed', { payload: RETAINED_PAYLOAD.replace('false', '"false"') }, 'payload_mismatch'],
  ]
  for (const [label, overrides, code] of cases) {
    const db = createDb()
    seedDeadLetter(db, overrides)
    const before = JSON.stringify(readRow(db))
    await assert.rejects(
      () => previewStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', NOW),
      expectError(code),
      label,
    )
    assert.equal(JSON.stringify(readRow(db)), before, label)
  }
})

test('apply performs one CAS update, preserves payload bytes, and resets the retry lease', async () => {
  const db = createDb()
  seedDeadLetter(db)
  const originalPayload = String(readRow(db).payload)
  const plan = await previewStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', NOW)
  const result = await applyStripeDeadLetterRequeue(
    db as never,
    SECRET,
    plan.input,
    'operator-1',
    plan.expectedStateSha256,
    plan.approvalToken,
    NOW,
  )
  assert.deepEqual(result, { status: 'applied', stripeEventId: INPUT.stripeEventId })
  assert.deepEqual(readRow(db), {
    id: 'row-dead-1',
    stripe_event_id: INPUT.stripeEventId,
    event_type: 'customer.subscription.updated',
    status: 'pending',
    payload: originalPayload,
    error: null,
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    next_attempt_at: null,
    attempt_count: 0,
    dead_lettered_at: null,
    created_at: '2026-08-09T10:00:00.000Z',
  })
})

test('an exact replay returns already_requeued without another mutation', async () => {
  const db = createDb()
  seedDeadLetter(db)
  const plan = await previewStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', NOW)
  const first = await applyStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW)
  const afterFirst = JSON.stringify(readRow(db))
  const replay = await applyStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW)
  assert.equal(first.status, 'applied')
  assert.deepEqual(replay, { status: 'already_requeued', stripeEventId: INPUT.stripeEventId })
  assert.equal(JSON.stringify(readRow(db)), afterFirst)
})

test('apply rejects tampered, expired, and stale approvals without writes', async () => {
  const tamperedDb = createDb()
  seedDeadLetter(tamperedDb)
  const tamperedPlan = await previewStripeDeadLetterRequeue(tamperedDb as never, SECRET, INPUT, 'operator-1', NOW)
  await assert.rejects(
    () => applyStripeDeadLetterRequeue(tamperedDb as never, SECRET, INPUT, 'operator-1', tamperedPlan.expectedStateSha256, `${tamperedPlan.approvalToken}x`, NOW),
    expectError('approval_token_invalid'),
  )
  assert.equal(readRow(tamperedDb).status, 'dead_letter')

  const expiredDb = createDb()
  seedDeadLetter(expiredDb)
  const expiredPlan = await previewStripeDeadLetterRequeue(expiredDb as never, SECRET, INPUT, 'operator-1', NOW)
  await assert.rejects(
    () => applyStripeDeadLetterRequeue(expiredDb as never, SECRET, INPUT, 'operator-1', expiredPlan.expectedStateSha256, expiredPlan.approvalToken, new Date('2026-08-10T22:01:00.000Z')),
    expectError('approval_expired'),
  )
  assert.equal(readRow(expiredDb).status, 'dead_letter')

  const staleDb = createDb()
  seedDeadLetter(staleDb)
  const stalePlan = await previewStripeDeadLetterRequeue(staleDb as never, SECRET, INPUT, 'operator-1', NOW)
  staleDb.prepare('UPDATE stripe_webhook_events SET error = ? WHERE stripe_event_id = ?').run('different failure', INPUT.stripeEventId)
  await assert.rejects(
    () => applyStripeDeadLetterRequeue(staleDb as never, SECRET, INPUT, 'operator-1', stalePlan.expectedStateSha256, stalePlan.approvalToken, NOW),
    expectError('stale_state'),
  )
  assert.equal(readRow(staleDb).status, 'dead_letter')
})

test('CAS race returns stale_state and does not partially requeue', async () => {
  const db = createDb()
  seedDeadLetter(db)
  const plan = await previewStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', NOW)
  beforeBatch = () => {
    db.prepare('UPDATE stripe_webhook_events SET status = ?, error = ? WHERE stripe_event_id = ?').run('failed', 'race', INPUT.stripeEventId)
  }
  await assert.rejects(
    () => applyStripeDeadLetterRequeue(db as never, SECRET, INPUT, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW),
    expectError('stale_state'),
  )
  assert.equal(readRow(db).status, 'failed')
  assert.equal(readRow(db).payload, RETAINED_PAYLOAD)
})
