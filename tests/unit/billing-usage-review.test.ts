import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import {
  getEffectiveAccessPlan,
  PAST_DUE_GRACE_PERIOD_MS,
} from '../../server/utils/billing-access.ts'

test('effective access is derived from subscription status', () => {
  const now = new Date('2026-08-05T00:00:00.000Z')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'active', paymentStatus: 'paid' }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'active', paymentStatus: 'paid', paidThrough: new Date('2026-08-06T00:00:00.000Z') }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'active', paymentStatus: 'paid', paidThrough: new Date('2026-08-04T23:59:59.000Z') }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'active', paymentStatus: 'processing' }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'trialing', paymentStatus: null }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'past_due', paymentStatus: 'failed', paidThrough: new Date(now.getTime() - PAST_DUE_GRACE_PERIOD_MS + 1) }, now), 'growth')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'past_due', paymentStatus: null, pastDueSince: new Date(now.getTime() - PAST_DUE_GRACE_PERIOD_MS - 1) }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'unpaid', paymentStatus: null }, now), 'free')
  assert.equal(getEffectiveAccessPlan({ plan: 'growth', status: 'canceled', paymentStatus: null }, now), 'free')
})

let eventState: {
  status: string
  leaseExpiresAt: string | null
  claimToken: string | null
  attempts: number
} | null = null
let mockPaymentRow: {
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  last_paid_invoice_id: string | null
} | null = null
let capturedBatches: Array<Array<{ query: string; params?: unknown[] }>> = []
let mockSites = [{ id: 'site-1' }]

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async () => mockSites,
    queryFirst: async (_db: unknown, query: string) => {
      if (query.includes('SELECT payment_status, paid_through, past_due_since, last_paid_invoice_id')) return mockPaymentRow
      if (query.includes('FROM subscription')) return null
      if (query.includes('FROM organization')) return { id: 'org-1' }
      if (query.includes('SELECT attempt_count')) return eventState ? { attempt_count: eventState.attempts } : null
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
          leaseExpiresAt: null,
          claimToken: null,
          attempts: 0,
        }
        return { meta: { changes: 1 } }
      }
      if (query.includes("WHERE stripe_event_id = ? AND status IN ('failed', 'dead_letter')")) {
        if (!eventState || !['failed', 'dead_letter'].includes(eventState.status)) return { meta: { changes: 0 } }
        eventState = { ...eventState, status: 'pending', attempts: 0, leaseExpiresAt: null, claimToken: null }
        return { meta: { changes: 1 } }
      }
      if (query.includes('UPDATE stripe_webhook_events') && query.includes("SET status = 'pending'") && query.includes("status = 'processed'")) {
        if (!eventState || eventState.status !== 'processed') return { meta: { changes: 0 } }
        eventState = { ...eventState, status: 'pending', claimToken: null, leaseExpiresAt: null, attempts: 0 }
        return { meta: { changes: 1 } }
      }
      if (query.includes('claim_token = ?') && query.includes("SET status = 'pending'")) {
        if (!eventState) return { meta: { changes: 0 } }
        eventState = {
          status: 'pending',
          leaseExpiresAt: String(params[1]),
          claimToken: String(params[2]),
          attempts: eventState.attempts + 1,
        }
        return { meta: { changes: 1 } }
      }
      if (query.includes("SET status = 'processed'")) {
        if (!eventState || eventState.claimToken !== String(params[1])) return { meta: { changes: 0 } }
        eventState = { ...eventState, status: 'processed', leaseExpiresAt: null, claimToken: null }
        return { meta: { changes: 1 } }
      }
      if (query.includes("SET status = CASE")) {
        if (!eventState || eventState.claimToken !== String(params[params.length - 1])) return { meta: { changes: 0 } }
        eventState = { ...eventState, status: 'failed', leaseExpiresAt: null, claimToken: null }
        return { meta: { changes: 1 } }
      }
      if (query.includes('SELECT attempt_count FROM stripe_webhook_events')) {
        return eventState ? { attempt_count: eventState.attempts } : null
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
  enqueueStripeEvent,
  grantInvoiceQuota,
  markOrganizationPayment,
  selectCanonicalStripePrice,
  createStripePlanLoader,
  getBetterAuthStripePlans,
} = await import('../../server/utils/better-auth-stripe.ts')
const { grantQuota, resetOrganizationQuota } = await import('../../server/utils/usage-metering.ts')

function planLoader(plan: string, priceId: string) {
  return async () => [{ name: plan, priceId, limits: {}, group: 'krabiclaw' }] as never
}

const missingSubscriptionAdapter = {
  findOne: async <T>(input: { model: string }) => input.model === 'organization' ? { id: 'org-1' } as T : null,
  update: async () => { throw new Error('update should not run') },
  create: async (input: { data: Record<string, unknown> }) => ({ id: 'ba-sub-created', ...input.data }),
}

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
  assert.equal(eventState?.attempts, 1)
})

test('an expired pending webhook lease is reclaimed after a process interruption', async () => {
  eventState = {
    status: 'pending',
    leaseExpiresAt: '2020-01-01T00:00:00.000Z',
    claimToken: 'expired-worker',
    attempts: 1,
  }
  let ran = false
  assert.equal(await recordStripeEvent({} as never, event, async () => { ran = true }), true)
  assert.equal(ran, true)
  assert.equal(eventState?.status, 'processed')
  assert.equal(eventState?.attempts, 2)
})

test('a stale worker cannot finalize a reclaimed webhook lease', async () => {
  eventState = null
  await assert.rejects(
    () => recordStripeEvent({} as never, event, async () => {
      eventState = {
        status: 'pending',
        leaseExpiresAt: null,
        claimToken: 'new-worker',
        attempts: 2,
      }
    }),
    /Lost Stripe webhook lease/,
  )
  assert.equal(eventState?.claimToken, 'new-worker')
  assert.equal(eventState?.status, 'pending')
})

test('a processed duplicate remains terminal and is not requeued', async () => {
  eventState = { status: 'processed', leaseExpiresAt: null, claimToken: null, attempts: 1 }
  assert.equal(await enqueueStripeEvent({} as never, event), false)
  assert.equal(eventState?.status, 'processed')
  assert.equal(eventState?.attempts, 1)
})

test('a new delivery requeues a dead-lettered Stripe event with a fresh attempt window', async () => {
  eventState = { status: 'dead_letter', leaseExpiresAt: null, claimToken: null, attempts: 5 }
  assert.equal(await enqueueStripeEvent({} as never, event), true)
  assert.equal(eventState?.status, 'pending')
  assert.equal(eventState?.attempts, 0)
})

test('a new delivery requeues a failed Stripe event with a fresh attempt window', async () => {
  eventState = { status: 'failed', leaseExpiresAt: null, claimToken: null, attempts: 1 }
  assert.equal(await enqueueStripeEvent({} as never, event), true)
  assert.equal(eventState?.status, 'pending')
  assert.equal(eventState?.attempts, 0)
})

test('Stripe plan loading coalesces refreshes and serves the last good snapshot', async () => {
  let productCalls = 0
  let priceCalls = 0
  let failRefresh = false
  const stripe = {
    products: {
      list: async () => {
        productCalls += 1
        if (failRefresh) throw new Error('catalog unavailable')
        return { data: [{ id: 'prod-growth', metadata: { plan_id: 'growth' } }], has_more: false }
      },
    },
    prices: {
      list: async () => {
        priceCalls += 1
        return { data: [{ id: 'price-growth', product: 'prod-growth', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }], has_more: false }
      },
    },
  }
  const loadPlans = createStripePlanLoader(stripe as never, undefined, 0)
  const [first, second] = await Promise.all([loadPlans(), loadPlans()])
  assert.deepEqual(first, second)
  assert.equal(productCalls, 1)
  assert.equal(priceCalls, 1)

  failRefresh = true
  const stale = await loadPlans()
  assert.equal(stale[0]?.name, 'growth')
  assert.equal(productCalls, 2)
})

test('separate Stripe plan loaders share the isolate catalog snapshot', async () => {
  let productCalls = 0
  let priceCalls = 0
  const stripe = {
    products: {
      list: async () => {
        productCalls += 1
        return { data: [{ id: 'prod-shared', metadata: { plan_id: 'growth' } }], has_more: false }
      },
    },
    prices: {
      list: async () => {
        priceCalls += 1
        return { data: [{ id: 'price-shared', product: 'prod-shared', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }], has_more: false }
      },
    },
  }
  const firstLoader = createStripePlanLoader(stripe as never, { STRIPE_SECRET_KEY: 'sk_test_shared' }, 60_000, 'review-shared-cache')
  const secondLoader = createStripePlanLoader(stripe as never, { STRIPE_SECRET_KEY: 'sk_test_shared' }, 60_000, 'review-shared-cache')
  await Promise.all([firstLoader(), secondLoader()])
  assert.equal(productCalls, 1)
  assert.equal(priceCalls, 1)
})

test('subscription projection failures remain retryable when Better Auth did not persist the row', async () => {
  const lifecycleEvent = {
    id: 'evt_missing_ba_subscription',
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_missing_ba_subscription' } },
  } as never

  await assert.rejects(
    () => reconcileBetterAuthSubscriptionEvent({} as never, lifecycleEvent, {
      subscriptions: {
        retrieve: async () => ({ id: 'sub_missing_ba_subscription', customer: 'cus-1', items: { data: [] } }),
      },
    } as never, missingSubscriptionAdapter, planLoader('growth', 'price-growth')),
    /no recurring price; retrying/,
  )
})

test('subscription reconciliation uses current Stripe state after an older event arrives', async () => {
  let updatedPlan = ''
  const adapter = {
    findOne: async () => ({
      id: 'ba-sub-1',
      referenceId: 'org-1',
      plan: 'growth',
      stripeCustomerId: 'cus-1',
      stripeSubscriptionId: 'sub-current',
      status: 'active',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    }),
    update: async (input: { update: { plan: string } }) => {
      updatedPlan = input.update.plan
      return { id: 'ba-sub-1', ...input.update, referenceId: 'org-1', stripeSubscriptionId: 'sub-current' }
    },
    create: async () => { throw new Error('create should not run') },
  }
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-current',
        status: 'active',
        customer: 'cus-1',
        cancel_at_period_end: false,
        items: { data: [{ quantity: 1, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200, price: { id: 'price-managed' } }] },
      }),
    },
    products: { list: async () => ({ data: [{ id: 'prod-managed', metadata: { plan_id: 'managed' } }], has_more: false }) },
    prices: { list: async () => ({ data: [{ id: 'price-managed', product: 'prod-managed', type: 'recurring', unit_amount: 14900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }], has_more: false }) },
  }
  await reconcileBetterAuthSubscriptionEvent({} as never, {
    id: 'evt_older_update',
    created: 100,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub-current', items: { data: [{ price: { id: 'price-growth-old' } }] }, status: 'active' } },
  } as never, stripe as never, adapter as never, planLoader('managed', 'price-managed'))
  assert.equal(updatedPlan, 'managed')
})

test('subscription reconciliation repairs a missing Better Auth row from current Stripe state', async () => {
  let createdPlan = ''
  const adapter = {
    findOne: async <T>(input: { model: string }) => input.model === 'organization'
      ? { id: 'org-1' } as T
      : null,
    update: async () => { throw new Error('update should not run') },
    create: async (input: { data: { plan: string } }) => {
      createdPlan = input.data.plan
      return { id: 'ba-sub-created', ...input.data }
    },
  }
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-repair',
        status: 'active',
        customer: 'cus-1',
        metadata: {},
        items: { data: [{ quantity: 1, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200, price: { id: 'price-growth' } }] },
      }),
    },
    products: { list: async () => ({ data: [{ id: 'prod-growth', metadata: { plan_id: 'growth' } }], has_more: false }) },
    prices: { list: async () => ({ data: [{ id: 'price-growth', product: 'prod-growth', type: 'recurring', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }], has_more: false }) },
  }
  await reconcileBetterAuthSubscriptionEvent({} as never, {
    id: 'evt_repair',
    created: 200,
    type: 'customer.subscription.created',
    data: { object: { id: 'sub-repair' } },
  } as never, stripe as never, adapter as never, planLoader('growth', 'price-growth'))
  assert.equal(createdPlan, 'growth')
})

test('subscription reconciliation updates Better Auth metadata row and resolves the base item after seats', async () => {
  let created = false
  let updated: Record<string, unknown> | null = null
  const lookups: string[] = []
  const adapter = {
    findOne: async <T>(input: { model: string; where?: Array<{ field: string; value: unknown }> }) => {
      const field = input.where?.[0]?.field
      if (field) lookups.push(field)
      if (input.model === 'subscription' && field === 'id') {
        return {
          id: 'ba-precreated',
          referenceId: 'org-1',
          plan: 'growth',
          stripeCustomerId: 'cus-1',
          stripeSubscriptionId: null,
          status: 'incomplete',
          periodStart: null,
          periodEnd: null,
          cancelAtPeriodEnd: false,
        } as T
      }
      return null
    },
    update: async (input: { update: Record<string, unknown> }) => {
      updated = input.update
      return { id: 'ba-precreated', ...input.update, referenceId: 'org-1' }
    },
    create: async () => {
      created = true
      throw new Error('create should not run for Better Auth checkout subscriptions')
    },
  }
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-precreated',
        status: 'trialing',
        customer: 'cus-1',
        metadata: { subscriptionId: 'ba-precreated', referenceId: 'org-1' },
        trial_start: 1_754_035_200,
        trial_end: 1_756_627_200,
        cancel_at_period_end: false,
        items: {
          data: [
            { quantity: 4, price: { id: 'price-seat', product: 'prod-seat', recurring: { interval: 'month' } }, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200 },
            { quantity: 1, price: { id: 'price-growth', product: 'prod-growth', recurring: { interval: 'month' } }, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200 },
          ],
        },
      }),
    },
    products: {
      list: async () => ({ data: [], has_more: false }),
      retrieve: async (id: string) => ({ id, metadata: {} }),
    },
    prices: { list: async () => ({ data: [], has_more: false }) },
  }
  await reconcileBetterAuthSubscriptionEvent({} as never, {
    id: 'evt_precreated',
    created: 300,
    type: 'customer.subscription.created',
    data: { object: { id: 'sub-precreated' } },
  } as never, stripe as never, adapter as never, async () => [{
    name: 'growth',
    priceId: 'price-growth',
    seatPriceId: 'price-seat',
    limits: { ai_credits: 2000 },
    group: 'krabiclaw',
  }] as never)
  assert.equal(created, false)
  assert.equal(lookups[0], 'id')
  assert.equal(lookups.includes('stripeSubscriptionId'), false)
  assert.equal(updated?.plan, 'growth')
  assert.equal(updated?.seats, 4)
  assert.equal(updated?.billingInterval, 'month')
  assert.equal(updated?.status, 'trialing')
  assert.equal(updated?.trialStart instanceof Date, true)
  assert.equal(updated?.trialEnd instanceof Date, true)
  assert.equal(updated?.limits, JSON.stringify({ ai_credits: 2000 }))
})

test('subscription reconciliation resolves an archived recurring price from product metadata', async () => {
  let createdPlan = ''
  let createdSeats = 0
  const adapter = {
    findOne: async <T>(input: { model: string }) => input.model === 'organization' ? { id: 'org-1' } as T : null,
    update: async () => { throw new Error('update should not run') },
    create: async (input: { data: { plan: string; seats: number } }) => {
      createdPlan = input.data.plan
      createdSeats = input.data.seats
      return { id: 'ba-archived', ...input.data }
    },
  }
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-archived',
        status: 'active',
        customer: 'cus-1',
        metadata: { referenceId: 'org-1' },
        items: { data: [{ id: 'si-archived-seat', quantity: 4, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200, price: { id: 'price-seat-archived', product: 'prod-growth-archived', recurring: { interval: 'month' }, metadata: { price_role: 'seat' } } }, { id: 'si-archived-base', quantity: 1, current_period_start: 1_754_035_200, current_period_end: 1_756_627_200, price: { id: 'price-growth-archived', product: 'prod-growth-archived', recurring: { interval: 'month' }, metadata: { price_role: 'base' } } }] },
      }),
    },
    products: {
      list: async () => ({ data: [], has_more: false }),
      retrieve: async () => ({ id: 'prod-growth-archived', metadata: { plan_id: 'growth', seat_price_id: 'price-seat-archived' } }),
    },
    prices: {
      list: async () => ({ data: [], has_more: false }),
      retrieve: async (id: string) => id === 'price-seat-archived'
        ? ({ id, product: 'prod-growth-archived', metadata: { price_role: 'seat' }, recurring: { interval: 'month' } })
        : ({ id, product: 'prod-growth-archived', metadata: { price_role: 'base' }, recurring: { interval: 'month' } }),
    },
  }
  await reconcileBetterAuthSubscriptionEvent({} as never, {
    id: 'evt_archived',
    created: 301,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub-archived' } },
  } as never, stripe as never, adapter as never, planLoader('growth', 'price-current'))
  assert.equal(createdPlan, 'growth')
  assert.equal(createdSeats, 4)
})

test('past-due projection keeps billing history but projects free entitlements', async () => {
  capturedBatches = []
  mockPaymentRow = null
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

test('subscription projection never overwrites payment markers', async () => {
  capturedBatches = []
  mockPaymentRow = {
    payment_status: 'paid',
    paid_through: '2026-09-01T00:00:00.000Z',
    past_due_since: null,
    last_paid_invoice_id: 'in_first_paid',
  }
  await projectOrganizationSubscription({} as never, {
    organizationId: 'org-1',
    customerId: 'cus-1',
    subscriptionId: 'sub-1',
    plan: 'growth',
    status: 'active',
    paymentStatus: 'paid',
  })
  const siteBilling = capturedBatches[1]?.find(query => query.query.includes('INSERT INTO site_billing'))
  assert.ok(siteBilling)
  assert.doesNotMatch(siteBilling?.query ?? '', /payment_status|paid_through|last_paid_invoice_id/)

  capturedBatches = []
  await markOrganizationPayment({} as never, {
    organizationId: 'org-1',
    customerId: 'cus-1',
    subscriptionId: 'sub-1',
    paymentStatus: 'paid',
    eventCreated: 100,
    eventId: 'evt_first_paid',
    paidThrough: '2026-09-01T00:00:00.000Z',
    invoiceId: 'in_first_paid',
  })
  const paymentQueries = capturedBatches.flat()
  assert.ok(paymentQueries.some(query => query.query.includes('INSERT OR IGNORE INTO site_billing')))
  mockPaymentRow = null
})

test('entitlement replacement stays atomic per site when an organization has many sites', async () => {
  capturedBatches = []
  mockSites = Array.from({ length: 51 }, (_, index) => ({ id: `site-${index + 1}` }))
  await projectOrganizationSubscription({} as never, {
    organizationId: 'org-1',
    customerId: 'cus-1',
    subscriptionId: 'sub-1',
    plan: 'growth',
    status: 'active',
    paymentStatus: 'paid',
  })
  assert.equal(capturedBatches.length, 52)
  for (const batch of capturedBatches.slice(1)) {
    const queries = batch.map(statement => statement.query)
    assert.ok(queries.some(query => query.includes('INSERT INTO site_entitlements')))
    assert.ok(queries.some(query => query.includes('DELETE FROM site_entitlements')))
    assert.ok(queries.some(query => query.includes('UPDATE sites SET plan')))
    const siteBilling = batch.find(statement => statement.query.includes('INSERT INTO site_billing'))
    assert.equal(siteBilling?.params?.[3], null)
  }
  mockSites = [{ id: 'site-1' }]
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
            id: 'si-seat',
            price: { id: 'price_seat' },
            quantity: 3,
            current_period_start: 1_785_542_400,
            current_period_end: 1_788_220_800,
          }, {
            id: 'si-add-on',
            price: { id: 'price_add_on' },
            current_period_start: 1_785_542_400,
            current_period_end: 1_788_220_800,
          }, {
            id: 'si-invoice-paid',
            price: { id: 'price_growth_month' },
            current_period_start: 1_785_542_400,
            current_period_end: 1_788_220_800,
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
        lines: {
          data: [{
            id: 'il_invoice_paid',
            type: 'subscription',
            subscription: 'sub-before-created',
            parent: {
              type: 'subscription_item_details',
              subscription_item_details: {
                subscription: 'sub-before-created',
                subscription_item: 'si-invoice-paid',
                proration: false,
              },
            },
            proration: false,
            price: {
              id: 'price_growth_month',
              recurring: { interval: 'month' },
            },
            period: { start: 1_785_542_400, end: 1_788_220_800 },
          }, {
            id: 'il_seat',
            type: 'subscription',
            subscription: 'sub-before-created',
            parent: {
              type: 'subscription_item_details',
              subscription_item_details: {
                subscription: 'sub-before-created',
                subscription_item: 'si-seat',
                proration: false,
              },
            },
            price: { id: 'price_seat', recurring: { interval: 'month' } },
            period: { start: 1_785_542_400, end: 1_788_220_800 },
          }, {
            id: 'il_add_on',
            type: 'subscription',
            subscription: 'sub-before-created',
            parent: {
              type: 'subscription_item_details',
              subscription_item_details: {
                subscription: 'sub-before-created',
                subscription_item: 'si-add-on',
                proration: false,
              },
            },
            price: { id: 'price_add_on', recurring: { interval: 'month' } },
            period: { start: 1_785_542_400, end: 1_788_220_800 },
          }],
          has_more: false,
        },
      },
    },
  } as never

  await grantInvoiceQuota({} as never, stripe as never, paidEvent, missingSubscriptionAdapter, async () => [{
    name: 'growth',
    priceId: 'price_growth_month',
    seatPriceId: 'price_seat',
    limits: {},
    group: 'krabiclaw',
  }] as never)
  const queries = capturedBatches.flat()
  assert.ok(queries.some(query => query.query.includes('UPDATE ai_credits')))
  const grant = queries.find(query => query.query.includes('INSERT OR IGNORE INTO usage_quota_grants'))
  assert.ok(grant?.params?.some(value => String(value).includes('sub-before-created')))
  assert.ok(grant?.params?.some(value => String(value).includes('price_growth_month')))
  assert.ok(!grant?.params?.some(value => String(value).includes('price_seat')))
  assert.ok(!grant?.params?.some(value => String(value).includes('price_add_on')))
})

test('delayed invoice allocation uses the invoice line price and period across pagination', async () => {
  capturedBatches = []
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub-delayed',
        status: 'active',
        customer: 'cus-1',
        items: { data: [{ id: 'si-delayed', price: { id: 'price-growth-current' }, current_period_start: 1_756_627_200, current_period_end: 1_759_219_200 }] },
      }),
    },
    invoices: {
      listLineItems: (() => {
        let page = 0
        return async () => {
          page += 1
          if (page === 1) return {
            data: [{ id: 'il-page-one', parent: { type: 'invoice_item_details', invoice_item_details: { subscription: 'sub-delayed', proration: false } }, period: { start: 1_754_035_200, end: 1_756_627_200 } }],
            has_more: true,
          }
          return {
            data: [{
              id: 'il-growth-old',
              parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub-delayed', subscription_item: 'si-delayed', proration: false } },
              pricing: { type: 'price_details', price_details: { price: { id: 'price-growth-old', product: 'prod-growth', recurring: { interval: 'month' }, metadata: { price_role: 'base' } } } },
              period: { start: 1_785_542_400, end: 1_788_220_800 },
            }],
            has_more: false,
          }
        }
      })(),
    },
    products: {
      list: async () => ({
      data: [{ id: 'prod-growth', metadata: { plan_id: 'growth', monthly_price_id: 'price-growth-current' } }],
      has_more: false,
      }),
      retrieve: async () => ({ id: 'prod-growth', metadata: { plan_id: 'growth' } }),
    },
    prices: {
      list: async () => ({
        data: [
          { id: 'price-growth-old', product: 'prod-growth', type: 'recurring', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, metadata: { price_role: 'base' } },
          { id: 'price-growth-current', product: 'prod-growth', type: 'recurring', unit_amount: 5900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
        ],
        has_more: false,
      }),
    },
  }
  const paidEvent = {
    id: 'evt_invoice_delayed',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_invoice_delayed',
        billing_reason: 'subscription_cycle',
        subscription: 'sub-delayed',
        lines: {
          data: [{ id: 'il-not-plan', type: 'invoiceitem', subscription: 'sub-delayed', proration: false, price: null }],
          has_more: true,
        },
      },
    },
  } as never

  await grantInvoiceQuota({} as never, stripe as never, paidEvent, missingSubscriptionAdapter, planLoader('growth', 'price-growth-current'))
  const grant = capturedBatches.flat().find(query => query.query.includes('INSERT OR IGNORE INTO usage_quota_grants'))
  assert.ok(grant?.params?.includes(2000))
  assert.ok(grant?.params?.includes('2026-08-01T00:00:00.000Z'))
})

test('only subscription creation and cycle invoices grant plan quota', async () => {
  capturedBatches = []
  const ignoredEvent = {
    id: 'evt_invoice_manual',
    type: 'invoice.paid',
    data: { object: { id: 'in_manual', billing_reason: 'manual', subscription: 'sub-1' } },
  } as never
  await grantInvoiceQuota({} as never, { subscriptions: { retrieve: async () => { throw new Error('must not retrieve') } } } as never, ignoredEvent, missingSubscriptionAdapter, planLoader('growth', 'price-growth'))
  assert.equal(capturedBatches.length, 0)

  const legacyEvent = {
    id: 'evt_invoice_legacy',
    type: 'invoice.payment_succeeded',
    data: { object: { id: 'in_legacy', subscription: 'sub-1' } },
  } as never
  await grantInvoiceQuota({} as never, { subscriptions: { retrieve: async () => { throw new Error('must not retrieve') } } } as never, legacyEvent, missingSubscriptionAdapter, planLoader('growth', 'price-growth'))
  assert.equal(capturedBatches.length, 0)
})

test('ai_inference grants reject non-credit units before writing audit rows', async () => {
  capturedBatches = []
  await assert.rejects(
    () => grantQuota({} as never, {
      organizationId: 'org-1',
      resource: 'ai_inference',
      quantity: 10,
      unit: 'request',
      periodKey: 'bad-unit',
      periodStart: '2026-08-01T00:00:00.000Z',
      grantType: 'manual',
      reason: 'invalid test',
      idempotencyKey: 'bad-unit',
    }),
    /require unit "credit"/,
  )
  await assert.rejects(
    () => resetOrganizationQuota({} as never, {
      organizationId: 'org-1',
      resetId: 'bad-reset',
      reason: 'invalid reset test',
      grants: [{
        resource: 'ai_inference',
        quantity: 10,
        unit: 'request',
        periodStart: '2026-08-01T00:00:00.000Z',
      }],
    }),
    /require unit "credit"/,
  )
  assert.equal(capturedBatches.length, 0)
})

test('canonical metadata and lookup keys select among rotated active prices', () => {
  const selectedByMetadata = selectCanonicalStripePrice(
    { id: 'prod-growth', metadata: { monthly_price_id: 'price-2' } } as never,
    [
      { id: 'price-1', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 4900, currency: 'usd' },
      { id: 'price-2', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 5900, currency: 'usd' },
    ] as never,
    'month',
  )
  assert.equal(selectedByMetadata?.id, 'price-2')

  const selectedByLookupKey = selectCanonicalStripePrice(
    { id: 'prod-growth', metadata: {} } as never,
    [
      { id: 'price-1', lookup_key: 'growth-legacy', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 4900, currency: 'usd' },
      { id: 'price-2', lookup_key: 'growth-monthly', recurring: { interval: 'month', interval_count: 1 }, unit_amount: 5900, currency: 'usd' },
    ] as never,
    'month',
  )
  assert.equal(selectedByLookupKey?.id, 'price-2')
})

test('Better Auth plan loader omits app-only free and feature-disabled plans', async () => {
  const stripe = {
    products: { list: async () => ({
      data: [
        { id: 'prod-free', metadata: { plan_id: 'free' } },
        { id: 'prod-growth', metadata: { plan_id: 'growth' } },
        { id: 'prod-managed', metadata: { plan_id: 'managed' } },
      ],
      has_more: false,
    }) },
    prices: { list: async () => ({
      data: [
        { id: 'price-growth', product: 'prod-growth', lookup_key: 'growth-monthly', type: 'recurring', unit_amount: 4900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
        { id: 'price-managed', product: 'prod-managed', type: 'recurring', unit_amount: 14900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
      ],
      has_more: false,
    }) },
  }
  const plans = await getBetterAuthStripePlans(stripe as never, {})
  assert.deepEqual(plans.map(plan => plan.name), ['growth'])
  assert.equal(plans[0]?.lookupKey, 'growth-monthly')
})
