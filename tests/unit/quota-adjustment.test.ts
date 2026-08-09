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
  applyQuotaAdjustment,
  assertQuotaOperatorSession,
  parseQuotaAdjustmentRequest,
  previewQuotaAdjustment,
  QuotaAdjustmentError,
} = await import('../../server/utils/quota-adjustment.ts')

const routeSource = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'server', 'api', 'admin', 'billing', 'quota-reset.post.ts'),
  'utf8',
)

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE ai_credits (
      organization_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_used INTEGER NOT NULL DEFAULT 0,
      last_topped_up_at TEXT,
      balance_period_key TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX usage_events_org_key ON usage_events (organization_id, idempotency_key);
    CREATE TABLE usage_quota_grants (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      period_key TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT,
      grant_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT,
      idempotency_key TEXT NOT NULL,
      applied_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX usage_quota_grants_org_key ON usage_quota_grants (organization_id, idempotency_key);
  `)
  return db
}

function seedCanonical(db: SqliteDb, organizationId = 'org-adjustment') {
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    organizationId,
    100,
    4,
    '2025-01-01T00:00:00.000Z',
    '2026-08-10',
    '2026-08-10T09:00:00.000Z',
  )
}

const NOW = new Date('2026-08-10T12:00:00.000Z')
const SECRET = 'quota-adjustment-test-secret'
const organizationLookup = {
  findOrganizationById: async (organizationId: string) => organizationId === 'org-adjustment'
    ? { id: organizationId, name: 'Adjustment Organization', slug: 'adjustment' }
    : null,
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-adjustment',
    action: 'manual',
    quantity: 25,
    reason: 'Operator correction',
    idempotencyKey: 'operator-adjustment-1',
    ...overrides,
  }
}

function counts(db: SqliteDb) {
  return {
    credits: Number((db.prepare('SELECT COUNT(*) AS count FROM ai_credits').get() as { count: number }).count),
    grants: Number((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants').get() as { count: number }).count),
    usage: Number((db.prepare('SELECT COUNT(*) AS count FROM usage_events').get() as { count: number }).count),
  }
}

test('adjustment input defaults to preview and rejects unsupported shape', () => {
  assert.deepEqual(parseQuotaAdjustmentRequest(input()), {
    mode: 'preview',
    input: input(),
  })
  assert.throws(
    () => parseQuotaAdjustmentRequest(input({ resource: 'maps_api' })),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'invalid_request',
  )
  assert.throws(
    () => parseQuotaAdjustmentRequest(input({ unit: 'token' })),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'invalid_request',
  )
})

test('only a direct, non-impersonated platform session supplies the actor', () => {
  assert.equal(assertQuotaOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: null } }), 'operator-1')
  assert.throws(
    () => assertQuotaOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: 'admin-1' } }),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'impersonation_forbidden',
  )
  assert.throws(
    () => assertQuotaOperatorSession({ user: null, session: null }),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'authentication_required',
  )
})

test('quota identity comes from the explicit Better Auth lookup and fails closed when missing', async () => {
  const db = createDb()
  seedCanonical(db)
  const calls: string[] = []
  const lookup = {
    findOrganizationById: async (organizationId: string) => {
      calls.push(organizationId)
      return organizationId === 'org-adjustment' ? { id: organizationId } : null
    },
  }

  await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', lookup, NOW)
  assert.deepEqual(calls, ['org-adjustment'])

  await assert.rejects(
    () => previewQuotaAdjustment(db as never, SECRET, input({ organizationId: 'org-missing' }), 'operator-1', lookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'organization_not_found',
  )
})

test('admin billing route delegates only the signed adjustment boundary', () => {
  assert.match(routeSource, /platformPermissionJsonResponse\(event, env, \{ platform: \['billing'\] \}\)/)
  assert.match(routeSource, /getAuthSession\(event, env\)/)
  assert.match(routeSource, /assertQuotaOperatorSession\(session\)/)
  assert.match(routeSource, /getOrgAdapter/)
  assert.match(routeSource, /organizationLookup/)
  assert.match(routeSource, /parseQuotaAdjustmentRequest\(await readBody<unknown>\(event\)\)/)
  assert.doesNotMatch(routeSource, /resetOrganizationQuota|grantQuota/)
  assert.doesNotMatch(routeSource, /resource\?|periodStart\?|periodEnd\?|createdAt\?|createdBy\?/)
  assert.doesNotMatch(routeSource, /getAuthSession[\s\S]{0,120}catch/)
})

test('preview is read-only and returns a signed, state-bound plan', async () => {
  const db = createDb()
  seedCanonical(db)
  const before = counts(db)

  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)

  assert.equal(plan.actor, 'operator-1')
  assert.deepEqual(plan.input, input())
  assert.deepEqual(plan.period, {
    key: 'week:2026-08-10',
    start: '2026-08-10T00:00:00.000Z',
    end: '2026-08-17T00:00:00.000Z',
  })
  assert.equal(plan.state.credits.balance, 100)
  assert.equal(plan.state.credits.lifetimeUsed, 4)
  assert.equal(plan.state.grants.count, 0)
  assert.equal(plan.state.usage.count, 0)
  assert.match(plan.expectedStateSha256, /^[0-9a-f]{64}$/)
  assert.match(plan.approvalToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.ok(Date.parse(plan.expiresAt) > NOW.getTime())
  assert.deepEqual(counts(db), before)
  assert.equal((db.prepare('SELECT last_topped_up_at FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { last_topped_up_at: string }).last_topped_up_at, '2025-01-01T00:00:00.000Z')
})

test('preview rejects missing and legacy credit rows without writing', async () => {
  const missing = createDb()
  const missingBefore = counts(missing)
  await assert.rejects(
    () => previewQuotaAdjustment(missing as never, SECRET, input(), 'operator-1', organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'quota_initialization_required',
  )
  assert.deepEqual(counts(missing), missingBefore)

  const legacy = createDb()
  legacy.prepare(`
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, 100, 4, NULL, ?)
  `).run('org-adjustment', '2026-08-10T09:00:00.000Z')
  const legacyBefore = counts(legacy)
  await assert.rejects(
    () => previewQuotaAdjustment(legacy as never, SECRET, input(), 'operator-1', organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'quota_reconciliation_required',
  )
  assert.deepEqual(counts(legacy), legacyBefore)
})

test('preview rejects a non-null credit row from an older UTC week without writing', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, 100, 4, ?, ?)
  `).run('org-adjustment', '2026-08-03', '2026-08-10T09:00:00.000Z')
  const before = counts(db)
  await assert.rejects(
    () => previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'quota_reconciliation_required',
  )
  assert.deepEqual(counts(db), before)
})

test('preview fails closed on malformed numeric credit state without writing', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 4, ?, ?)
  `).run('org-adjustment', 'not-a-number', '2026-08-10', '2026-08-10T09:00:00.000Z')
  const before = counts(db)
  await assert.rejects(
    () => previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'quota_state_invalid',
  )
  assert.deepEqual(counts(db), before)
})

test('preview fails closed on malformed ledger aggregates and timestamps without writing', async () => {
  const cases: Array<{
    name: string
    seed: (_db: SqliteDb) => void
  }> = [
    {
      name: 'grant quantity',
      seed: (db) => db.prepare(`
        INSERT INTO usage_quota_grants
          (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, idempotency_key, applied_at, created_at)
        VALUES ('bad-grant', 'org-adjustment', 'ai_inference', ?, 'credit', 'week:2026-08-10',
                '2026-08-10T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'manual',
                'bad fixture', 'operator-2', 'bad-grant', NULL, '2026-08-10T10:00:00.000Z')
      `).run('not-a-number'),
    },
    {
      name: 'usage quantity',
      seed: (db) => db.prepare(`
        INSERT INTO usage_events
          (id, organization_id, resource, quantity, unit, idempotency_key, created_at)
        VALUES ('bad-usage', 'org-adjustment', 'ai_inference', ?, 'credit',
                'bad-usage', '2026-08-10T10:00:00.000Z')
      `).run('not-a-number'),
    },
    {
      name: 'grant timestamp',
      seed: (db) => db.prepare(`
        INSERT INTO usage_quota_grants
          (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, idempotency_key, applied_at, created_at)
        VALUES ('bad-time', 'org-adjustment', 'ai_inference', 1, 'credit', 'week:2026-08-10',
                '2026-08-10T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'manual',
                'bad fixture', 'operator-2', 'bad-time', NULL, 'not-a-timestamp')
      `).run(),
    },
  ]

  for (const fixture of cases) {
    const db = createDb()
    seedCanonical(db)
    fixture.seed(db)
    const before = counts(db)
    await assert.rejects(
      () => previewQuotaAdjustment(db as never, SECRET, input({ idempotencyKey: `preview-${fixture.name}` }), 'operator-1', organizationLookup, NOW),
      (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'quota_state_invalid',
      fixture.name,
    )
    assert.deepEqual(counts(db), before, fixture.name)
  }
})

test('manual apply adds credits and preserves historical top-up data', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)

  const result = await applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW)

  assert.equal(result.status, 'applied')
  const credits = db.prepare('SELECT balance, lifetime_used, last_topped_up_at, balance_period_key FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number; lifetime_used: number; last_topped_up_at: string; balance_period_key: string }
  assert.deepEqual(credits, {
    balance: 125,
    lifetime_used: 4,
    last_topped_up_at: '2025-01-01T00:00:00.000Z',
    balance_period_key: '2026-08-10',
  })
  const grant = db.prepare('SELECT resource, unit, quantity, period_key, period_start, period_end, grant_type, reason, created_by, idempotency_key, applied_at FROM usage_quota_grants WHERE organization_id = ?').get('org-adjustment') as Record<string, unknown>
  assert.equal(grant.resource, 'ai_inference')
  assert.equal(grant.unit, 'credit')
  assert.equal(grant.quantity, 25)
  assert.equal(grant.period_key, 'week:2026-08-10')
  assert.equal(grant.grant_type, 'manual')
  assert.equal(grant.reason, 'Operator correction')
  assert.equal(grant.created_by, 'operator-1')
  assert.equal(grant.idempotency_key, 'operator-adjustment-1')
  assert.equal(typeof grant.applied_at, 'string')
})

test('reset apply establishes an exact balance and preserves historical top-up data', async () => {
  const db = createDb()
  seedCanonical(db)
  const resetInput = input({ action: 'reset', quantity: 7, idempotencyKey: 'operator-reset-1' })
  const plan = await previewQuotaAdjustment(db as never, SECRET, resetInput, 'operator-1', organizationLookup, NOW)

  const result = await applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW)

  assert.equal(result.status, 'applied')
  const credits = db.prepare('SELECT balance, lifetime_used, last_topped_up_at FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number; lifetime_used: number; last_topped_up_at: string }
  assert.deepEqual(credits, { balance: 7, lifetime_used: 4, last_topped_up_at: '2025-01-01T00:00:00.000Z' })
  assert.equal((db.prepare('SELECT grant_type FROM usage_quota_grants WHERE organization_id = ?').get('org-adjustment') as { grant_type: string }).grant_type, 'reset')
})

test('apply rejects tampered and expired approvals without writes', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)
  const before = counts(db)

  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, `${plan.approvalToken.slice(0, -1)}x`, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'approval_token_invalid',
  )
  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', '0'.repeat(64), plan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'approval_state_mismatch',
  )
  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, new Date('2026-08-10T22:01:00.000Z')),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'approval_expired',
  )
  assert.deepEqual(counts(db), before)
})

test('exact idempotency replays without a second balance change and conflicting reuse rejects', async () => {
  const db = createDb()
  seedCanonical(db)
  const firstInput = input()
  const firstPlan = await previewQuotaAdjustment(db as never, SECRET, firstInput, 'operator-1', organizationLookup, NOW)
  const conflictingInput = input({ quantity: 26 })
  const conflictingPlan = await previewQuotaAdjustment(db as never, SECRET, conflictingInput, 'operator-1', organizationLookup, NOW)
  const first = await applyQuotaAdjustment(db as never, SECRET, firstInput, 'operator-1', firstPlan.expectedStateSha256, firstPlan.approvalToken, organizationLookup, NOW)
  assert.equal(first.status, 'applied')
  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, conflictingInput, 'operator-1', conflictingPlan.expectedStateSha256, conflictingPlan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'idempotency_conflict',
  )
  const replay = await applyQuotaAdjustment(db as never, SECRET, firstInput, 'operator-1', firstPlan.expectedStateSha256, firstPlan.approvalToken, organizationLookup, NOW)
  assert.equal(replay.status, 'already_applied')
  assert.equal((db.prepare('SELECT balance FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number }).balance, 125)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get('org-adjustment') as { count: number }).count, 1)
})

test('stale ai credit and usage-ledger state rejects with zero adjustment writes', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)
  db.prepare('UPDATE ai_credits SET balance = balance + 1 WHERE organization_id = ?').run('org-adjustment')
  const before = counts(db)
  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'stale_state',
  )
  assert.deepEqual(counts(db), before)

  const usagePlan = await previewQuotaAdjustment(db as never, SECRET, input({ idempotencyKey: 'operator-adjustment-usage' }), 'operator-1', organizationLookup, NOW)
  db.prepare(`
    INSERT INTO usage_events (id, organization_id, resource, quantity, unit, idempotency_key, created_at)
    VALUES (?, ?, 'ai_inference', 3, 'credit', ?, ?)
  `).run('usage-1', 'org-adjustment', 'usage-1', '2026-08-10T11:00:00.000Z')
  const usageBefore = counts(db)
  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, usagePlan.input, 'operator-1', usagePlan.expectedStateSha256, usagePlan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'stale_state',
  )
  assert.deepEqual(counts(db), usageBefore)
})

test('a grant inserted between preview and apply is detected with zero adjustment writes', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)
  db.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
       grant_type, reason, created_by, idempotency_key, applied_at, created_at)
    VALUES (?, ?, 'ai_inference', 10, 'credit', ?, ?, ?, 'manual', ?, ?, ?, ?, ?)
  `).run(
    'concurrent-grant',
    'org-adjustment',
    'week:2026-08-10',
    '2026-08-10T00:00:00.000Z',
    '2026-08-17T00:00:00.000Z',
    'Concurrent operator grant',
    'operator-2',
    'operator-adjustment-concurrent',
    '2026-08-10T11:30:00.000Z',
    '2026-08-10T11:30:00.000Z',
  )
  const before = counts(db)

  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'stale_state',
  )
  assert.deepEqual(counts(db), before)
  assert.equal((db.prepare('SELECT balance FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number }).balance, 100)
})

test('in-batch compare-and-swap rolls back when usage is appended after review', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input(), 'operator-1', organizationLookup, NOW)
  beforeBatch = () => {
    db.prepare(`
      INSERT INTO usage_events (id, organization_id, resource, quantity, unit, idempotency_key, created_at)
      VALUES (?, ?, 'ai_inference', 3, 'credit', ?, ?)
    `).run('race-usage', 'org-adjustment', 'usage-1', '2026-08-10T11:30:00.000Z')
  }

  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'stale_state',
  )
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get('org-adjustment') as { count: number }).count, 0)
  assert.equal((db.prepare('SELECT balance FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number }).balance, 100)
})

test('in-batch compare-and-swap rolls back when a grant is appended after review', async () => {
  const db = createDb()
  seedCanonical(db)
  const plan = await previewQuotaAdjustment(db as never, SECRET, input({ idempotencyKey: 'operator-adjustment-grant-race' }), 'operator-1', organizationLookup, NOW)
  beforeBatch = () => {
    db.prepare(`
      INSERT INTO usage_quota_grants
        (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
         grant_type, reason, created_by, idempotency_key, applied_at, created_at)
      VALUES (?, ?, 'ai_inference', 10, 'credit', ?, ?, ?, 'manual', ?, ?, ?, ?, ?)
    `).run(
      'race-grant',
      'org-adjustment',
      'week:2026-08-10',
      '2026-08-10T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
      'Concurrent operator grant',
      'operator-2',
      'operator-adjustment-race-grant',
      '2026-08-10T11:30:00.000Z',
      '2026-08-10T11:30:00.000Z',
    )
  }

  await assert.rejects(
    () => applyQuotaAdjustment(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, organizationLookup, NOW),
    (error: unknown) => error instanceof QuotaAdjustmentError && error.code === 'stale_state',
  )
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ? AND idempotency_key = ?').get('org-adjustment', 'operator-adjustment-grant-race') as { count: number }).count, 0)
  assert.equal((db.prepare('SELECT balance FROM ai_credits WHERE organization_id = ?').get('org-adjustment') as { balance: number }).balance, 100)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ? AND idempotency_key = ?').get('org-adjustment', 'operator-adjustment-race-grant') as { count: number }).count, 1)
})
