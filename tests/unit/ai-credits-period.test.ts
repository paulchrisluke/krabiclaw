import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

async function execute(db: SqliteDb, query: string, params: unknown[] = []) {
  const result = db.prepare(query).run(...params)
  return { meta: { changes: Number(result.changes) } }
}

async function executeBatch(db: SqliteDb, queries: Array<{ query: string; params?: unknown[] }>) {
  const transaction = db.transaction((statements: Array<{ query: string; params?: unknown[] }>) => statements.map(statement => {
    const result = db.prepare(statement.query).run(...(statement.params ?? []))
    return { meta: { changes: Number(result.changes) } }
  }))
  return transaction(queries)
}

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).all(...params) as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute,
    executeBatch,
    queryFirst,
    queryAll,
    createDb: () => ({}),
    schema: {},
  },
})

const { chargeCredits, chargeFlatCredits, getAiQuotaStatus } = await import('../../server/utils/ai-credits.ts')
const { getCurrentCreditGrantProjection, grantQuota, resetOrganizationQuota } = await import('../../server/utils/usage-metering.ts')

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE organization_billing (
      organization_id TEXT PRIMARY KEY,
      plan TEXT,
      status TEXT,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      current_period_end TEXT,
      updated_at TEXT
    );
    CREATE TABLE subscription (
      id TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      referenceId TEXT NOT NULL,
      stripeCustomerId TEXT,
      stripeSubscriptionId TEXT,
      status TEXT NOT NULL,
      periodEnd TEXT,
      trialEnd TEXT,
      cancelAtPeriodEnd INTEGER DEFAULT 0,
      updatedAt TEXT
    );
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
    CREATE TABLE ai_usage_log (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT,
      action TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      credits_charged INTEGER NOT NULL,
      cf_gateway_log_id TEXT,
      created_at TEXT NOT NULL
    );
  `)
  return db
}

function seedSubscription(db: SqliteDb, input: {
  organizationId: string
  plan: string
  status: string
  periodEnd: string
  trialEnd?: string | null
  paymentStatus?: string
  paidThrough?: string | null
}) {
  db.prepare(`
    INSERT INTO subscription
      (id, plan, referenceId, status, periodEnd, trialEnd, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `sub-${input.organizationId}`,
    input.plan,
    input.organizationId,
    input.status,
    input.periodEnd,
    input.trialEnd ?? null,
    input.periodEnd,
  )
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, plan, status, payment_status, paid_through, current_period_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.organizationId,
    input.plan,
    input.status,
    input.paymentStatus ?? null,
    input.paidThrough ?? null,
    input.periodEnd,
  )
}

function seedBillingProjection(db: SqliteDb, input: {
  organizationId: string
  plan: string
  status: string
  currentPeriodEnd?: string | null
  paymentStatus?: string | null
  paidThrough?: string | null
  updatedAt?: string | null
}) {
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, plan, status, payment_status, paid_through, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.organizationId,
    input.plan,
    input.status,
    input.paymentStatus ?? null,
    input.paidThrough ?? null,
    input.currentPeriodEnd ?? null,
    input.updatedAt ?? null,
  )
}

test('quota status lazily records the exact current UTC week grant', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')

  const status = await getAiQuotaStatus(db as never, 'org-free', 'session-1', now)

  assert.equal(status.plan, 'free')
  assert.equal(status.periodStart, '2026-08-10T00:00:00.000Z')
  assert.equal(status.periodEnd, '2026-08-17T00:00:00.000Z')
  assert.equal(status.weeklyLimit, 500)
  assert.equal(status.weeklyRemaining, 500)

  const grant = db.prepare(`
    SELECT quantity, unit, period_start, period_end, grant_type
    FROM usage_quota_grants
    WHERE organization_id = ?
  `).get('org-free') as {
    quantity: number
    unit: string
    period_start: string
    period_end: string
    grant_type: string
  } | undefined
  assert.deepEqual(grant, {
    quantity: 500,
    unit: 'credit',
    period_start: '2026-08-10T00:00:00.000Z',
    period_end: '2026-08-17T00:00:00.000Z',
    grant_type: 'plan',
  })
})

test('quota access follows the app billing projection and fails closed after trial expiry', async () => {
  const db = createDb()
  seedSubscription(db, {
    organizationId: 'org-expired-trial',
    plan: 'growth',
    status: 'trialing',
    periodEnd: '2026-08-09T23:59:59.000Z',
    trialEnd: '2026-08-09T23:59:59.000Z',
  })

  const status = await getAiQuotaStatus(
    db as never,
    'org-expired-trial',
    null,
    new Date('2026-08-10T00:00:00.000Z'),
  )

  assert.equal(status.plan, 'free')
  assert.equal(status.weeklyLimit, 500)
})

test('quota resolution uses the app-owned organization billing projection', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-projection-only',
    plan: 'growth',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const status = await getAiQuotaStatus(
    db as never,
    'org-projection-only',
    null,
    new Date('2026-08-10T00:00:00.000Z'),
  )
  assert.equal(status.plan, 'growth')
  assert.equal(status.weeklyLimit, 2000)
})

test('analytics-only billing rows with no subscription fields remain Starter', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, plan, status, payment_status, paid_through, past_due_since, current_period_end, updated_at)
    VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, ?)
  `).run('org-analytics-only', '2026-08-10T00:00:00.000Z')

  const status = await getAiQuotaStatus(
    db as never,
    'org-analytics-only',
    null,
    new Date('2026-08-10T00:00:00.000Z'),
  )
  assert.equal(status.plan, 'free')
  assert.equal(status.weeklyLimit, 500)
})

test('trial access fails closed when the projected trial boundary is absent or malformed', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-trial-missing-boundary',
    plan: 'growth',
    status: 'trialing',
    currentPeriodEnd: null,
  })
  seedBillingProjection(db, {
    organizationId: 'org-trial-malformed-boundary',
    plan: 'growth',
    status: 'trialing',
    currentPeriodEnd: 'not-a-date',
  })
  seedBillingProjection(db, {
    organizationId: 'org-malformed-plan',
    plan: 'not-a-plan',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const now = new Date('2026-08-10T00:00:00.000Z')
  await assert.rejects(
    () => getAiQuotaStatus(db as never, 'org-trial-missing-boundary', null, now),
    /trialing subscriptions require current_period_end/,
  )
  await assert.rejects(
    () => getAiQuotaStatus(db as never, 'org-trial-malformed-boundary', null, now),
    /current_period_end must be a valid date/,
  )
  await assert.rejects(
    () => getAiQuotaStatus(db as never, 'org-malformed-plan', null, now),
    /unknown plan/,
  )
})

test('historical trialing payment status remains a valid projected subscription', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-historical-trial',
    plan: 'growth',
    status: 'trialing',
    paymentStatus: 'trialing',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const status = await getAiQuotaStatus(
    db as never,
    'org-historical-trial',
    null,
    new Date('2026-08-10T00:00:00.000Z'),
  )
  assert.equal(status.plan, 'growth')
  assert.equal(status.weeklyLimit, 2000)
})

test('plan transitions A to B to A materialize a new baseline in one UTC week', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-plan-cycle',
    plan: 'free',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
  })
  const now = new Date('2026-08-10T12:00:00.000Z')
  await getAiQuotaStatus(db as never, 'org-plan-cycle', null, now)
  db.prepare('UPDATE organization_billing SET plan = ?, updated_at = ? WHERE organization_id = ?').run('growth', '2026-08-10T10:00:00.000Z', 'org-plan-cycle')
  await getAiQuotaStatus(db as never, 'org-plan-cycle', null, now)
  db.prepare('UPDATE organization_billing SET plan = ?, updated_at = ? WHERE organization_id = ?').run('free', '2026-08-10T11:00:00.000Z', 'org-plan-cycle')
  const status = await getAiQuotaStatus(db as never, 'org-plan-cycle', null, now)

  assert.equal(status.grantQuantity, 500)
  const grants = db.prepare(`
    SELECT quantity FROM usage_quota_grants
    WHERE organization_id = ? AND grant_type = 'plan'
    ORDER BY created_at, id
  `).all('org-plan-cycle') as Array<{ quantity: number }>
  assert.deepEqual(grants.map(grant => grant.quantity), [500, 2000, 500])
})

test('a reset is exact until a later plan transition establishes a new baseline', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-reset-transition',
    plan: 'free',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
  })
  const initial = new Date('2026-08-10T09:00:00.000Z')
  await getAiQuotaStatus(db as never, 'org-reset-transition', null, initial)
  await grantQuota(db as never, {
    organizationId: 'org-reset-transition',
    resource: 'ai_inference',
    quantity: 0,
    unit: 'credit',
    periodKey: 'reset:org-reset-transition',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'reset',
    reason: 'Approved exact reset',
    idempotencyKey: 'reset:org-reset-transition',
    createdAt: '2026-08-10T10:00:00.000Z',
  })
  db.prepare('UPDATE organization_billing SET plan = ?, updated_at = ? WHERE organization_id = ?').run('growth', '2026-08-10T11:00:00.000Z', 'org-reset-transition')
  const status = await getAiQuotaStatus(db as never, 'org-reset-transition', null, new Date('2026-08-10T12:00:00.000Z'))

  assert.equal(status.grantQuantity, 2000)
  const grants = db.prepare(`
    SELECT grant_type, quantity FROM usage_quota_grants
    WHERE organization_id = ?
    ORDER BY created_at, id
  `).all('org-reset-transition') as Array<{ grant_type: string; quantity: number }>
  assert.deepEqual(grants.map(grant => [grant.grant_type, grant.quantity]), [
    ['plan', 500],
    ['reset', 0],
    ['plan', 2000],
  ])
})

test('reset balance excludes pre-reset usage and a later plan baseline counts the whole week', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-reset-consumption',
    plan: 'free',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
  })

  await chargeCredits(db as never, 'org-reset-consumption', {
    action: 'before-reset',
    model: 'test-model',
    inputTokens: 100_000,
    outputTokens: 0,
    idempotencyKey: 'reset-consumption-before',
    now: new Date('2026-08-10T09:30:00.000Z'),
  })

  await grantQuota(db as never, {
    organizationId: 'org-reset-consumption',
    resource: 'ai_inference',
    quantity: 50,
    unit: 'credit',
    periodKey: 'reset:org-reset-consumption',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'reset',
    reason: 'Approved exact reset',
    idempotencyKey: 'reset:org-reset-consumption',
    createdAt: '2026-08-10T10:00:00.000Z',
  })

  const afterReset = await getAiQuotaStatus(
    db as never,
    'org-reset-consumption',
    null,
    new Date('2026-08-10T10:30:00.000Z'),
  )
  assert.equal(afterReset.balance, 50)
  assert.equal(afterReset.weeklyUsed, 100)
  assert.equal(afterReset.weeklyRemaining, 50)

  await chargeFlatCredits(db as never, 'org-reset-consumption', {
    action: 'google_places_details',
    idempotencyKey: 'reset-consumption-after',
    now: new Date('2026-08-10T10:30:00.000Z'),
  })
  const consumedAfterReset = await getAiQuotaStatus(
    db as never,
    'org-reset-consumption',
    null,
    new Date('2026-08-10T10:45:00.000Z'),
  )
  assert.equal(consumedAfterReset.balance, 47)
  assert.equal(consumedAfterReset.weeklyRemaining, 47)

  db.prepare('UPDATE organization_billing SET plan = ?, updated_at = ? WHERE organization_id = ?').run('growth', '2026-08-10T11:00:00.000Z', 'org-reset-consumption')
  const transitioned = await getAiQuotaStatus(
    db as never,
    'org-reset-consumption',
    null,
    new Date('2026-08-10T11:30:00.000Z'),
  )
  assert.equal(transitioned.plan, 'growth')
  assert.equal(transitioned.grantQuantity, 2000)
  assert.equal(transitioned.weeklyUsed, 103)
  assert.equal(transitioned.weeklyRemaining, 1897)
})

test('legacy null-period balances are quarantined until reconciliation', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-legacy-balance',
    plan: 'free',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 42, NULL, ?)
  `).run('org-legacy-balance', 123, '2026-08-01T00:00:00.000Z')

  const status = await getAiQuotaStatus(
    db as never,
    'org-legacy-balance',
    null,
    new Date('2026-08-10T12:00:00.000Z'),
  )
  assert.equal(status.balance, 123)
  assert.equal(status.reconciliationRequired, true)
  assert.equal(status.weeklyRemaining, 0)
  const grantCount = db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get('org-legacy-balance') as { count: number }
  const balanceKey = db.prepare('SELECT balance_period_key FROM ai_credits WHERE organization_id = ?').get('org-legacy-balance') as { balance_period_key: string | null }
  assert.equal(grantCount.count, 0)
  assert.equal(balanceKey.balance_period_key, null)
})

test('quota grants remain pending and do not mutate a quarantined legacy balance', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 42, NULL, ?)
  `).run('org-legacy-grant', 123, '2026-08-01T00:00:00.000Z')

  const inserted = await grantQuota(db as never, {
    organizationId: 'org-legacy-grant',
    resource: 'ai_inference',
    quantity: 100,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'manual',
    reason: 'Pending legacy reconciliation',
    idempotencyKey: 'manual:org-legacy-grant:1',
    createdAt: '2026-08-10T12:00:00.000Z',
  })
  await resetOrganizationQuota(db as never, {
    organizationId: 'org-legacy-grant',
    resetId: 'legacy-reset',
    reason: 'Pending legacy reconciliation reset',
    grants: [{
      resource: 'ai_inference',
      quantity: 50,
      unit: 'credit',
      periodStart: '2026-08-10T00:00:00.000Z',
      periodEnd: '2026-08-17T00:00:00.000Z',
    }],
  })

  assert.equal(inserted, false)
  const balance = db.prepare('SELECT balance, lifetime_used, balance_period_key FROM ai_credits WHERE organization_id = ?').get('org-legacy-grant') as { balance: number; lifetime_used: number; balance_period_key: string | null }
  assert.deepEqual(balance, { balance: 123, lifetime_used: 42, balance_period_key: null })
  const grants = db.prepare('SELECT grant_type, applied_at FROM usage_quota_grants WHERE organization_id = ? ORDER BY grant_type').all('org-legacy-grant') as Array<{ grant_type: string; applied_at: string | null }>
  assert.deepEqual(grants, [
    { grant_type: 'manual', applied_at: null },
    { grant_type: 'reset', applied_at: null },
  ])
})

test('legacy balances still meter nonblocking flat usage without a quota debit', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 42, NULL, ?)
  `).run('org-legacy-flat', 123, '2026-08-01T00:00:00.000Z')

  const result = await chargeFlatCredits(db as never, 'org-legacy-flat', {
    action: 'google_places_details',
    idempotencyKey: 'legacy-flat-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })

  assert.equal(result.charged, false)
  assert.equal(result.creditsCharged, 0)
  const balance = db.prepare('SELECT balance, lifetime_used, balance_period_key FROM ai_credits WHERE organization_id = ?').get('org-legacy-flat') as { balance: number; lifetime_used: number; balance_period_key: string | null }
  assert.deepEqual(balance, { balance: 123, lifetime_used: 45, balance_period_key: null })
  const event = db.prepare('SELECT quantity, metadata_json FROM usage_events WHERE organization_id = ?').get('org-legacy-flat') as { quantity: number; metadata_json: string }
  assert.equal(event.quantity, 3)
  assert.equal(JSON.parse(event.metadata_json).charged, false)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-legacy-flat') as { credits_charged: number }
  assert.equal(log.credits_charged, 0)
})

test('idempotent replays fail closed when legacy charged metadata is missing or malformed', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO usage_events
      (id, organization_id, resource, source, quantity, unit, metadata_json, idempotency_key, created_at)
    VALUES (?, ?, 'maps_api', 'places', 3, 'credit', ?, ?, ?),
           (?, ?, 'maps_api', 'places', 3, 'credit', ?, ?, ?)
  `).run(
    'legacy-null-metadata',
    'org-legacy-replay',
    null,
    'legacy-replay-null',
    '2026-08-10T10:00:00.000Z',
    'legacy-invalid-metadata',
    'org-legacy-replay',
    'not-json',
    'legacy-replay-invalid',
    '2026-08-10T10:01:00.000Z',
  )

  const nullReplay = await chargeFlatCredits(db as never, 'org-legacy-replay', {
    action: 'google_places_details',
    idempotencyKey: 'legacy-replay-null',
  })
  const malformedReplay = await chargeFlatCredits(db as never, 'org-legacy-replay', {
    action: 'google_places_details',
    idempotencyKey: 'legacy-replay-invalid',
  })
  assert.equal(nullReplay.charged, false)
  assert.equal(nullReplay.creditsCharged, 0)
  assert.equal(malformedReplay.charged, false)
  assert.equal(malformedReplay.creditsCharged, 0)
})

test('same-plan subscription updates do not refill the current week', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  seedSubscription(db, {
    organizationId: 'org-same-plan',
    plan: 'growth',
    status: 'active',
    periodEnd: '2026-08-31T00:00:00.000Z',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
  })

  await getAiQuotaStatus(db as never, 'org-same-plan', null, now)
  db.prepare('UPDATE subscription SET updatedAt = ? WHERE referenceId = ?').run('2026-08-10T13:00:00.000Z', 'org-same-plan')
  await getAiQuotaStatus(db as never, 'org-same-plan', null, now)

  const grants = db.prepare(`
    SELECT quantity FROM usage_quota_grants
    WHERE organization_id = ? AND grant_type = 'plan'
    ORDER BY created_at
  `).all('org-same-plan') as Array<{ quantity: number }>
  assert.deepEqual(grants, [{ quantity: 2000 }])
})

test('unlimited-to-finite plan transitions create a fresh weekly baseline', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  seedSubscription(db, {
    organizationId: 'org-plan-transition',
    plan: 'managed',
    status: 'active',
    periodEnd: '2026-08-31T00:00:00.000Z',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
  })

  const unlimited = await getAiQuotaStatus(db as never, 'org-plan-transition', null, now)
  assert.equal(unlimited.unlimited, true)
  db.prepare('UPDATE subscription SET plan = ? WHERE referenceId = ?').run('growth', 'org-plan-transition')
  db.prepare('UPDATE organization_billing SET plan = ? WHERE organization_id = ?').run('growth', 'org-plan-transition')

  const finite = await getAiQuotaStatus(db as never, 'org-plan-transition', null, now)
  assert.equal(finite.plan, 'growth')
  assert.equal(finite.grantQuantity, 2000)
  const grants = db.prepare(`
    SELECT quantity FROM usage_quota_grants
    WHERE organization_id = ? AND grant_type = 'plan'
    ORDER BY created_at, id
  `).all('org-plan-transition') as Array<{ quantity: number }>
  assert.deepEqual(grants.map(grant => grant.quantity), [0, 2000])
})

test('unlimited flat usage is metered in canonical credits without a debit', async () => {
  const db = createDb()
  seedSubscription(db, {
    organizationId: 'org-managed',
    plan: 'managed',
    status: 'active',
    periodEnd: '2026-08-31T00:00:00.000Z',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeFlatCredits(db as never, 'org-managed', {
    action: 'google_places_details',
    idempotencyKey: 'flat-managed-1',
  })

  assert.equal(result.charged, false)
  assert.equal(result.creditsCharged, 0)
  const event = db.prepare(`
    SELECT resource, quantity, unit
    FROM usage_events
    WHERE organization_id = ?
  `).get('org-managed') as { resource: string; quantity: number; unit: string } | undefined
  assert.deepEqual(event, { resource: 'maps_api', quantity: 3, unit: 'credit' })
  const usage = db.prepare('SELECT lifetime_used FROM ai_credits WHERE organization_id = ?').get('org-managed') as { lifetime_used: number }
  assert.equal(usage.lifetime_used, 3)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-managed') as { credits_charged: number }
  assert.equal(log.credits_charged, 0)
})

test('unlimited flat usage is metered but is not reported as a quota debit', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-unlimited-flat-status',
    plan: 'managed',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeFlatCredits(db as never, 'org-unlimited-flat-status', {
    action: 'google_places_details',
    idempotencyKey: 'unlimited-flat-status-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })
  assert.equal(result.charged, false)
  assert.equal(result.creditsCharged, 0)
  const event = db.prepare('SELECT quantity, unit, metadata_json FROM usage_events WHERE organization_id = ?').get('org-unlimited-flat-status') as { quantity: number; unit: string; metadata_json: string }
  assert.equal(event.quantity, 3)
  assert.equal(event.unit, 'credit')
  assert.equal(JSON.parse(event.metadata_json).charged, false)
})

test('finite quota usage includes successful flat credit quantities', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')

  const result = await chargeFlatCredits(db as never, 'org-free-flat', {
    action: 'google_places_details',
    idempotencyKey: 'flat-free-1',
    now,
  })
  const status = await getAiQuotaStatus(db as never, 'org-free-flat', null, now)

  assert.equal(result.charged, true)
  assert.equal(status.weeklyUsed, 3)
  assert.equal(status.weeklyRemaining, 497)
})

test('flat idempotency replay reports the persisted event quantity', async () => {
  const db = createDb()
  const first = await chargeFlatCredits(db as never, 'org-flat-replay', {
    action: 'google_places_details',
    idempotencyKey: 'flat-replay-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })
  const replay = await chargeFlatCredits(db as never, 'org-flat-replay', {
    action: 'whatsapp_notification',
    idempotencyKey: 'flat-replay-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })

  assert.equal(first.charged, true)
  assert.equal(first.creditsCharged, 3)
  assert.equal(replay.charged, true)
  assert.equal(replay.creditsCharged, 3)
  const events = db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE organization_id = ?').get('org-flat-replay') as { count: number }
  assert.equal(events.count, 1)
})

test('manual grants increase the current-period allowance without changing the plan limit', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  await getAiQuotaStatus(db as never, 'org-manual', null, now)

  await grantQuota(db as never, {
    organizationId: 'org-manual',
    resource: 'ai_inference',
    quantity: 100,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'manual',
    reason: 'Support adjustment',
    idempotencyKey: 'manual:org-manual:1',
    createdAt: '2026-08-10T13:00:00.000Z',
  })

  const status = await getAiQuotaStatus(db as never, 'org-manual', null, now)
  assert.equal(status.weeklyLimit, 500)
  assert.equal(status.grantQuantity, 600)
  assert.equal(status.weeklyRemaining, 600)
})

test('flat-credit idempotency preserves a finite insufficient result', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  await grantQuota(db as never, {
    organizationId: 'org-flat-insufficient',
    resource: 'ai_inference',
    quantity: 0,
    unit: 'credit',
    periodKey: 'reset:flat-insufficient',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'reset',
    reason: 'Quota exhausted',
    idempotencyKey: 'reset:flat-insufficient',
    createdAt: '2026-08-10T11:00:00.000Z',
  })

  const first = await chargeFlatCredits(db as never, 'org-flat-insufficient', {
    action: 'google_places_details',
    idempotencyKey: 'flat-insufficient-1',
    now,
  })
  const second = await chargeFlatCredits(db as never, 'org-flat-insufficient', {
    action: 'google_places_details',
    idempotencyKey: 'flat-insufficient-1',
    now,
  })

  assert.equal(first.charged, false)
  assert.equal(first.creditsCharged, 0)
  assert.deepEqual(second, first)
  const event = db.prepare('SELECT quantity, metadata_json FROM usage_events WHERE organization_id = ?').get('org-flat-insufficient') as { quantity: number; metadata_json: string }
  assert.equal(event.quantity, 3)
  assert.equal(JSON.parse(event.metadata_json).charged, false)
  const usage = db.prepare('SELECT lifetime_used FROM ai_credits WHERE organization_id = ?').get('org-flat-insufficient') as { lifetime_used: number }
  assert.equal(usage.lifetime_used, 3)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-flat-insufficient') as { credits_charged: number }
  assert.equal(log.credits_charged, 0)
})

test('token usage records unlimited metering metadata without a quota debit', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-unlimited-token',
    plan: 'managed',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeCredits(db as never, 'org-unlimited-token', {
    action: 'test',
    model: 'test-model',
    inputTokens: 1000,
    outputTokens: 0,
    idempotencyKey: 'unlimited-token-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })
  assert.equal(result.creditsCharged, 0)
  const event = db.prepare('SELECT quantity, metadata_json FROM usage_events WHERE organization_id = ?').get('org-unlimited-token') as { quantity: number; metadata_json: string }
  assert.equal(event.quantity, 1)
  assert.equal(JSON.parse(event.metadata_json).charged, false)
  const usage = db.prepare('SELECT lifetime_used FROM ai_credits WHERE organization_id = ?').get('org-unlimited-token') as { lifetime_used: number }
  assert.equal(usage.lifetime_used, 1)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-unlimited-token') as { credits_charged: number }
  assert.equal(log.credits_charged, 0)
})

test('session usage expires with the UTC week boundary', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  db.prepare(`
    INSERT INTO usage_events
      (id, organization_id, resource, source, session_id, quantity, unit, idempotency_key, created_at)
    VALUES (?, ?, 'ai_inference', 'test', ?, 100, 'credit', ?, ?)
  `).run('old-session-event', 'org-session', 'session-1', 'old-session-event', '2026-08-03T23:59:59.000Z')

  const result = await chargeCredits(db as never, 'org-session', {
    sessionId: 'session-1',
    action: 'test',
    model: 'test-model',
    inputTokens: 1000,
    outputTokens: 0,
    idempotencyKey: 'session-current-week',
    now,
  })

  assert.equal(result.creditsCharged, 1)
  const event = db.prepare('SELECT metadata_json FROM usage_events WHERE organization_id = ? AND idempotency_key = ?').get('org-session', 'session-current-week') as { metadata_json: string }
  assert.equal(JSON.parse(event.metadata_json).charged, true)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-session') as { credits_charged: number }
  assert.equal(log.credits_charged, 1)
  const status = await getAiQuotaStatus(db as never, 'org-session', 'session-1', now)
  assert.equal(status.sessionUsed, 1)
  assert.equal(status.sessionRemaining, 99)
})

test('latest plan baseline wins and pre-transition manual grants do not carry', async () => {
  const db = createDb()
  const periodStart = '2026-08-10T00:00:00.000Z'
  const periodEnd = '2026-08-17T00:00:00.000Z'

  await grantQuota(db as never, {
    organizationId: 'org-transition',
    resource: 'ai_inference',
    quantity: 2000,
    unit: 'credit',
    periodKey: 'week:2026-08-10:plan:growth',
    periodStart,
    periodEnd,
    grantType: 'plan',
    reason: 'Growth baseline',
    idempotencyKey: 'growth-baseline',
    createdAt: '2026-08-10T09:00:00.000Z',
  })
  await grantQuota(db as never, {
    organizationId: 'org-transition',
    resource: 'ai_inference',
    quantity: 100,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual',
    periodStart,
    periodEnd,
    grantType: 'manual',
    reason: 'Pre-transition support grant',
    idempotencyKey: 'manual-before-transition',
    createdAt: '2026-08-10T10:00:00.000Z',
  })
  await grantQuota(db as never, {
    organizationId: 'org-transition',
    resource: 'ai_inference',
    quantity: 500,
    unit: 'credit',
    periodKey: 'week:2026-08-10:plan:free',
    periodStart,
    periodEnd,
    grantType: 'plan',
    reason: 'Starter baseline after downgrade',
    idempotencyKey: 'free-baseline',
    createdAt: '2026-08-10T11:00:00.000Z',
  })

  const projection = await getCurrentCreditGrantProjection(
    db as never,
    'org-transition',
    new Date('2026-08-10T12:00:00.000Z'),
  )

  assert.equal(projection.baselineQuantity, 500)
  assert.equal(projection.grantQuantity, 500)
})

test('a current-week reset baseline remains exact and does not refill automatically', async () => {
  const db = createDb()
  const periodStart = '2026-08-10T00:00:00.000Z'
  const periodEnd = '2026-08-17T00:00:00.000Z'

  await grantQuota(db as never, {
    organizationId: 'org-reset',
    resource: 'ai_inference',
    quantity: 0,
    unit: 'credit',
    periodKey: 'reset:current-week',
    periodStart,
    periodEnd,
    grantType: 'reset',
    reason: 'Approved reset',
    idempotencyKey: 'reset:current-week:ai_inference',
    createdAt: '2026-08-10T11:00:00.000Z',
  })

  const projection = await getCurrentCreditGrantProjection(
    db as never,
    'org-reset',
    new Date('2026-08-10T12:00:00.000Z'),
  )
  assert.equal(projection.baselineQuantity, 0)
  assert.equal(projection.grantQuantity, 0)
})

test('historical invoice-length plan grants do not become weekly baselines', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start,
       period_end, grant_type, reason, idempotency_key, applied_at, created_at)
    VALUES (?, ?, 'ai_inference', 2000, 'credit', ?, ?, ?, 'plan', ?, ?, ?, ?)
  `).run(
    'legacy-invoice-grant',
    'org-legacy-invoice',
    'stripe-invoice:old',
    '2026-08-10T00:00:00.000Z',
    '2026-08-31T00:00:00.000Z',
    'historical invoice grant',
    'legacy-invoice-grant',
    '2026-08-09T12:00:00.000Z',
    '2026-08-09T12:00:00.000Z',
  )

  const projection = await getCurrentCreditGrantProjection(
    db as never,
    'org-legacy-invoice',
    new Date('2026-08-10T12:00:00.000Z'),
  )
  assert.equal(projection.grantQuantity, null)

  const status = await getAiQuotaStatus(
    db as never,
    'org-legacy-invoice',
    null,
    new Date('2026-08-10T12:00:00.000Z'),
  )
  assert.equal(status.grantQuantity, 500)
})
