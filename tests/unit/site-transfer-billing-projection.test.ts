import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import { getPlanEntitlements } from '../../server/utils/billing-entitlements.ts'

type BatchQuery = { query: string; params?: unknown[] }

const fakeDb = {}
const capturedBatches: BatchQuery[][] = []
let recipientProjection: unknown
let recipientBillingRow: Record<string, unknown> | null = null
let projectionError: Error | null = null

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('FROM organization_billing')) return recipientBillingRow as T | null
      throw new Error(`Unexpected queryFirst query: ${query}`)
    },
    queryAll: async () => [],
    execute: async () => ({ meta: { changes: 1 } }),
    executeBatch: async (_db: unknown, batch: BatchQuery[]) => {
      capturedBatches.push(batch)
      return batch.map(() => ({ meta: { changes: 1 } }))
    },
  },
})

mock.module('../../server/utils/organization-billing.ts', {
  namedExports: {
    validateOrganizationBillingProjection: () => {
      if (projectionError) throw projectionError
      return recipientProjection
    },
  },
})

mock.module('../../server/utils/domains.ts', {
  namedExports: {
    createCustomDomainPair: async () => undefined,
    deleteCustomDomain: async () => undefined,
  },
})

mock.module('../../server/utils/site-transfer-notifications.ts', {
  namedExports: {
    notifySiteTransferReminder: async () => undefined,
  },
})

const { executeSiteTransfer, reassignSiteOwnership } = await import('../../server/utils/site-transfer.ts')

const SOURCE_ORG = 'org-source'
const RECIPIENT_ORG = 'org-recipient'
const SITE_ID = 'site-transfer'

function projectionFor(plan: string) {
  return {
    organizationId: RECIPIENT_ORG,
    stripeCustomerId: plan === 'free' ? null : 'cus-recipient',
    stripeSubscriptionId: plan === 'free' ? null : 'sub-recipient',
    plan,
    effectivePlan: plan,
    status: plan === 'free' ? 'free' : 'active',
    paymentStatus: plan === 'free' ? 'unknown' : 'paid',
    paidThrough: plan === 'free' ? null : '2026-09-01T00:00:00.000Z',
    pastDueSince: null,
    currentPeriodEnd: plan === 'free' ? null : '2026-09-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    updatedAt: '2026-08-08T00:00:00.000Z',
    entitlements: getPlanEntitlements(plan),
  }
}

function paidBillingRow(plan: string) {
  return {
    organization_id: RECIPIENT_ORG,
    stripe_customer_id: 'cus-recipient',
    stripe_subscription_id: 'sub-recipient',
    stripe_subscription_item_id: 'si-recipient',
    status: 'active',
    plan,
    current_period_end: '2026-09-01T00:00:00.000Z',
    cancel_at_period_end: 0,
    payment_status: 'paid',
    paid_through: '2026-09-01T00:00:00.000Z',
    past_due_since: null,
    last_paid_invoice_id: 'in-recipient',
    last_payment_event_created: 1_754_600_000,
    last_payment_event_id: 'evt-recipient',
    updated_at: '2026-08-08T00:00:00.000Z',
  }
}

function query(batch: BatchQuery[], text: string): BatchQuery {
  const found = batch.find(statement => statement.query.includes(text))
  assert.ok(found, `batch should include ${text}`)
  return found
}

function assertNoSourceBillingOrGrantTables(batch: BatchQuery[]) {
  for (const statement of batch) {
    if (/^SELECT CASE WHEN EXISTS/.test(statement.query.trim())) continue
    assert.doesNotMatch(statement.query, /organization_billing|organization_entitlements|usage_quota_grants|usage_events|ai_credits|ai_usage_log/)
  }
}

test.beforeEach(() => {
  capturedBatches.length = 0
  recipientProjection = projectionFor('free')
  recipientBillingRow = null
  projectionError = null
})

test('paid source to free recipient rebuilds compatibility projections as Starter', async () => {
  recipientProjection = projectionFor('free')

  await executeSiteTransfer(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG, 'transfer-1', 'user-1')

  assert.equal(capturedBatches.length, 1)
  const batch = capturedBatches[0]!
  const site = query(batch, 'UPDATE sites SET organization_id')
  assert.deepEqual(site.params, [RECIPIENT_ORG, 'free', site.params?.[2], SITE_ID, SOURCE_ORG])

  const siteBilling = query(batch, 'INSERT INTO site_billing')
  assert.equal(siteBilling.params?.[2], RECIPIENT_ORG)
  assert.equal(siteBilling.params?.[6], 'free')
  assert.equal(siteBilling.params?.[7], 'free')
  assert.equal(siteBilling.params?.[10], 'unknown')
  assert.equal(siteBilling.params?.[4], null)
  assert.equal(siteBilling.params?.[5], null)
  assert.ok(batch.some(statement => statement.query.includes('FROM organization_billing WHERE organization_id = ? LIMIT 1')))

  const entitlementRows = batch.filter(statement => statement.query.includes('INSERT INTO site_entitlements'))
  assert.deepEqual(entitlementRows.map(statement => [statement.params?.[3], statement.params?.[4]]), Object.entries(getPlanEntitlements('free')).map(([key, value]) => [key, String(value)]))
  assert.ok(batch.some(statement => statement.query === 'DELETE FROM site_entitlements WHERE site_id = ?'))
  assert.ok(batch.some(statement => statement.query.includes('UPDATE site_transfer_requests')))
  assertNoSourceBillingOrGrantTables(batch)
})

test('free source to Growth recipient receives recipient billing and entitlements', async () => {
  recipientProjection = projectionFor('growth')
  recipientBillingRow = paidBillingRow('growth')

  await reassignSiteOwnership(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG)

  assert.equal(capturedBatches.length, 1)
  const batch = capturedBatches[0]!
  const site = query(batch, 'UPDATE sites SET organization_id')
  assert.equal(site.params?.[1], 'growth')

  const siteBilling = query(batch, 'INSERT INTO site_billing')
  assert.ok(batch.some(statement => statement.query.includes('NOT EXISTS (')) && batch.some(statement => statement.query.includes('FROM organization_billing')))
  // Per-site subscription IDs stay NULL: the organization subscription is the
  // sole authority and these compatibility columns are unique per site.
  assert.deepEqual(siteBilling.params?.slice(2, 12), [
    RECIPIENT_ORG,
    'cus-recipient',
    null,
    null,
    'growth',
    'active',
    '2026-09-01T00:00:00.000Z',
    0,
    'paid',
    '2026-09-01T00:00:00.000Z',
  ])
  assertNoSourceBillingOrGrantTables(batch)
})

test('legacy recipient billing projection fails closed before site transfer mutation', async () => {
  projectionError = new Error('Invalid organization billing projection: unknown plan')

  await assert.rejects(
    () => executeSiteTransfer(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG, 'transfer-legacy', 'user-1'),
    /unknown plan/,
  )
  assert.deepEqual(capturedBatches, [])
})

test('site billing compatibility plan follows the validated Growth effective plan', async () => {
  recipientProjection = {
    ...projectionFor('growth'),
    effectivePlan: 'growth',
    entitlements: getPlanEntitlements('growth'),
  }
  recipientBillingRow = paidBillingRow('growth')

  await reassignSiteOwnership(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG)

  const batch = capturedBatches[0]!
  assert.equal(query(batch, 'INSERT INTO site_billing').params?.[6], 'growth')
  assert.equal(query(batch, 'UPDATE sites SET organization_id').params?.[1], 'growth')
})

test('acceptance batch fences pending transfer races with a final compare-and-set assertion', async () => {
  await executeSiteTransfer(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG, 'transfer-cas', 'user-1')

  const batch = capturedBatches[0]!
  const completion = query(batch, "SET status = 'accepted'")
  assert.match(completion.query, /WHERE id = \? AND status = 'pending'/)
  assert.deepEqual(completion.params?.slice(0, 3), ['user-1', 'user-1', RECIPIENT_ORG])
  assert.equal(completion.params?.[4], null)
  assert.equal(batch.some(statement => statement.query.includes('PRAGMA defer_foreign_keys = OFF')), false)
  assert.ok(batch.some(statement => statement.query.includes('changes() = 0')))
  assert.ok(batch.some(statement => statement.query.includes("status = 'pending'")))
})

test('entitled fulfillment stamps claims and payment completion in the acceptance CAS', async () => {
  const paymentCompletedAt = '2026-08-08T12:34:56.000Z'

  await executeSiteTransfer(
    fakeDb as never,
    SITE_ID,
    SOURCE_ORG,
    RECIPIENT_ORG,
    'transfer-entitled',
    'user-1',
    { paymentCompletedAt },
  )

  const completion = query(capturedBatches[0]!, "SET status = 'accepted'")
  assert.match(completion.query, /payment_completed_at = \?/)
  assert.equal(completion.params?.[4], paymentCompletedAt)
  assert.equal(completion.params?.[5], 'transfer-entitled')
})

test('malformed recipient projection fails closed before any transfer batch', async () => {
  projectionError = new Error('Invalid organization billing projection: unknown effective plan.')

  await assert.rejects(
    () => executeSiteTransfer(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG, 'transfer-invalid', 'user-1'),
    /unknown effective plan/,
  )
  assert.equal(capturedBatches.length, 0)
})

test('recipient projection organization mismatch fails closed before any transfer batch', async () => {
  recipientProjection = { ...projectionFor('free'), organizationId: SOURCE_ORG }

  await assert.rejects(
    () => executeSiteTransfer(fakeDb as never, SITE_ID, SOURCE_ORG, RECIPIENT_ORG, 'transfer-mismatch', 'user-1'),
    /projection organization/,
  )
  assert.equal(capturedBatches.length, 0)
})
