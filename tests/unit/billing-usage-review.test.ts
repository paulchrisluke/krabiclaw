import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import {
  getEffectiveAccessPlan,
  PAST_DUE_GRACE_PERIOD_MS,
} from '../../server/utils/billing-access.ts'

test('effective access is derived from subscription status', () => {
  const now = new Date('2026-08-05T00:00:00.000Z')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'active' }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'trialing' }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'past_due', periodEnd: new Date(now.getTime() - PAST_DUE_GRACE_PERIOD_MS + 1) }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'past_due', periodEnd: new Date(now.getTime() - PAST_DUE_GRACE_PERIOD_MS - 1) }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'unpaid' }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'canceled' }, now), 'free')
})

let eventState: {
  status: string
  leaseExpiresAt: string | null
  attempts: number
} | null = null
let capturedBatches: Array<Array<{ query: string; params?: unknown[] }>> = []

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async () => [{ id: 'site-1' }],
    queryFirst: async (_db: unknown, query: string) => {
      if (query.includes('FROM subscription')) return null
      if (query.includes('FROM organization')) return { id: 'org-1' }
      return eventState
        ? { status: eventState.status, lease_expires_at: eventState.leaseExpiresAt }
        : null
    },
    execute: async (db: unknown, query: string, params: unknown[]) => {
      void db
      if (query.includes('INSERT OR IGNORE INTO stripe_webhook_events')) {
        if (eventState) return { meta: { changes: 0 } }
        eventState = {
          status: 'pending',
          leaseExpiresAt: String(params[5]),
          attempts: 1,
        }
        return { meta: { changes: 1 } }
      }
      if (query.includes("SET status = 'pending'")) {
        if (!eventState) return { meta: { changes: 0 } }
        eventState = {
          status: 'pending',
          leaseExpiresAt: String(params[3]),
          attempts: eventState.attempts + 1,
        }
        return { meta: { changes: 1 } }
      }
      if (query.includes("SET status = 'processed'")) {
        if (eventState) eventState = { ...eventState, status: 'processed', leaseExpiresAt: null }
        return { meta: { changes: 1 } }
      }
      if (query.includes("SET status = 'failed'")) {
        if (eventState) eventState = { ...eventState, status: 'failed', leaseExpiresAt: null }
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 1 } }
    },
    executeBatch: async (_db: unknown, queries: Array<{ query: string; params?: unknown[] }>) => {
      capturedBatches.push(queries)
      return queries.map(() => ({ meta: { changes: 1 } }))
    },
  },
})

const {
  projectOrganizationSubscription,
  reconcileBetterAuthSubscriptionEvent,
  recordStripeEvent,
  grantInvoiceQuota,
} = await import('../../server/utils/better-auth-stripe.ts')
const { grantQuota } = await import('../../server/utils/usage-metering.ts')

const event = {
  id: 'evt_review_1',
  type: 'customer.subscription.updated',
  data: { object: {} },
} as never

test('a failed webhook lease is reclaimed and retried', async () => {
  eventState = null
  let attempts = 0
  await assert.rejects(() => recordStripeEvent({} as never, event, async () => {
    attempts += 1
    throw new Error('simulated worker termination')
  }))
  assert.equal(attempts, 1)
  assert.equal(eventState?.status, 'failed')

  const processed = await recordStripeEvent({} as never, event, async () => {
    attempts += 1
  })
  assert.equal(processed, true)
  assert.equal(attempts, 2)
  assert.equal(eventState?.status, 'processed')
  assert.equal(eventState?.attempts, 2)
})

test('an expired pending webhook lease is reclaimed after a process interruption', async () => {
  eventState = {
    status: 'pending',
    leaseExpiresAt: '2020-01-01T00:00:00.000Z',
    attempts: 1,
  }
  let ran = false
  assert.equal(await recordStripeEvent({} as never, event, async () => { ran = true }), true)
  assert.equal(ran, true)
  assert.equal(eventState?.status, 'processed')
  assert.equal(eventState?.attempts, 2)
})

test('subscription projection failures remain retryable when Better Auth did not persist the row', async () => {
  const lifecycleEvent = {
    id: 'evt_missing_ba_subscription',
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_missing_ba_subscription' } },
  } as never

  await assert.rejects(
    () => reconcileBetterAuthSubscriptionEvent({} as never, lifecycleEvent, {} as never),
    /missing; retrying/,
  )
})

test('past-due projection keeps billing history but projects free entitlements', async () => {
  capturedBatches = []
  await projectOrganizationSubscription({} as never, {
    organizationId: 'org-1',
    customerId: 'cus-1',
    subscriptionId: 'sub-1',
    plan: 'growth',
    status: 'unpaid',
    periodEnd: new Date('2026-07-01T00:00:00.000Z'),
  })
  const queries = capturedBatches.flat()
  const planEntitlement = queries.find(query => query.query.includes('organization_entitlements') && query.params?.includes('plan'))
  const sitePlanUpdate = queries.find(query => query.query.includes('UPDATE sites SET plan'))
  assert.ok(planEntitlement?.params?.includes('free'))
  assert.ok(sitePlanUpdate?.params?.includes('free'))
  const billingHistory = queries.find(query => query.query.includes('organization_billing'))
  assert.ok(billingHistory?.params?.includes('growth'))
})

test('AI quota grants update the balance and mark the grant applied atomically', async () => {
  capturedBatches = []
  await grantQuota({} as never, {
    organizationId: 'org-1',
    resource: 'ai_inference',
    quantity: 2000,
    unit: 'credit',
    periodKey: 'subscription-period-1',
    periodStart: '2026-08-01T00:00:00.000Z',
    grantType: 'plan',
    reason: 'renewal',
    idempotencyKey: 'subscription-period-1',
  })
  const queries = capturedBatches.flat().map(query => query.query)
  assert.ok(queries.some(query => query.includes('UPDATE ai_credits')))
  assert.ok(queries.some(query => query.includes('UPDATE usage_quota_grants SET applied_at')))
})

test('invoice.paid grants the period even when Better Auth subscription.created has not arrived', async () => {
  capturedBatches = []
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-before-created',
        status: 'active',
        customer: 'cus-1',
        metadata: { referenceId: 'org-1' },
        items: {
          data: [{
            price: { id: 'price_growth_month' },
            current_period_start: 1_754_035_200,
            current_period_end: 1_756_627_200,
          }],
        },
      }),
    },
    products: {
      list: async () => ({
        data: [{ id: 'prod-growth', metadata: { plan_id: 'growth' } }],
        has_more: false,
      }),
    },
    prices: {
      list: async () => ({
        data: [{
          id: 'price_growth_month',
          product: 'prod-growth',
          type: 'recurring',
          unit_amount: 4900,
          currency: 'usd',
          recurring: { interval: 'month', interval_count: 1 },
        }],
        has_more: false,
      }),
    },
  }
  const paidEvent = {
    id: 'evt_invoice_paid',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_invoice_paid',
        billing_reason: 'subscription_create',
        subscription: 'sub-before-created',
      },
    },
  } as never

  await grantInvoiceQuota({} as never, stripe as never, paidEvent)
  const queries = capturedBatches.flat()
  assert.ok(queries.some(query => query.query.includes('UPDATE ai_credits')))
  const grant = queries.find(query => query.query.includes('INSERT OR IGNORE INTO usage_quota_grants'))
  assert.ok(grant?.params?.some(value => String(value).includes('sub-before-created')))
})

test('only subscription creation and cycle invoices grant plan quota', async () => {
  capturedBatches = []
  const ignoredEvent = {
    id: 'evt_invoice_manual',
    type: 'invoice.paid',
    data: { object: { id: 'in_manual', billing_reason: 'manual', subscription: 'sub-1' } },
  } as never
  await grantInvoiceQuota({} as never, { subscriptions: { retrieve: async () => { throw new Error('must not retrieve') } } } as never, ignoredEvent)
  assert.equal(capturedBatches.length, 0)

  const legacyEvent = {
    id: 'evt_invoice_legacy',
    type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_legacy', subscription: 'sub-1' } },
  } as never
  await grantInvoiceQuota({} as never, { subscriptions: { retrieve: async () => { throw new Error('must not retrieve') } } } as never, legacyEvent)
  assert.equal(capturedBatches.length, 0)
})
