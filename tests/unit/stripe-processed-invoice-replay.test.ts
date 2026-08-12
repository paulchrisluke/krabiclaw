import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'
import type { OrganizationSubscriptionReconciliationReport } from '../../server/utils/organization-subscription-reconciliation.ts'

type SqliteDb = InstanceType<typeof Database>

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function execute(db: SqliteDb, query: string, params: unknown[] = []) {
  const result = db.prepare(query).run(...params)
  return { meta: { changes: Number(result.changes) } }
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst,
    execute,
    queryAll: async () => [],
    executeBatch: async () => [],
  },
})

const {
  applyStripeProcessedInvoiceReplay,
  assertStripeProcessedInvoiceReplayOperatorSession,
  parseStripeProcessedInvoiceReplayRequest,
  previewStripeProcessedInvoiceReplay,
  StripeProcessedInvoiceReplayError,
} = await import('../../server/utils/stripe-processed-invoice-replay.ts')

const NOW = new Date('2026-08-10T12:00:00.000Z')
const INPUT = {
  organizationId: 'org-kikuzuki',
  stripeEventId: 'evt-kikuzuki-paid',
  providerMode: 'live' as const,
  expectedStripeAccountId: 'acct_live',
  reason: 'Repair canonical paid invoice projection for Kikuzuki',
  idempotencyKey: 'stripe-event:evt-kikuzuki-paid',
}
const PERIOD_START = '2026-07-23T05:12:51.000Z'
const PERIOD_END = '2026-08-23T05:12:51.000Z'
const RETAINED_EVENT = JSON.stringify({
  id: INPUT.stripeEventId,
  type: 'invoice.paid',
  livemode: true,
  created: Math.floor(Date.parse('2026-08-07T06:14:28.000Z') / 1000),
  data: {
    object: {
      id: 'in-kikuzuki',
      status: 'paid',
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub-kikuzuki' },
      },
    },
  },
})
const routeSource = readFileSync(new URL(
  '../../server/api/admin/billing/stripe-processed-invoice-replay.post.ts',
  import.meta.url,
), 'utf8')

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE stripe_webhook_events (
      id TEXT PRIMARY KEY,
      stripe_event_id TEXT NOT NULL UNIQUE,
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
    CREATE TABLE stripe_invoice_payments (
      stripe_invoice_id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL,
      base_plan_price_id TEXT,
      status TEXT,
      period_start TEXT,
      period_end TEXT,
      last_event_created INTEGER,
      last_event_id TEXT
    );
    CREATE TABLE organization_billing (
      organization_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT,
      status TEXT,
      payment_status TEXT,
      paid_through TEXT,
      current_period_end TEXT,
      last_paid_invoice_id TEXT,
      last_payment_event_created INTEGER,
      last_payment_event_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE usage_quota_grants (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      grant_type TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE TABLE ai_credits (
      organization_id TEXT PRIMARY KEY,
      balance INTEGER,
      lifetime_used INTEGER,
      balance_period_key TEXT
    );
  `)
  db.prepare(`
    INSERT INTO stripe_webhook_events
      (id, stripe_event_id, event_type, status, payload, error, claimed_at,
       lease_expires_at, claim_token, next_attempt_at, attempt_count,
       dead_lettered_at, created_at)
    VALUES ('row-event', ?, 'invoice.paid', 'processed', ?, NULL, NULL,
            NULL, NULL, NULL, 1, NULL, '2026-08-07T07:00:00.000Z')
  `).run(INPUT.stripeEventId, RETAINED_EVENT)
  db.prepare(`
    INSERT INTO stripe_invoice_payments
      (stripe_invoice_id, organization_id, stripe_subscription_id,
       base_plan_price_id, status, period_start, period_end,
       last_event_created, last_event_id)
    VALUES ('in-kikuzuki', ?, 'sub-kikuzuki', NULL, 'paid',
            '2026-06-23T05:12:51.000Z', '2026-07-23T05:12:51.000Z',
            1785996868, 'evt-payment-succeeded')
  `).run(INPUT.organizationId)
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, stripe_customer_id, stripe_subscription_id, plan,
       status, payment_status, paid_through, current_period_end,
       last_paid_invoice_id, last_payment_event_created,
       last_payment_event_id, updated_at)
    VALUES (?, 'cus-kikuzuki', 'sub-kikuzuki', 'growth', 'active', 'paid',
            NULL, ?, NULL, 1785996868, 'evt-payment-succeeded',
            '2026-08-07T07:21:19.285Z')
  `).run(INPUT.organizationId, PERIOD_END)
  db.prepare(`
    INSERT INTO usage_quota_grants
      (id, organization_id, resource, grant_type, applied_at)
    VALUES ('grant-kikuzuki', ?, 'ai_inference', 'plan',
            '2026-07-23T06:14:28.000Z')
  `).run(INPUT.organizationId)
  db.prepare(`
    INSERT INTO ai_credits
      (organization_id, balance, lifetime_used, balance_period_key)
    VALUES (?, 1998, 22, '2026-08-03')
  `).run(INPUT.organizationId)
  return db
}

function reconciliationReport(): OrganizationSubscriptionReconciliationReport {
  return {
    schemaVersion: 1,
    kind: 'organization-subscription-reconciliation',
    capturedAt: NOW.toISOString(),
    operator: { actor: 'operator-1', direct: true },
    request: {
      organizationId: INPUT.organizationId,
      providerMode: INPUT.providerMode,
      expectedStripeAccountId: INPUT.expectedStripeAccountId,
    },
    provider: {
      mode: 'live',
      expectedAccountId: INPUT.expectedStripeAccountId,
      modeVerified: true,
      account: { id: INPUT.expectedStripeAccountId, verified: true },
      customer: {
        id: 'cus-kikuzuki',
        discoveredByMetadataSearch: false,
        deleted: false,
        metadata: {
          organizationId: INPUT.organizationId,
          organization_id: null,
          ownerId: INPUT.organizationId,
          ownerMetadataConflict: false,
          customerType: 'organization',
        },
      },
      subscriptions: [{
        id: 'sub-kikuzuki',
        customerId: 'cus-kikuzuki',
        status: 'active',
        quantity: 1,
        metadata: {
          organizationId: INPUT.organizationId,
          organization_id: null,
          referenceId: INPUT.organizationId,
          subscriptionId: 'ba-kikuzuki',
          ownerId: INPUT.organizationId,
          ownerMetadataConflict: false,
        },
        canonicalPlan: 'growth',
        canonicalBasePriceId: 'price-growth-monthly',
        canonicalBaseItemId: 'si-kikuzuki-base',
        billingInterval: 'month',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
        latestInvoiceId: 'in-kikuzuki',
        latestInvoice: {
          id: 'in-kikuzuki',
          subscriptionId: 'sub-kikuzuki',
          status: 'paid',
          linesRetrieved: 1,
          linesComplete: true,
          lines: [{
            id: 'il-kikuzuki-base',
            subscriptionId: 'sub-kikuzuki',
            subscriptionItemId: 'si-kikuzuki-base',
            priceId: 'price-growth-monthly',
            quantity: 1,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            proration: false,
            subscriptionLine: true,
          }],
          baseLine: {
            id: 'il-kikuzuki-base',
            subscriptionId: 'sub-kikuzuki',
            subscriptionItemId: 'si-kikuzuki-base',
            priceId: 'price-growth-monthly',
            quantity: 1,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            proration: false,
            subscriptionLine: true,
          },
        },
      }],
    },
    betterAuth: {
      organization: { id: INPUT.organizationId, stripeCustomerId: 'cus-kikuzuki' },
      subscriptions: [{
        id: 'ba-kikuzuki',
        referenceId: INPUT.organizationId,
        ownerMetadataConflict: false,
        plan: 'growth',
        status: 'active',
        stripeCustomerId: 'cus-kikuzuki',
        stripeSubscriptionId: 'sub-kikuzuki',
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
        billingInterval: 'month',
        seats: 1,
      }],
    },
    appProjection: { row: null, projection: null, projectionError: 'paid active subscriptions require paid_through' },
    effectiveEntitlements: { plan: 'free' },
    localEvidence: {
      organizationEntitlements: [],
      invoices: [],
      subscriptionVersions: [],
      webhookEvents: [],
      sites: [],
      siteBilling: [],
      siteEntitlements: [],
    },
    drifts: [{ code: 'app_projection_malformed', severity: 'blocked', subject: INPUT.organizationId, detail: 'paid_through missing' }],
    status: 'blocked',
    reportSha256: 'b'.repeat(64),
  }
}

function expectError(code: string, statusCode = 409) {
  return (error: unknown) => error instanceof StripeProcessedInvoiceReplayError
    && error.code === code
    && error.statusCode === statusCode
}

test('request and operator boundaries reject payload injection and impersonation', () => {
  assert.deepEqual(parseStripeProcessedInvoiceReplayRequest(INPUT), { mode: 'preview', input: INPUT })
  assert.throws(
    () => parseStripeProcessedInvoiceReplayRequest({ ...INPUT, payload: RETAINED_EVENT }),
    expectError('invalid_request', 400),
  )
  assert.throws(
    () => parseStripeProcessedInvoiceReplayRequest({ ...INPUT, stripeEventId: 'evt-other' }),
    expectError('invalid_request', 400),
  )
  assert.throws(
    () => parseStripeProcessedInvoiceReplayRequest({ ...INPUT, mode: 'apply', expectedStateSha256: '0'.repeat(64) }),
    expectError('invalid_request', 400),
  )
  assert.equal(
    assertStripeProcessedInvoiceReplayOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: null } }),
    'operator-1',
  )
  assert.throws(
    () => assertStripeProcessedInvoiceReplayOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: 'admin-1' } }),
    expectError('impersonation_forbidden', 403),
  )
})

test('operator route fails closed on permission, mode, and cache boundaries', () => {
  assert.match(routeSource, /platformPermissionJsonResponse\(event, env, \{ platform: \['billing'\] \}\)/u)
  assert.match(routeSource, /setResponseHeader\(event, 'cache-control', 'no-store'\)/u)
  assert.match(routeSource, /headers: \{ 'cache-control': 'no-store' \}/u)
  const modeGuard = routeSource.indexOf('assertStripeProviderMode(')
  const auth = routeSource.indexOf('createAuth(env)')
  const provider = routeSource.indexOf('createStripeClient(')
  assert.ok(modeGuard >= 0)
  assert.ok(auth > modeGuard && provider > modeGuard)
  assert.doesNotMatch(routeSource, /processStripeEvent|usage_quota_grants|ai_credits/u)
})

test('preview signs exact provider and local evidence without mutating the processed event or quota', async () => {
  const db = createDb()
  const eventBefore = JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get())
  const quotaBefore = JSON.stringify(db.prepare('SELECT * FROM usage_quota_grants').all())
  const result = await previewStripeProcessedInvoiceReplay(
    db as never,
    'approval-secret',
    INPUT,
    'operator-1',
    reconciliationReport(),
    NOW,
  )

  assert.equal(result.status, 'preview')
  assert.equal(result.plan.event.invoiceId, 'in-kikuzuki')
  assert.equal(result.plan.event.subscriptionId, 'sub-kikuzuki')
  assert.deepEqual(result.plan.repair, {
    basePlanPriceId: 'price-growth-monthly',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  })
  assert.deepEqual(result.plan.quotaBefore, {
    totalGrants: 1,
    planGrants: 1,
    appliedPlanGrants: 1,
    balance: 1998,
    lifetimeUsed: 22,
    balancePeriodKey: '2026-08-03',
  })
  assert.match(result.plan.expectedStateSha256, /^[0-9a-f]{64}$/u)
  assert.match(result.plan.approvalToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
  assert.doesNotMatch(JSON.stringify(result.plan), /subscription_details|"data"\s*:/u)
  assert.equal('payload' in result.plan, false)
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get()), eventBefore)
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM usage_quota_grants').all()), quotaBefore)
})

test('approved apply queues the retained event once without resetting attempts or touching quota', async () => {
  const db = createDb()
  const report = reconciliationReport()
  const preview = await previewStripeProcessedInvoiceReplay(
    db as never,
    'approval-secret',
    INPUT,
    'operator-1',
    report,
    NOW,
  )
  assert.equal(preview.status, 'preview')
  if (preview.status !== 'preview') return
  const payloadBefore = db.prepare('SELECT payload FROM stripe_webhook_events').get()?.payload
  const quotaBefore = JSON.stringify({
    grants: db.prepare('SELECT * FROM usage_quota_grants').all(),
    credits: db.prepare('SELECT * FROM ai_credits').all(),
  })

  const applied = await applyStripeProcessedInvoiceReplay(
    db as never,
    'approval-secret',
    INPUT,
    'operator-1',
    report,
    preview.plan.expectedStateSha256,
    preview.plan.approvalToken,
    NOW,
  )
  assert.deepEqual(applied, {
    status: 'queued',
    stripeEventId: INPUT.stripeEventId,
    invoiceId: 'in-kikuzuki',
    attemptCount: 1,
  })
  assert.deepEqual(db.prepare(`
    SELECT status, attempt_count, payload, error, claimed_at,
           lease_expires_at, claim_token, next_attempt_at, dead_lettered_at
      FROM stripe_webhook_events
  `).get(), {
    status: 'pending',
    attempt_count: 1,
    payload: payloadBefore,
    error: null,
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    next_attempt_at: null,
    dead_lettered_at: null,
  })
  assert.equal(JSON.stringify({
    grants: db.prepare('SELECT * FROM usage_quota_grants').all(),
    credits: db.prepare('SELECT * FROM ai_credits').all(),
  }), quotaBefore)

  const repeated = await applyStripeProcessedInvoiceReplay(
    db as never,
    'approval-secret',
    INPUT,
    'operator-1',
    report,
    preview.plan.expectedStateSha256,
    preview.plan.approvalToken,
    NOW,
  )
  assert.deepEqual(repeated, {
    status: 'already_queued',
    stripeEventId: INPUT.stripeEventId,
    invoiceId: 'in-kikuzuki',
    attemptCount: 1,
  })
})

test('apply rejects stale state and a tampered approval without queueing', async () => {
  const staleDb = createDb()
  const staleReport = reconciliationReport()
  const stalePreview = await previewStripeProcessedInvoiceReplay(
    staleDb as never,
    'approval-secret',
    INPUT,
    'operator-1',
    staleReport,
    NOW,
  )
  assert.equal(stalePreview.status, 'preview')
  if (stalePreview.status !== 'preview') return
  staleDb.prepare("UPDATE organization_billing SET updated_at = '2026-08-10T12:01:00.000Z'").run()
  await assert.rejects(
    () => applyStripeProcessedInvoiceReplay(
      staleDb as never,
      'approval-secret',
      INPUT,
      'operator-1',
      staleReport,
      stalePreview.plan.expectedStateSha256,
      stalePreview.plan.approvalToken,
      NOW,
    ),
    expectError('stale_state'),
  )
  assert.equal(staleDb.prepare('SELECT status FROM stripe_webhook_events').get()?.status, 'processed')

  const tamperedDb = createDb()
  const tamperedReport = reconciliationReport()
  const tamperedPreview = await previewStripeProcessedInvoiceReplay(
    tamperedDb as never,
    'approval-secret',
    INPUT,
    'operator-1',
    tamperedReport,
    NOW,
  )
  assert.equal(tamperedPreview.status, 'preview')
  if (tamperedPreview.status !== 'preview') return
  const token = tamperedPreview.plan.approvalToken
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
  await assert.rejects(
    () => applyStripeProcessedInvoiceReplay(
      tamperedDb as never,
      'approval-secret',
      INPUT,
      'operator-1',
      tamperedReport,
      tamperedPreview.plan.expectedStateSha256,
      tamperedToken,
      NOW,
    ),
    expectError('approval_token_invalid'),
  )
  assert.equal(tamperedDb.prepare('SELECT status FROM stripe_webhook_events').get()?.status, 'processed')
})

test('preview is an idempotent no-op after canonical invoice evidence is already applied', async () => {
  const db = createDb()
  db.prepare(`
    UPDATE stripe_invoice_payments
       SET base_plan_price_id = 'price-growth-monthly',
           period_start = ?, period_end = ?
  `).run(PERIOD_START, PERIOD_END)
  db.prepare(`
    UPDATE organization_billing
       SET payment_status = 'paid', paid_through = ?,
           last_paid_invoice_id = 'in-kikuzuki'
  `).run(PERIOD_END)
  const eventBefore = JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get())
  const result = await previewStripeProcessedInvoiceReplay(
    db as never,
    'approval-secret',
    INPUT,
    'operator-1',
    reconciliationReport(),
    NOW,
  )
  assert.deepEqual(result, {
    status: 'already_applied',
    stripeEventId: INPUT.stripeEventId,
    invoiceId: 'in-kikuzuki',
    paidThrough: PERIOD_END,
  })
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get()), eventBefore)
})

test('preview blocks malformed local, retained, and provider evidence without writes', async () => {
  const cases: Array<{
    label: string
    mutateDb?: (_db: SqliteDb) => void
    mutateReport?: (_report: OrganizationSubscriptionReconciliationReport) => void
    now?: Date
    code: string
  }> = [
    {
      label: 'retained event mode mismatch',
      mutateDb: db => db.prepare('UPDATE stripe_webhook_events SET payload = ?').run(RETAINED_EVENT.replace('"livemode":true', '"livemode":false')),
      code: 'provider_mode_mismatch',
    },
    {
      label: 'retained payload expired',
      mutateDb: db => db.prepare("UPDATE stripe_webhook_events SET created_at = '2025-01-01T00:00:00.000Z'").run(),
      code: 'payload_expired',
    },
    {
      label: 'cross-organization invoice',
      mutateDb: db => db.prepare("UPDATE stripe_invoice_payments SET organization_id = 'org-other'").run(),
      code: 'local_evidence_mismatch',
    },
    {
      label: 'wrong non-null local base price cannot be repaired by replay',
      mutateDb: db => db.prepare("UPDATE stripe_invoice_payments SET base_plan_price_id = 'price-other'").run(),
      code: 'local_evidence_not_repairable',
    },
    {
      label: 'provider price mismatch',
      mutateReport: report => {
        const subscription = report.provider.subscriptions[0]
        if (subscription?.latestInvoice?.baseLine) subscription.latestInvoice.baseLine.priceId = 'price-other'
      },
      code: 'provider_evidence_invalid',
    },
    {
      label: 'unrelated blocked reconciliation drift',
      mutateReport: report => {
        report.drifts.push({
          code: 'provider_customer_ambiguous',
          severity: 'blocked',
          subject: 'stripe.customer',
          detail: 'More than one customer matched.',
        })
      },
      code: 'reconciliation_evidence_mismatch',
    },
    {
      label: 'additional active provider subscription',
      mutateReport: report => {
        const subscription = report.provider.subscriptions[0]
        if (subscription) report.provider.subscriptions.push({ ...subscription, id: 'sub-other' })
      },
      code: 'subscription_evidence_mismatch',
    },
    {
      label: 'attempt budget exhausted',
      mutateDb: db => db.prepare('UPDATE stripe_webhook_events SET attempt_count = 5').run(),
      code: 'invalid_state',
    },
  ]

  for (const item of cases) {
    const db = createDb()
    const report = reconciliationReport()
    item.mutateDb?.(db)
    item.mutateReport?.(report)
    const eventBefore = JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get())
    const quotaBefore = JSON.stringify(db.prepare('SELECT * FROM usage_quota_grants').all())
    await assert.rejects(
      () => previewStripeProcessedInvoiceReplay(
        db as never,
        'approval-secret',
        INPUT,
        'operator-1',
        report,
        item.now ?? NOW,
      ),
      expectError(item.code),
      item.label,
    )
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM stripe_webhook_events').get()), eventBefore, item.label)
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM usage_quota_grants').all()), quotaBefore, item.label)
  }
})
