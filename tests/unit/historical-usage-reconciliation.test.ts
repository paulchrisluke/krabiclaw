import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

let beforeBatch: (() => void) | null = null

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).all(...params) as T[]
}

async function execute(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).run(...params)
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
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const {
  applyHistoricalUsageReconciliation,
  HistoricalUsageReconciliationError,
  parseHistoricalUsageReconciliationRequest,
  previewHistoricalUsageReconciliation,
} = await import('../../server/utils/historical-usage-reconciliation.ts')

const NOW = new Date('2026-08-10T12:00:00.000Z')
const SECRET = 'historical-reconciliation-test-secret'

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE ai_credits (
      organization_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_used INTEGER NOT NULL DEFAULT 0,
      last_topped_up_at TEXT,
      balance_period_key TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE ai_usage_log (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT,
      action TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      cf_gateway_log_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT,
      resource TEXT NOT NULL,
      source TEXT NOT NULL,
      provider TEXT,
      channel TEXT,
      session_id TEXT,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      metadata_json TEXT,
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

function seed(db: SqliteDb, balancePeriodKey: string | null = null) {
  db.prepare('INSERT INTO organization (id) VALUES (?)').run('org-history')
  db.prepare(`
    INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('org-history', 100, 4, '2025-01-01T00:00:00.000Z', balancePeriodKey, '2026-08-10T09:00:00.000Z')
  db.prepare(`
    INSERT INTO ai_usage_log
      (id, organization_id, site_id, action, model, input_tokens, output_tokens, credits_charged, cf_gateway_log_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-token', 'org-history', 'site-1', 'chowbot', 'model-x', 1000, 0, 1, 'gateway-1', '2026-08-01T00:00:00.000Z')
  db.prepare(`
    INSERT INTO ai_usage_log
      (id, organization_id, site_id, action, model, input_tokens, output_tokens, credits_charged, cf_gateway_log_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-flat', 'org-history', null, 'whatsapp_notification', 'flat', 0, 0, 0, null, '2026-08-02T00:00:00.000Z')
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-history',
    cutoffAt: '2026-08-09T23:59:59.999Z',
    reason: 'Backfill legacy AI history',
    idempotencyKey: 'history-op-1',
    ...overrides,
  }
}

function counts(db: SqliteDb) {
  return {
    events: Number((db.prepare('SELECT COUNT(*) AS count FROM usage_events').get() as { count: number }).count),
    grants: Number((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants').get() as { count: number }).count),
    credits: Number((db.prepare('SELECT COUNT(*) AS count FROM ai_credits').get() as { count: number }).count),
  }
}

test('strict request parsing defaults to preview and rejects arbitrary resource or period fields', () => {
  assert.equal(parseHistoricalUsageReconciliationRequest(input()).mode, 'preview')
  assert.throws(
    () => parseHistoricalUsageReconciliationRequest(input({ resource: 'maps_api' })),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'invalid_request',
  )
  assert.throws(
    () => parseHistoricalUsageReconciliationRequest(input({ periodStart: '2026-08-10T00:00:00.000Z' })),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'invalid_request',
  )
  assert.throws(
    () => parseHistoricalUsageReconciliationRequest(input({ organizationId: 'org:history' })),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'invalid_request',
  )
  assert.throws(
    () => parseHistoricalUsageReconciliationRequest(input({ idempotencyKey: 'history:op' })),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'invalid_request',
  )
})

test('preview maps token and flat history, plans residual and reset, and performs no writes', async () => {
  const db = createDb()
  seed(db)
  const before = counts(db)
  const plan = await previewHistoricalUsageReconciliation(db as never, SECRET, input(), 'operator-1', NOW)

  assert.equal(plan.backfillCount, 2)
  assert.equal(plan.matchedCount, 0)
  assert.equal(plan.backfillQuantity, 3)
  assert.equal(plan.residual?.quantity, 1)
  assert.equal(plan.reset.required, true)
  assert.deepEqual(plan.legacyLogs.map(row => [row.action, row.quantity, row.resource, row.basis]), [
    ['chowbot', 1, 'ai_inference', 'tokens'],
    ['whatsapp_notification', 2, 'messaging', 'flat'],
  ])
  assert.deepEqual(counts(db), before)
})

test('apply writes bounded history, residual, audit marker, and reset atomically and replays idempotently', async () => {
  const db = createDb()
  seed(db)
  const plan = await previewHistoricalUsageReconciliation(db as never, SECRET, input(), 'operator-1', NOW)
  const result = await applyHistoricalUsageReconciliation(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW)
  assert.equal(result.status, 'applied')
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_events').get() as { count: number }).count, 4)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants').get() as { count: number }).count, 1)
  const credits = db.prepare('SELECT balance, lifetime_used, last_topped_up_at, balance_period_key FROM ai_credits').get() as Record<string, unknown>
  assert.deepEqual(credits, {
    balance: 100,
    lifetime_used: 4,
    last_topped_up_at: '2025-01-01T00:00:00.000Z',
    balance_period_key: '2026-08-10',
  })
  const replay = await applyHistoricalUsageReconciliation(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW)
  assert.equal(replay.status, 'already_applied')
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_events').get() as { count: number }).count, 4)
})

test('one exact current-runtime event is accepted while ambiguous or mismatched history is rejected', async () => {
  const exact = createDb()
  seed(exact, '2026-08-10')
  exact.prepare(`
    INSERT INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, 'ai_inference', 'server', 'ai', 'chowbot', 1, 'credit', ?, ?, ?)
  `).run(
    'runtime-1',
    'org-history',
    'site-1',
    JSON.stringify({ action: 'chowbot', model: 'model-x', inputTokens: 1000, outputTokens: 0, cfGatewayLogId: 'gateway-1', charged: true }),
    'ai-usage:gateway-1',
    '2026-08-01T00:00:00.000Z',
  )
  exact.prepare(`
    INSERT INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, ?, 'messaging', 'notification', 'meta', 'whatsapp', 2, 'credit', ?, ?, ?)
  `).run(
    'runtime-flat-1',
    'org-history',
    null,
    JSON.stringify({ action: 'whatsapp_notification', creditsCharged: 2, cfGatewayLogId: null, charged: true }),
    'flat-usage:gateway-flat-1',
    '2026-08-02T00:00:00.000Z',
  )
  exact.prepare("UPDATE ai_usage_log SET credits_charged = 2 WHERE id = 'legacy-flat'").run()
  const exactPlan = await previewHistoricalUsageReconciliation(exact as never, SECRET, input(), 'operator-1', NOW)
  assert.equal(exactPlan.backfillCount, 0)
  assert.equal(exactPlan.matchedCount, 2)
  const exactResult = await applyHistoricalUsageReconciliation(exact as never, SECRET, exactPlan.input, 'operator-1', exactPlan.expectedStateSha256, exactPlan.approvalToken, NOW)
  assert.equal(exactResult.status, 'applied')
  assert.equal((exact.prepare("SELECT COUNT(*) AS count FROM usage_events WHERE idempotency_key LIKE 'history:ai-usage-log:%'").get() as { count: number }).count, 0)

  const ambiguous = createDb()
  seed(ambiguous, '2026-08-10')
  const runtimeEvent = [
    'runtime-1', 'org-history', 'site-1',
    JSON.stringify({ action: 'chowbot', model: 'model-x', inputTokens: 1000, outputTokens: 0, cfGatewayLogId: 'gateway-1' }),
    'ai-usage:gateway-1', '2026-08-01T00:00:00.000Z',
  ]
  for (const id of ['runtime-1', 'runtime-2']) {
    ambiguous.prepare(`
      INSERT INTO usage_events
        (id, organization_id, site_id, resource, source, provider, channel, quantity, unit, metadata_json, idempotency_key, created_at)
      VALUES (?, ?, ?, 'ai_inference', 'server', 'ai', 'chowbot', 1, 'credit', ?, ?, ?)
    `).run(id, runtimeEvent[1], runtimeEvent[2], runtimeEvent[3], `ai-usage:${id}`, runtimeEvent[5])
  }
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(ambiguous as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'canonical_usage_conflict',
  )

  const mismatchedHistory = createDb()
  seed(mismatchedHistory, '2026-08-10')
  mismatchedHistory.prepare(`
    INSERT INTO usage_events
      (id, organization_id, resource, source, provider, channel, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, 'ai_inference', 'server', 'ai', 'legacy', 9, 'credit', ?, ?, ?)
  `).run('history-event', 'org-history', JSON.stringify({ bad: true }), 'history:ai-usage-log:legacy-token', '2026-08-01T00:00:00.000Z')
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(mismatchedHistory as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'canonical_usage_conflict',
  )
})

test('in-batch CAS rolls back on concurrent legacy log, canonical event, grant, or credit changes', async () => {
  const scenarios: Array<{ name: string; mutate: (_db: SqliteDb) => void }> = [
    {
      name: 'legacy log',
      mutate: (db) => db.prepare(`
        INSERT INTO ai_usage_log
          (id, organization_id, action, model, input_tokens, output_tokens, credits_charged, created_at)
        VALUES ('race-log', 'org-history', 'chowbot', 'model-x', 1000, 0, 1, '2026-08-03T00:00:00.000Z')
      `).run(),
    },
    {
      name: 'canonical event',
      mutate: (db) => db.prepare(`
        INSERT INTO usage_events
          (id, organization_id, resource, source, provider, channel, quantity, unit, idempotency_key, created_at)
        VALUES ('race-event', 'org-history', 'ai_inference', 'server', 'ai', 'chowbot', 1, 'credit', 'race-event', '2026-08-03T00:00:00.000Z')
      `).run(),
    },
    {
      name: 'grant',
      mutate: (db) => db.prepare(`
        INSERT INTO usage_quota_grants
          (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, idempotency_key, applied_at, created_at)
        VALUES ('race-grant', 'org-history', 'ai_inference', 1, 'credit', 'week:2026-08-10',
                '2026-08-10T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'manual', 'race', 'operator-2',
                'race-grant', '2026-08-10T11:30:00.000Z', '2026-08-10T11:30:00.000Z')
      `).run(),
    },
    {
      name: 'credits',
      mutate: (db) => db.prepare('UPDATE ai_credits SET balance = balance + 1 WHERE organization_id = \'org-history\'').run(),
    },
  ]

  for (const scenario of scenarios) {
    const db = createDb()
    seed(db, '2026-08-10')
    const plan = await previewHistoricalUsageReconciliation(db as never, SECRET, input({ idempotencyKey: `race-${scenario.name.replaceAll(' ', '-')}` }), 'operator-1', NOW)
    beforeBatch = () => scenario.mutate(db)
    await assert.rejects(
      () => applyHistoricalUsageReconciliation(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW),
      (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
      scenario.name,
    )
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE resource = \'ai_reconciliation\'').get() as { count: number }).count, 0)
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants').get() as { count: number }).count, scenario.name === 'grant' ? 1 : 0)
  }
})

test('exact row fingerprints catch aggregate-preserving identity changes and reserved-key races', async () => {
  const legacy = createDb()
  seed(legacy, '2026-08-10')
  const legacyPlan = await previewHistoricalUsageReconciliation(legacy as never, SECRET, input({ idempotencyKey: 'fingerprint-legacy' }), 'operator-1', NOW)
  beforeBatch = () => legacy.prepare("UPDATE ai_usage_log SET model = 'changed-model' WHERE id = 'legacy-token'").run()
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(legacy as never, SECRET, legacyPlan.input, 'operator-1', legacyPlan.expectedStateSha256, legacyPlan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
  )

  const canonical = createDb()
  seed(canonical, '2026-08-10')
  canonical.prepare(`
    INSERT INTO usage_events
      (id, organization_id, site_id, resource, source, provider, channel, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES ('fingerprint-event', 'org-history', 'site-1', 'ai_inference', 'server', 'ai', 'chowbot', 1, 'credit', ?, 'fingerprint-event', '2026-08-01T00:00:00.000Z')
  `).run(JSON.stringify({ action: 'chowbot', model: 'model-x', inputTokens: 1000, outputTokens: 0, cfGatewayLogId: 'gateway-1' }))
  const canonicalPlan = await previewHistoricalUsageReconciliation(canonical as never, SECRET, input({ idempotencyKey: 'fingerprint-event-op' }), 'operator-1', NOW)
  beforeBatch = () => canonical.prepare("UPDATE usage_events SET metadata_json = json_set(metadata_json, '$.model', 'changed-model') WHERE id = 'fingerprint-event'").run()
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(canonical as never, SECRET, canonicalPlan.input, 'operator-1', canonicalPlan.expectedStateSha256, canonicalPlan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
  )

  const grant = createDb()
  seed(grant, '2026-08-10')
  grant.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
       grant_type, reason, created_by, idempotency_key, applied_at, created_at)
    VALUES ('fingerprint-grant', 'org-history', 'ai_inference', 1, 'credit', 'week:2026-08-10',
            '2026-08-10T00:00:00.000Z', '2026-08-17T00:00:00.000Z', 'manual', 'original', 'operator-2',
            'fingerprint-grant', '2026-08-10T11:30:00.000Z', '2026-08-10T11:30:00.000Z')
  `).run()
  const grantPlan = await previewHistoricalUsageReconciliation(grant as never, SECRET, input({ idempotencyKey: 'fingerprint-grant-op' }), 'operator-1', NOW)
  beforeBatch = () => grant.prepare("UPDATE usage_quota_grants SET reason = 'changed' WHERE id = 'fingerprint-grant'").run()
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(grant as never, SECRET, grantPlan.input, 'operator-1', grantPlan.expectedStateSha256, grantPlan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
  )

  const reserved = createDb()
  seed(reserved, '2026-08-10')
  const reservedPlan = await previewHistoricalUsageReconciliation(reserved as never, SECRET, input({ idempotencyKey: 'fingerprint-reserved' }), 'operator-1', NOW)
  beforeBatch = () => reserved.prepare(`
    INSERT INTO usage_events
      (id, organization_id, resource, source, provider, channel, quantity, unit, idempotency_key, created_at)
    VALUES ('reserved-history-race', 'org-history', 'ai_reconciliation', 'race', 'race', 'race', 0, 'audit', 'history:ai-usage-log:legacy-token', '2026-08-10T11:59:00.000Z')
  `).run()
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(reserved as never, SECRET, reservedPlan.input, 'operator-1', reservedPlan.expectedStateSha256, reservedPlan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
  )

  const resetRace = createDb()
  seed(resetRace)
  const resetPlan = await previewHistoricalUsageReconciliation(resetRace as never, SECRET, input({ idempotencyKey: 'fingerprint-reset' }), 'operator-1', NOW)
  beforeBatch = () => resetRace.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start, period_end,
       grant_type, reason, created_by, idempotency_key, applied_at, created_at)
    VALUES ('out-period-reset', 'org-history', 'ai_inference', 100, 'credit', 'week:2026-08-03',
            '2026-08-03T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 'reset', 'race', 'operator-2',
            'history:reconciliation-reset:org-history:fingerprint-reset', '2026-08-10T11:30:00.000Z', '2026-08-10T11:30:00.000Z')
  `).run()
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(resetRace as never, SECRET, resetPlan.input, 'operator-1', resetPlan.expectedStateSha256, resetPlan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'stale_state',
  )
})

test('current-week period keys skip reset, stale keys and missing rows block, and approvals reject tamper or expiry', async () => {
  const current = createDb()
  seed(current, '2026-08-10')
  const currentPlan = await previewHistoricalUsageReconciliation(current as never, SECRET, input(), 'operator-1', NOW)
  assert.equal(currentPlan.reset.required, false)
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(current as never, SECRET, input({ cutoffAt: '2026-08-10T00:00:00.000Z' }), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'cutoff_not_historical',
  )

  const stale = createDb()
  seed(stale, '2026-08-03')
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(stale as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'quota_reconciliation_required',
  )

  const missing = createDb()
  missing.prepare('INSERT INTO organization (id) VALUES (\'org-history\')').run()
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(missing as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'quota_initialization_required',
  )

  const tampered = createDb()
  seed(tampered, '2026-08-10')
  const plan = await previewHistoricalUsageReconciliation(tampered as never, SECRET, input(), 'operator-1', NOW)
  const before = counts(tampered)
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(tampered as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, `${plan.approvalToken.slice(0, -1)}x`, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'approval_token_invalid',
  )
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(tampered as never, SECRET, plan.input, 'operator-1', '0'.repeat(64), plan.approvalToken, NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'approval_state_mismatch',
  )
  await assert.rejects(
    () => applyHistoricalUsageReconciliation(tampered as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, new Date('2026-08-10T12:11:00.000Z')),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'approval_expired',
  )
  assert.deepEqual(counts(tampered), before)
})

test('malformed or altered reconciliation markers never replay as a successful result', async () => {
  const cases: Array<{ name: string; mutate: (_db: SqliteDb) => void }> = [
    { name: 'metadata', mutate: db => db.prepare("UPDATE usage_events SET metadata_json = '{}' WHERE resource = 'ai_reconciliation'").run() },
    { name: 'source', mutate: db => db.prepare("UPDATE usage_events SET source = 'server' WHERE resource = 'ai_reconciliation'").run() },
    { name: 'provider', mutate: db => db.prepare("UPDATE usage_events SET provider = 'ai' WHERE resource = 'ai_reconciliation'").run() },
    { name: 'channel', mutate: db => db.prepare("UPDATE usage_events SET channel = 'legacy' WHERE resource = 'ai_reconciliation'").run() },
    { name: 'result', mutate: db => db.prepare("UPDATE usage_events SET metadata_json = json_set(metadata_json, '$.backfillCount', 'bad') WHERE resource = 'ai_reconciliation'").run() },
  ]
  for (const item of cases) {
    const db = createDb()
    seed(db, '2026-08-10')
    const plan = await previewHistoricalUsageReconciliation(db as never, SECRET, input({ idempotencyKey: `marker-${item.name}` }), 'operator-1', NOW)
    await applyHistoricalUsageReconciliation(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW)
    item.mutate(db)
    await assert.rejects(
      () => applyHistoricalUsageReconciliation(db as never, SECRET, plan.input, 'operator-1', plan.expectedStateSha256, plan.approvalToken, NOW),
      (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'idempotency_conflict',
      item.name,
    )
  }
})

test('legacy numeric mismatches and canonical lifetime overruns fail closed', async () => {
  const malformed = createDb()
  seed(malformed, '2026-08-10')
  malformed.prepare('UPDATE ai_usage_log SET credits_charged = 99 WHERE id = \'legacy-token\'').run()
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(malformed as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'legacy_usage_invalid',
  )

  const overrun = createDb()
  seed(overrun, '2026-08-10')
  overrun.prepare('UPDATE ai_credits SET lifetime_used = 1 WHERE organization_id = \'org-history\'').run()
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(overrun as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'lifetime_usage_conflict',
  )

  const unsafe = createDb()
  seed(unsafe, '2026-08-10')
  unsafe.prepare("UPDATE ai_usage_log SET input_tokens = 100, output_tokens = 1801439850948198, credits_charged = 0 WHERE id = 'legacy-token'").run()
  await assert.rejects(
    () => previewHistoricalUsageReconciliation(unsafe as never, SECRET, input(), 'operator-1', NOW),
    (error: unknown) => error instanceof HistoricalUsageReconciliationError && error.code === 'legacy_usage_invalid',
  )
})
