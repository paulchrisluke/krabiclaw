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
const {
  getCurrentCreditGrantProjection,
  getUsageSummary,
  grantQuota,
  resetOrganizationQuota,
} = await import('../../server/utils/usage-metering.ts')

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE organization_billing (
      organization_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT,
      status TEXT,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER,
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

test('usage summaries fail closed when a grouped ledger contains a malformed quantity', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO usage_events
      (id, organization_id, resource, source, quantity, unit, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'usage-summary-malformed',
    'org-usage-summary',
    'ai_inference',
    'test',
    'not-a-number',
    'credit',
    'usage-summary-malformed',
    '2026-08-10T12:00:00.000Z',
  )

  await assert.rejects(
    () => getUsageSummary(db as never, 'org-usage-summary'),
    /malformed ledger quantities/,
  )
})

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
      (id, plan, referenceId, stripeCustomerId, stripeSubscriptionId, status, periodEnd, trialEnd, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `sub-${input.organizationId}`,
    input.plan,
    input.organizationId,
    input.plan === 'free' ? null : `cus-${input.organizationId}`,
    input.plan === 'free' ? null : `sub-${input.organizationId}`,
    input.status,
    input.periodEnd,
    input.trialEnd ?? null,
    input.periodEnd,
  )
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, stripe_customer_id, stripe_subscription_id, plan, status, payment_status, paid_through, current_period_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.organizationId,
    input.plan === 'free' ? null : `cus-${input.organizationId}`,
    input.plan === 'free' ? null : `sub-${input.organizationId}`,
    input.plan,
    input.status,
    input.paymentStatus ?? 'unknown',
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
      (organization_id, stripe_customer_id, stripe_subscription_id, plan, status, payment_status, paid_through, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.organizationId,
    input.plan === 'free' ? null : `cus-${input.organizationId}`,
    input.plan === 'free' ? null : `sub-${input.organizationId}`,
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
  const credits = db.prepare('SELECT last_topped_up_at FROM ai_credits WHERE organization_id = ?').get('org-free') as { last_topped_up_at: string | null }
  assert.equal(credits.last_topped_up_at, null)
})

test('quota status exposes recurring period fields without a wallet total', async () => {
  const db = createDb()
  const status = await getAiQuotaStatus(db as never, 'org-canonical-fields', null, new Date('2026-08-10T12:34:56.000Z'))

  assert.equal(status.planAllowance, 500)
  assert.equal(status.periodAllowance, 500)
  assert.equal(status.periodUsed, 0)
  assert.equal(status.periodRemaining, 500)
  assert.equal(status.lifetimeUsed, 0)
  assert.equal('total' in status, false)
})

test('quota status reads do not rewrite an already-materialized enforcement balance', async () => {
  const db = createDb()
  const initializedAt = new Date('2026-08-10T12:34:56.000Z')
  await getAiQuotaStatus(db as never, 'org-read-only-status', null, initializedAt)
  await chargeFlatCredits(db as never, 'org-read-only-status', {
    action: 'google_places_details',
    idempotencyKey: 'read-only-status-charge',
    now: new Date('2026-08-10T12:35:00.000Z'),
  })

  const before = db.prepare(`
    SELECT balance, updated_at FROM ai_credits WHERE organization_id = ?
  `).get('org-read-only-status') as { balance: number; updated_at: string }
  const status = await getAiQuotaStatus(
    db as never,
    'org-read-only-status',
    null,
    new Date('2026-08-10T12:36:00.000Z'),
  )
  const after = db.prepare(`
    SELECT balance, updated_at FROM ai_credits WHERE organization_id = ?
  `).get('org-read-only-status') as { balance: number; updated_at: string }

  assert.equal(status.balance, 497)
  assert.deepEqual(after, before)
})

test('valid prior-week balance keys roll over into the current UTC week', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'org-prior-week-rollover',
    17,
    4,
    '2026-08-03',
    '2026-08-03T09:00:00.000Z',
  )

  const status = await getAiQuotaStatus(
    db as never,
    'org-prior-week-rollover',
    null,
    new Date('2026-08-10T12:00:00.000Z'),
  )

  assert.equal(status.balance, 500)
  assert.equal(status.weeklyRemaining, 500)
  const row = db.prepare('SELECT balance_period_key FROM ai_credits WHERE organization_id = ?').get('org-prior-week-rollover') as { balance_period_key: string }
  assert.equal(row.balance_period_key, '2026-08-10')
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get('org-prior-week-rollover') as { count: number }).count,
    1,
  )
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
  db.prepare('UPDATE organization_billing SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ? WHERE organization_id = ?').run('growth', 'cus-org-plan-cycle', 'sub-org-plan-cycle', '2026-08-10T10:00:00.000Z', 'org-plan-cycle')
  await getAiQuotaStatus(db as never, 'org-plan-cycle', null, now)
  db.prepare('UPDATE organization_billing SET plan = ?, stripe_customer_id = NULL, stripe_subscription_id = NULL, updated_at = ? WHERE organization_id = ?').run('free', '2026-08-10T11:00:00.000Z', 'org-plan-cycle')
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
  db.prepare('UPDATE organization_billing SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ? WHERE organization_id = ?').run('growth', 'cus-org-reset-transition', 'sub-org-reset-transition', '2026-08-10T11:00:00.000Z', 'org-reset-transition')
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
  assert.equal(afterReset.periodUsed, 100)
  assert.equal(afterReset.periodAllowance, 50)
  assert.equal(afterReset.periodRemaining, 50)

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
  assert.equal(consumedAfterReset.periodUsed, 103)
  assert.equal(consumedAfterReset.periodAllowance, 50)
  assert.equal(consumedAfterReset.periodRemaining, 47)

  db.prepare('UPDATE organization_billing SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ? WHERE organization_id = ?').run('growth', 'cus-org-reset-consumption', 'sub-org-reset-consumption', '2026-08-10T11:00:00.000Z', 'org-reset-consumption')
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
  const projection = await getCurrentCreditGrantProjection(
    db as never,
    'org-legacy-grant',
    new Date('2026-08-10T12:00:00.000Z'),
  )
  assert.equal(projection.grantQuantity, null)
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

test('Starter-to-Growth plan transitions create a fresh weekly baseline', async () => {
  const db = createDb()
  const now = new Date('2026-08-10T12:34:56.000Z')
  seedSubscription(db, {
    organizationId: 'org-plan-transition',
    plan: 'free',
    status: 'active',
    periodEnd: '2026-08-31T00:00:00.000Z',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
  })

  const starter = await getAiQuotaStatus(db as never, 'org-plan-transition', null, now)
  assert.equal(starter.plan, 'free')
  assert.equal(starter.grantQuantity, 500)
  db.prepare('UPDATE subscription SET plan = ? WHERE referenceId = ?').run('growth', 'org-plan-transition')
  db.prepare('UPDATE organization_billing SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE organization_id = ?').run('growth', 'cus-org-plan-transition', 'sub-org-plan-transition', 'org-plan-transition')

  const finite = await getAiQuotaStatus(db as never, 'org-plan-transition', null, now)
  assert.equal(finite.plan, 'growth')
  assert.equal(finite.grantQuantity, 2000)
  const grants = db.prepare(`
    SELECT quantity FROM usage_quota_grants
    WHERE organization_id = ? AND grant_type = 'plan'
    ORDER BY created_at, id
  `).all('org-plan-transition') as Array<{ quantity: number }>
  assert.deepEqual(grants.map(grant => grant.quantity), [500, 2000])
})

test('Growth flat usage is metered and debited in canonical credits', async () => {
  const db = createDb()
  seedSubscription(db, {
    organizationId: 'org-growth-flat',
    plan: 'growth',
    status: 'active',
    periodEnd: '2026-08-31T00:00:00.000Z',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeFlatCredits(db as never, 'org-growth-flat', {
    action: 'google_places_details',
    idempotencyKey: 'flat-growth-1',
  })

  assert.equal(result.charged, true)
  assert.equal(result.creditsCharged, 3)
  const event = db.prepare(`
    SELECT resource, quantity, unit
    FROM usage_events
    WHERE organization_id = ?
  `).get('org-growth-flat') as { resource: string; quantity: number; unit: string } | undefined
  assert.deepEqual(event, { resource: 'maps_api', quantity: 3, unit: 'credit' })
  const usage = db.prepare('SELECT lifetime_used FROM ai_credits WHERE organization_id = ?').get('org-growth-flat') as { lifetime_used: number }
  assert.equal(usage.lifetime_used, 3)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-growth-flat') as { credits_charged: number }
  assert.equal(log.credits_charged, 3)
})

test('Growth flat usage is reflected in the finite quota status', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-growth-flat-status',
    plan: 'growth',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeFlatCredits(db as never, 'org-growth-flat-status', {
    action: 'google_places_details',
    idempotencyKey: 'growth-flat-status-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })
  assert.equal(result.charged, true)
  assert.equal(result.creditsCharged, 3)
  const event = db.prepare('SELECT quantity, unit, metadata_json FROM usage_events WHERE organization_id = ?').get('org-growth-flat-status') as { quantity: number; unit: string; metadata_json: string }
  assert.equal(event.quantity, 3)
  assert.equal(event.unit, 'credit')
  assert.equal(JSON.parse(event.metadata_json).charged, true)
  const status = await getAiQuotaStatus(db as never, 'org-growth-flat-status', null, new Date('2026-08-10T12:00:00.000Z'))
  assert.equal(status.weeklyRemaining, 1997)
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

test('manual quota grants preserve the historical top-up timestamp', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
    VALUES (?, ?, 0, ?, ?, ?)
  `).run(
    'org-manual-history',
    500,
    '2025-01-01T00:00:00.000Z',
    '2026-08-10',
    '2026-08-10T09:00:00.000Z',
  )

  await grantQuota(db as never, {
    organizationId: 'org-manual-history',
    resource: 'ai_inference',
    quantity: 100,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'manual',
    reason: 'Support adjustment',
    idempotencyKey: 'manual:org-manual-history:1',
    createdAt: '2026-08-10T13:00:00.000Z',
  })

  const credits = db.prepare('SELECT last_topped_up_at FROM ai_credits WHERE organization_id = ?').get('org-manual-history') as { last_topped_up_at: string | null }
  assert.equal(credits.last_topped_up_at, '2025-01-01T00:00:00.000Z')
})

test('quota resets preserve the historical top-up timestamp', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at)
    VALUES (?, ?, 0, ?, ?, ?)
  `).run(
    'org-reset-history',
    500,
    '2025-01-01T00:00:00.000Z',
    '2026-08-10',
    '2026-08-10T09:00:00.000Z',
  )

  await resetOrganizationQuota(db as never, {
    organizationId: 'org-reset-history',
    resetId: 'history-reset',
    reason: 'Approved exact reset',
    grants: [{
      resource: 'ai_inference',
      quantity: 50,
      unit: 'credit',
      periodStart: '2026-08-10T00:00:00.000Z',
      periodEnd: '2026-08-17T00:00:00.000Z',
    }],
  })

  const credits = db.prepare('SELECT last_topped_up_at FROM ai_credits WHERE organization_id = ?').get('org-reset-history') as { last_topped_up_at: string | null }
  assert.equal(credits.last_topped_up_at, '2025-01-01T00:00:00.000Z')
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

test('flat-credit accounting failures reject instead of becoming an uncharged success', async () => {
  const db = createDb()
  // Keep the intentional quota decision intact, but remove the durable usage
  // sink so the atomic accounting batch fails after the provider work would
  // have completed. A catch-all in chargeFlatCredits used to turn this into
  // `{ charged: false }`, hiding the infrastructure failure from callers.
  db.exec('DROP TABLE ai_usage_log')

  await assert.rejects(
    () => chargeFlatCredits(db as never, 'org-flat-accounting-failure', {
      action: 'google_places_details',
      idempotencyKey: 'flat-accounting-failure-1',
      now: new Date('2026-08-10T12:34:56.000Z'),
    }),
    /ai_usage_log|no such table/i,
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE organization_id = ?').get('org-flat-accounting-failure') as { count: number }).count,
    0,
  )
  db.close()
})

test('Growth token usage records metering metadata and a quota debit', async () => {
  const db = createDb()
  seedBillingProjection(db, {
    organizationId: 'org-growth-token',
    plan: 'growth',
    status: 'active',
    paymentStatus: 'paid',
    paidThrough: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  const result = await chargeCredits(db as never, 'org-growth-token', {
    action: 'test',
    model: 'test-model',
    inputTokens: 1000,
    outputTokens: 0,
    idempotencyKey: 'growth-token-1',
    now: new Date('2026-08-10T12:00:00.000Z'),
  })
  assert.equal(result.creditsCharged, 1)
  const event = db.prepare('SELECT quantity, metadata_json FROM usage_events WHERE organization_id = ?').get('org-growth-token') as { quantity: number; metadata_json: string }
  assert.equal(event.quantity, 1)
  assert.equal(JSON.parse(event.metadata_json).charged, true)
  const usage = db.prepare('SELECT lifetime_used FROM ai_credits WHERE organization_id = ?').get('org-growth-token') as { lifetime_used: number }
  assert.equal(usage.lifetime_used, 1)
  const log = db.prepare('SELECT credits_charged FROM ai_usage_log WHERE organization_id = ?').get('org-growth-token') as { credits_charged: number }
  assert.equal(log.credits_charged, 1)
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

test('malformed quota grant quantities fail closed before allowance arithmetic', async () => {
  const malformedQuantities: Array<{ label: string; quantity: unknown }> = [
    { label: 'negative', quantity: -1 },
    { label: 'fractional', quantity: 1.5 },
    { label: 'unsafe', quantity: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'non-numeric', quantity: 'not-a-number' },
    { label: 'infinite', quantity: Number.POSITIVE_INFINITY },
  ]

  for (const malformed of malformedQuantities) {
    const db = createDb()
    const organizationId = `org-malformed-grant-${malformed.label}`
    db.prepare(`
      INSERT INTO usage_quota_grants
        (id, organization_id, resource, quantity, unit, period_key, period_start,
         period_end, grant_type, reason, idempotency_key, applied_at, created_at)
      VALUES (?, ?, 'ai_inference', ?, 'credit', ?, ?, ?, 'plan', ?, ?, ?, ?)
    `).run(
      `malformed-grant-${malformed.label}`,
      organizationId,
      malformed.quantity,
      `week:2026-08-10:${malformed.label}`,
      '2026-08-10T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
      'Malformed grant fixture',
      `malformed-grant-${malformed.label}`,
      '2026-08-10T11:00:00.000Z',
      '2026-08-10T11:00:00.000Z',
    )

    await assert.rejects(
      () => getCurrentCreditGrantProjection(db as never, organizationId, new Date('2026-08-10T12:00:00.000Z')),
      /Quota grant quantity must be a non-negative safe integer/,
    )
    db.close()
  }
})

test('quota grant totals fail closed when individually safe rows overflow the safe range', async () => {
  const db = createDb()
  const organizationId = 'org-overflowing-grant-total'
  const insertGrant = db.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, quantity, unit, period_key, period_start,
       period_end, grant_type, reason, idempotency_key, applied_at, created_at)
    VALUES (?, ?, 'ai_inference', ?, 'credit', ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertGrant.run(
    'overflow-baseline',
    organizationId,
    Number.MAX_SAFE_INTEGER,
    'week:2026-08-10:overflow-baseline',
    '2026-08-10T00:00:00.000Z',
    '2026-08-17T00:00:00.000Z',
    'plan',
    'Overflow baseline',
    'overflow-baseline',
    '2026-08-10T09:00:00.000Z',
    '2026-08-10T09:00:00.000Z',
  )
  insertGrant.run(
    'overflow-manual',
    organizationId,
    1,
    'week:2026-08-10:overflow-manual',
    '2026-08-10T00:00:00.000Z',
    '2026-08-17T00:00:00.000Z',
    'manual',
    'Overflow manual grant',
    'overflow-manual',
    '2026-08-10T10:00:00.000Z',
    '2026-08-10T10:00:00.000Z',
  )

  await assert.rejects(
    () => getCurrentCreditGrantProjection(db as never, organizationId, new Date('2026-08-10T12:00:00.000Z')),
    /Quota grant total must be a non-negative safe integer/,
  )
  db.close()
})

test('malformed usage quantities fail closed without changing the allowance balance', async () => {
  const malformedQuantities: Array<{ label: string; quantity: unknown }> = [
    { label: 'negative', quantity: -1 },
    { label: 'fractional', quantity: 1.5 },
    { label: 'unsafe', quantity: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'non-numeric', quantity: 'not-a-number' },
    { label: 'infinite', quantity: Number.POSITIVE_INFINITY },
  ]
  const now = new Date('2026-08-10T12:00:00.000Z')

  for (const malformed of malformedQuantities) {
    const db = createDb()
    const organizationId = `org-malformed-usage-${malformed.label}`
    const initial = await getAiQuotaStatus(db as never, organizationId, null, now)
    assert.equal(initial.balance, 500)

    db.prepare(`
      INSERT INTO usage_events
        (id, organization_id, resource, source, quantity, unit, idempotency_key, created_at)
      VALUES (?, ?, 'ai_inference', 'test', ?, 'credit', ?, ?)
    `).run(
      `malformed-usage-${malformed.label}`,
      organizationId,
      malformed.quantity,
      `malformed-usage-${malformed.label}`,
      '2026-08-10T11:30:00.000Z',
    )

    await assert.rejects(
      () => getAiQuotaStatus(db as never, organizationId, null, now),
      /Current credit usage contains malformed ledger quantities/,
    )
    const credits = db.prepare('SELECT balance, lifetime_used FROM ai_credits WHERE organization_id = ?').get(organizationId) as { balance: number; lifetime_used: number }
    assert.deepEqual(credits, { balance: 500, lifetime_used: 0 })
    db.close()
  }
})

test('malformed ai credit projection state fails closed before any grant or balance write', async () => {
  const cases: Array<{
    label: string
    balance: unknown
    lifetimeUsed: unknown
    periodKey: string | null
    updatedAt: unknown
  }> = [
    { label: 'negative-balance', balance: -1, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'fractional-balance', balance: 1.5, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'text-balance', balance: 'not-a-number', lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'negative-lifetime', balance: 500, lifetimeUsed: -1, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'fractional-lifetime', balance: 500, lifetimeUsed: 1.5, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'text-lifetime', balance: 500, lifetimeUsed: 'not-a-number', periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'empty-timestamp', balance: 500, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '' },
    { label: 'invalid-timestamp', balance: 500, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: 'not-a-timestamp' },
    { label: 'malformed-period', balance: 500, lifetimeUsed: 0, periodKey: 'not-a-week', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'non-monday-period', balance: 500, lifetimeUsed: 0, periodKey: '2026-08-11', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'non-round-tripping-period', balance: 500, lifetimeUsed: 0, periodKey: '2026-02-30', updatedAt: '2026-08-10T09:00:00.000Z' },
  ]

  for (const malformed of cases) {
    const db = createDb()
    const organizationId = `org-malformed-credit-${malformed.label}`
    db.prepare(`
      INSERT INTO ai_credits
        (organization_id, balance, lifetime_used, balance_period_key, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      organizationId,
      malformed.balance,
      malformed.lifetimeUsed,
      malformed.periodKey,
      malformed.updatedAt,
    )
    const before = db.prepare(`
      SELECT balance, lifetime_used, balance_period_key, updated_at
      FROM ai_credits WHERE organization_id = ?
    `).get(organizationId)

    await assert.rejects(
      () => getAiQuotaStatus(db as never, organizationId, null, new Date('2026-08-10T12:00:00.000Z')),
      /Invalid AI credit state:/,
    )

    const after = db.prepare(`
      SELECT balance, lifetime_used, balance_period_key, updated_at
      FROM ai_credits WHERE organization_id = ?
    `).get(organizationId)
    assert.deepEqual(after, before, malformed.label)
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { count: number }).count,
      0,
      malformed.label,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE organization_id = ?').get(organizationId) as { count: number }).count,
      0,
      malformed.label,
    )
    db.close()
  }
})

test('malformed ai credit projection state blocks flat usage before accounting writes', async () => {
  const db = createDb()
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('org-malformed-credit-charge', 500, 0, 'not-a-week', '2026-08-10T09:00:00.000Z')

  await assert.rejects(
    () => chargeFlatCredits(db as never, 'org-malformed-credit-charge', {
      action: 'google_places_details',
      idempotencyKey: 'malformed-credit-charge-1',
      now: new Date('2026-08-10T12:00:00.000Z'),
    }),
    /Invalid AI credit state:/,
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE organization_id = ?').get('org-malformed-credit-charge') as { count: number }).count,
    0,
  )
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM ai_usage_log WHERE organization_id = ?').get('org-malformed-credit-charge') as { count: number }).count,
    0,
  )
  db.close()
})

test('manual grant overflow remains pending without corrupting the credit projection', async () => {
  const db = createDb()
  const organizationId = 'org-manual-grant-overflow'
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(
    organizationId,
    Number.MAX_SAFE_INTEGER,
    '2026-08-10',
    '2026-08-10T10:00:00.000Z',
  )
  const before = db.prepare(`
    SELECT balance, lifetime_used, balance_period_key, updated_at
    FROM ai_credits WHERE organization_id = ?
  `).get(organizationId)

  const applied = await grantQuota(db as never, {
    organizationId,
    resource: 'ai_inference',
    quantity: 1,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual-overflow',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'manual',
    reason: 'Overflow guard test',
    idempotencyKey: 'manual-overflow-1',
    createdAt: '2026-08-10T10:00:00.000Z',
  })

  assert.equal(applied, false)
  assert.deepEqual(
    db.prepare(`
      SELECT balance, lifetime_used, balance_period_key, updated_at
      FROM ai_credits WHERE organization_id = ?
    `).get(organizationId),
    before,
  )
  assert.equal(
    (db.prepare('SELECT applied_at FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { applied_at: string | null } | undefined)?.applied_at ?? null,
    null,
  )
  db.close()
})

test('manual grant at the safe-integer boundary applies and marks exactly once', async () => {
  const db = createDb()
  const organizationId = 'org-manual-grant-boundary'
  const appliedAt = '2026-08-10T10:00:00.000Z'
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(organizationId, Number.MAX_SAFE_INTEGER - 1, '2026-08-10', appliedAt)

  const applied = await grantQuota(db as never, {
    organizationId,
    resource: 'ai_inference',
    quantity: 1,
    unit: 'credit',
    periodKey: 'week:2026-08-10:manual-boundary',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'manual',
    reason: 'Boundary guard test',
    idempotencyKey: 'manual-boundary-1',
    createdAt: appliedAt,
  })

  assert.equal(applied, true)
  assert.equal(
    (db.prepare('SELECT balance FROM ai_credits WHERE organization_id = ?').get(organizationId) as { balance: number }).balance,
    Number.MAX_SAFE_INTEGER,
  )
  assert.equal(
    typeof (db.prepare('SELECT applied_at FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { applied_at: string | null }).applied_at,
    'string',
  )
  db.close()
})

test('reset grant does not mark a skipped apply when createdAt collides', async () => {
  const db = createDb()
  const organizationId = 'org-reset-grant-collision'
  const createdAt = '2026-08-10T09:00:00.000Z'
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key, updated_at)
    VALUES (?, 500, 0, ?, ?)
  `).run(organizationId, '2026-02-30', createdAt)

  const applied = await grantQuota(db as never, {
    organizationId,
    resource: 'ai_inference',
    quantity: 50,
    unit: 'credit',
    periodKey: 'reset:created-at-collision',
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    grantType: 'reset',
    reason: 'Reset collision guard test',
    idempotencyKey: 'reset-created-at-collision-1',
    createdAt,
  })

  assert.equal(applied, false)
  assert.deepEqual(
    (db.prepare('SELECT balance_period_key, updated_at FROM ai_credits WHERE organization_id = ?').get(organizationId) as { balance_period_key: string; updated_at: string }),
    { balance_period_key: '2026-02-30', updated_at: createdAt },
  )
  assert.equal(
    (db.prepare('SELECT applied_at FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { applied_at: string | null }).applied_at,
    null,
  )
  db.close()
})

test('plan and reset grants leave malformed credit projections unchanged and unapplied', async () => {
  const cases: Array<{
    label: string
    balance: unknown
    lifetimeUsed: unknown
    periodKey: string | null
    updatedAt: unknown
  }> = [
    { label: 'balance', balance: 'not-a-number', lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'lifetime', balance: 500, lifetimeUsed: 'not-a-number', periodKey: '2026-08-10', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'period', balance: 500, lifetimeUsed: 0, periodKey: 'not-a-week', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'invalid-period-date', balance: 500, lifetimeUsed: 0, periodKey: '2026-02-30', updatedAt: '2026-08-10T09:00:00.000Z' },
    { label: 'timestamp', balance: 500, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: '' },
    { label: 'invalid-timestamp', balance: 500, lifetimeUsed: 0, periodKey: '2026-08-10', updatedAt: 'not-a-timestamp' },
  ]

  for (const malformed of cases) {
    for (const grantType of ['plan', 'reset'] as const) {
      const db = createDb()
      const organizationId = `org-malformed-${grantType}-${malformed.label}`
      db.prepare(`
        INSERT INTO ai_credits
          (organization_id, balance, lifetime_used, balance_period_key, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        organizationId,
        malformed.balance,
        malformed.lifetimeUsed,
        malformed.periodKey,
        malformed.updatedAt,
      )
      const before = db.prepare(`
        SELECT balance, lifetime_used, balance_period_key, updated_at
        FROM ai_credits WHERE organization_id = ?
      `).get(organizationId)

      if (grantType === 'plan') {
        assert.equal(await grantQuota(db as never, {
          organizationId,
          resource: 'ai_inference',
          quantity: 500,
          unit: 'credit',
          periodKey: `week:2026-08-10:malformed-${malformed.label}`,
          periodStart: '2026-08-10T00:00:00.000Z',
          periodEnd: '2026-08-17T00:00:00.000Z',
          grantType,
          reason: 'Malformed projection test',
          idempotencyKey: `malformed-${grantType}-${malformed.label}`,
          createdAt: '2026-08-10T09:00:00.000Z',
        }), false, `${grantType}:${malformed.label}`)
      } else {
        await resetOrganizationQuota(db as never, {
          organizationId,
          resetId: `malformed-${malformed.label}`,
          reason: 'Malformed projection test',
          grants: [{
            resource: 'ai_inference',
            quantity: 50,
            unit: 'credit',
            periodStart: '2026-08-10T00:00:00.000Z',
            periodEnd: '2026-08-17T00:00:00.000Z',
          }],
        })
      }

      assert.deepEqual(
        db.prepare(`
          SELECT balance, lifetime_used, balance_period_key, updated_at
          FROM ai_credits WHERE organization_id = ?
        `).get(organizationId),
        before,
        `${grantType}:${malformed.label}`,
      )
      assert.equal(
        (db.prepare('SELECT applied_at FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { applied_at: string | null } | undefined)?.applied_at ?? null,
        null,
        `${grantType}:${malformed.label}`,
      )
      db.close()
    }
  }
})

test('credit charges reject lifetime overflow without partial ledger or log writes', async () => {
  for (const mode of ['flat', 'token'] as const) {
    const db = createDb()
    const organizationId = `org-lifetime-overflow-${mode}`
    seedSubscription(db, {
      organizationId,
      plan: 'growth',
      status: 'active',
      periodEnd: '2026-08-31T00:00:00.000Z',
      paymentStatus: 'paid',
      paidThrough: '2026-08-31T00:00:00.000Z',
    })
    db.prepare(`
      INSERT INTO ai_credits
        (organization_id, balance, lifetime_used, balance_period_key, updated_at)
      VALUES (?, 500, 0, ?, ?)
    `).run(organizationId, '2026-08-10', '2026-08-10T10:00:00.000Z')
    db.prepare(`
      UPDATE ai_credits
      SET balance = 500, lifetime_used = ?, updated_at = ?
      WHERE organization_id = ?
    `).run(Number.MAX_SAFE_INTEGER, '2026-08-10T11:00:00.000Z', organizationId)

    const before = db.prepare(`
      SELECT balance, lifetime_used, balance_period_key, updated_at
      FROM ai_credits WHERE organization_id = ?
    `).get(organizationId)
    const grantCount = (db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { count: number }).count

    if (mode === 'flat') {
      await assert.rejects(
        () => chargeFlatCredits(db as never, organizationId, {
          action: 'google_places_details',
          idempotencyKey: `lifetime-overflow-${mode}`,
          now: new Date('2026-08-10T12:00:00.000Z'),
        }),
        /AI lifetime usage would exceed the safe integer range/,
      )
    } else {
      await assert.rejects(
        () => chargeCredits(db as never, organizationId, {
          action: 'chowbot',
          model: 'test-model',
          inputTokens: 1,
          outputTokens: 0,
          idempotencyKey: `lifetime-overflow-${mode}`,
          now: new Date('2026-08-10T12:00:00.000Z'),
        }),
        /AI lifetime usage would exceed the safe integer range/,
      )
    }

    assert.deepEqual(
      db.prepare(`
        SELECT balance, lifetime_used, balance_period_key, updated_at
        FROM ai_credits WHERE organization_id = ?
      `).get(organizationId),
      before,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM usage_events WHERE organization_id = ?').get(organizationId) as { count: number }).count,
      0,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM ai_usage_log WHERE organization_id = ?').get(organizationId) as { count: number }).count,
      0,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM usage_quota_grants WHERE organization_id = ?').get(organizationId) as { count: number }).count,
      grantCount,
    )
    db.close()
  }
})

test('malformed token counts fail before any credit state or ledger write', async () => {
  const cases: Array<{ label: string; inputTokens: number; outputTokens: number }> = [
    { label: 'negative-input', inputTokens: -1, outputTokens: 0 },
    { label: 'fractional-input', inputTokens: 1.5, outputTokens: 0 },
    { label: 'unsafe-input', inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0 },
    { label: 'infinite-output', inputTokens: 0, outputTokens: Number.POSITIVE_INFINITY },
    { label: 'nan-output', inputTokens: 0, outputTokens: Number.NaN },
  ]

  for (const malformed of cases) {
    const db = createDb()
    await assert.rejects(
      () => chargeCredits(db as never, `org-malformed-token-${malformed.label}`, {
        action: 'chowbot',
        model: 'test-model',
        inputTokens: malformed.inputTokens,
        outputTokens: malformed.outputTokens,
      }),
      /AI token counts must be non-negative safe integers/,
      malformed.label,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM ai_credits').get() as { count: number }).count,
      0,
      malformed.label,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM usage_events').get() as { count: number }).count,
      0,
      malformed.label,
    )
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM ai_usage_log').get() as { count: number }).count,
      0,
      malformed.label,
    )
    db.close()
  }
})
