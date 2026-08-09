import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test, { mock } from 'node:test'
import type Stripe from 'stripe'
import { getPlanEntitlements } from '../../server/utils/billing-entitlements.ts'

const queryCalls: string[] = []
const queryParameterCounts: Array<{ query: string; count: number }> = []
let projectionRow: Record<string, unknown> | null = null
let siteRows: Array<Record<string, unknown>> = []
let siteBillingRows: Array<Record<string, unknown>> = []
let siteEntitlementRows: Array<Record<string, unknown>> = []
let organizationEntitlementRows: Array<Record<string, unknown>> = []
let invoiceRows: Array<Record<string, unknown>> = []
let versionRows: Array<Record<string, unknown>> = []
let webhookRows: Array<Record<string, unknown>> = []

async function queryFirst<T>(_db: unknown, query: string, _params: unknown[] = []): Promise<T | null> {
  queryCalls.push(query)
  queryParameterCounts.push({ query, count: _params.length })
  if (query.includes('FROM organization_billing')) return projectionRow as T | null
  return null
}

async function queryAll<T>(_db: unknown, query: string, _params: unknown[] = []): Promise<T[]> {
  queryCalls.push(query)
  queryParameterCounts.push({ query, count: _params.length })
  if (query.includes('FROM stripe_invoice_payments')) return invoiceRows as T[]
  if (query.includes('FROM stripe_subscription_versions')) return versionRows as T[]
  if (query.includes('FROM stripe_webhook_events')) return webhookRows as T[]
  if (query.includes('FROM organization_entitlements')) return organizationEntitlementRows as T[]
  if (query.includes('FROM site_billing')) return siteBillingRows as T[]
  if (query.includes('FROM site_entitlements')) return siteEntitlementRows as T[]
  if (query.includes('FROM sites')) return siteRows as T[]
  return []
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst,
    queryAll,
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => [],
  },
})

const {
  assertOrganizationSubscriptionReconciliationOperatorSession,
  assertStripeProviderMode,
  parseOrganizationSubscriptionReconciliationRequest,
  reconcileOrganizationSubscription,
  OrganizationSubscriptionReconciliationError,
} = await import('../../server/utils/organization-subscription-reconciliation.ts')

const utilitySource = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'server', 'utils', 'organization-subscription-reconciliation.ts'),
  'utf8',
)
const routeSource = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'server', 'api', 'admin', 'billing', 'organization-subscription-reconciliation.post.ts'),
  'utf8',
)

const NOW = new Date('2026-08-10T12:00:00.000Z')
const PERIOD_START = '2026-08-01T00:00:00.000Z'
const PERIOD_END = '2026-09-01T00:00:00.000Z'
const REQUEST = {
  organizationId: 'org-reconcile',
  providerMode: 'test' as const,
  expectedStripeAccountId: 'acct_test',
}

function resetRows() {
  queryCalls.length = 0
  queryParameterCounts.length = 0
  projectionRow = {
    organization_id: REQUEST.organizationId,
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    plan: 'growth',
    status: 'active',
    payment_status: 'paid',
    paid_through: PERIOD_END,
    past_due_since: null,
    current_period_end: PERIOD_END,
    cancel_at_period_end: 0,
    updated_at: NOW.toISOString(),
  }
  siteRows = []
  siteBillingRows = []
  siteEntitlementRows = []
  organizationEntitlementRows = Object.entries(getPlanEntitlements('growth')).map(([key, value]) => ({
    key,
    value: String(value),
    source: 'better-auth-stripe',
  }))
  invoiceRows = []
  versionRows = []
  webhookRows = []
}

function provider(overrides: {
  customer?: Partial<Stripe.Customer>
  subscription?: Partial<Stripe.Subscription>
  subscriptions?: Stripe.Subscription[]
} = {}) {
  const subscription = {
    id: 'sub_test',
    customer: 'cus_test',
    status: 'active',
    cancel_at_period_end: false,
    latest_invoice: null,
    metadata: {
      organizationId: REQUEST.organizationId,
      referenceId: REQUEST.organizationId,
      subscriptionId: 'ba-sub-test',
    },
    items: {
      data: [{
        id: 'si_test',
        quantity: 1,
        current_period_start: Math.floor(Date.parse(PERIOD_START) / 1000),
        current_period_end: Math.floor(Date.parse(PERIOD_END) / 1000),
        price: {
          id: 'price_growth',
          lookup_key: null,
          recurring: { interval: 'month' },
        },
      }],
    },
    ...overrides.subscription,
  } as unknown as Stripe.Subscription
  const customers = {
    retrieve: async (_id: string) => ({
      id: 'cus_test',
      deleted: false,
      metadata: {
        organizationId: REQUEST.organizationId,
        customerType: 'organization',
      },
      ...overrides.customer,
    }),
    search: async () => ({ data: [{
      id: 'cus_test',
      deleted: false,
      metadata: {
        organizationId: REQUEST.organizationId,
        customerType: 'organization',
      },
    }], has_more: false }),
  }
  const allSubscriptions = overrides.subscriptions ?? [subscription]
  return {
    accounts: {
      retrieve: async (_id: string | null) => ({ id: REQUEST.expectedStripeAccountId }),
    },
    customers,
    subscriptions: {
      list: async () => ({ data: allSubscriptions, has_more: false }),
      search: async () => ({ data: [], has_more: false, next_page: null }),
    },
  } as unknown as Stripe
}

function adapter(rows: Array<Record<string, unknown>> = [{
  id: 'ba-sub-test',
  referenceId: REQUEST.organizationId,
  plan: 'growth',
  status: 'active',
  stripeCustomerId: 'cus_test',
  stripeSubscriptionId: 'sub_test',
  periodStart: new Date(PERIOD_START),
  periodEnd: new Date(PERIOD_END),
  cancelAtPeriodEnd: false,
  billingInterval: 'month',
  seats: 1,
}]) {
  return { findMany: async () => rows }
}

const loadPlans = async () => [{
  name: 'growth',
  priceId: 'price_growth',
  limits: {},
  group: 'krabiclaw',
}] as unknown as StripePlan[]

async function report(overrides: Partial<Parameters<typeof reconcileOrganizationSubscription>[0]> = {}) {
  return await reconcileOrganizationSubscription({
    db: {} as never,
    stripe: provider(),
    adapter: adapter(),
    organization: { id: REQUEST.organizationId, stripeCustomerId: 'cus_test' },
    request: REQUEST,
    actor: 'operator-1',
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    workerVersionId: '01234567-89ab-cdef-0123-456789abcdef',
    providerModeVerified: true,
    now: NOW,
    loadPlans,
    ...overrides,
  })
}

test('request parser is exact and has no apply or discovery mode', () => {
  assert.deepEqual(parseOrganizationSubscriptionReconciliationRequest(REQUEST), REQUEST)
  for (const body of [
    { ...REQUEST, organizationId: ' org-reconcile' },
    { ...REQUEST, providerMode: 'preview' },
    { ...REQUEST, expectedStripeAccountId: 'acct_' },
    { ...REQUEST, apply: true },
  ]) {
    assert.throws(
      () => parseOrganizationSubscriptionReconciliationRequest(body),
      (error: unknown) => error instanceof OrganizationSubscriptionReconciliationError && error.code === 'invalid_request',
    )
  }
})

test('provider mode and direct operator boundaries fail closed', () => {
  assert.doesNotThrow(() => assertStripeProviderMode('sk_test_123', 'test'))
  assert.doesNotThrow(() => assertStripeProviderMode('rk_live_123', 'live'))
  assert.throws(
    () => assertStripeProviderMode('sk_live_123', 'test'),
    (error: unknown) => error instanceof OrganizationSubscriptionReconciliationError && error.code === 'provider_mode_mismatch',
  )
  assert.equal(assertOrganizationSubscriptionReconciliationOperatorSession({ user: { id: 'operator-1' }, session: {} }), 'operator-1')
  assert.throws(() => assertOrganizationSubscriptionReconciliationOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: 'admin-1' } }))
})

test('provenance shape and exact organization identity are blocking evidence', async () => {
  resetRows()
  const invalidProvenance = await report({ sourceSha: 'ABC', workerVersionId: 'worker' })
  assert.equal(invalidProvenance.status, 'blocked')
  assert.ok(invalidProvenance.drifts.some(drift => drift.code === 'deployment_provenance_invalid'))
  const wrongOrganization = await report({ organization: { id: 'org-other', stripeCustomerId: 'cus_test' } })
  assert.equal(wrongOrganization.status, 'blocked')
  assert.ok(wrongOrganization.drifts.some(drift => drift.code === 'organization_identity_mismatch'))
  assert.equal(wrongOrganization.request.organizationId, REQUEST.organizationId)
  assert.equal(wrongOrganization.betterAuth.organization.id, 'org-other')
})

test('invalid deployment provenance blocks before any Stripe provider call', async () => {
  resetRows()
  const stripe = provider()
  let providerCalls = 0
  ;(stripe.accounts as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    providerCalls += 1
    return { id: REQUEST.expectedStripeAccountId }
  }
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => {
    providerCalls += 1
    return { data: [], has_more: false }
  }
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    providerCalls += 1
    return { id: 'cus_test', deleted: false, metadata: {} }
  }
  ;(stripe.subscriptions as unknown as { search: () => Promise<unknown>; list: () => Promise<unknown> }).search = async () => {
    providerCalls += 1
    return { data: [], has_more: false, next_page: null }
  }
  ;(stripe.subscriptions as unknown as { list: () => Promise<unknown> }).list = async () => {
    providerCalls += 1
    return { data: [], has_more: false }
  }
  const result = await report({ stripe, sourceSha: 'ABC', workerVersionId: 'worker' })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'deployment_provenance_invalid'))
  assert.equal(providerCalls, 0)
})

test('clean match report includes canonical projection, evidence, and deterministic digest', async () => {
  resetRows()
  const first = await report()
  const second = await report({ actor: 'operator-2', now: new Date('2026-08-11T12:00:00.000Z') })
  assert.equal(first.status, 'match')
  assert.equal(first.provider.account.verified, true)
  assert.equal(first.provider.customer.id, 'cus_test')
  assert.equal(first.provider.subscriptions[0]?.canonicalPlan, 'growth')
  assert.equal(first.effectiveEntitlements.plan, 'growth')
  assert.equal(first.reportSha256, second.reportSha256)
  assert.equal(first.operator.actor, 'operator-1')
  assert.notEqual(first.capturedAt, second.capturedAt)
})

test('clean Starter state remains matchable without a provider customer', async () => {
  resetRows()
  projectionRow = null
  const stripe = provider()
  ;(stripe.customers as unknown as { search: () => Promise<unknown> }).search = async () => ({ data: [], has_more: false })
  const result = await report({
    stripe,
    organization: { id: REQUEST.organizationId },
    adapter: adapter([]),
  })
  assert.equal(result.status, 'match')
  assert.equal(result.provider.customer.id, null)
  assert.ok(!result.drifts.some(drift => drift.code === 'provider_customer_missing'))
})

test('metadata search stays exact-key-only and validates customer type after retrieval', async () => {
  resetRows()
  projectionRow = null
  const stripe = provider()
  const queries: string[] = []
  ;(stripe.customers as unknown as { search: (_params: { query: string }) => Promise<unknown> }).search = async ({ query }) => {
    queries.push(query)
    return { data: [], has_more: false }
  }
  const result = await report({ stripe, organization: { id: REQUEST.organizationId }, adapter: adapter([]) })
  assert.equal(result.status, 'match')
  assert.equal(queries.length, 2)
  assert.ok(queries.every(query => !query.includes('customerType')))
})

test('orphaned subscription metadata discovers a customer even when customer metadata is wrong', async () => {
  resetRows()
  projectionRow = null
  const stripe = provider({ subscription: { customer: 'cus_orphan' } })
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => ({ data: [], has_more: false })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => ({ id: 'cus_orphan', deleted: false, metadata: {} })
  ;(stripe.subscriptions as unknown as { search: () => Promise<unknown> }).search = async () => ({
    data: [{
      id: 'sub_test',
      customer: 'cus_orphan',
      metadata: { referenceId: REQUEST.organizationId },
    }],
    has_more: false,
    next_page: null,
  })
  const result = await report({ stripe, organization: { id: REQUEST.organizationId }, adapter: adapter([]) })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_metadata_conflict'))
})

test('duplicate provider customer metadata blocks before retrieval', async () => {
  resetRows()
  projectionRow = null
  const stripe = provider()
  let retrieveCalls = 0
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => ({
    data: [{ id: 'cus_a' }, { id: 'cus_b' }],
    has_more: false,
  })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    retrieveCalls += 1
    return { id: 'cus_a', deleted: false, metadata: {} }
  }
  const result = await report({ stripe, organization: { id: REQUEST.organizationId }, adapter: adapter([]) })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_ambiguous'))
  assert.equal(retrieveCalls, 0)
})

test('provider customer search page truncation blocks before adopting the visible id', async () => {
  resetRows()
  const stripe = provider()
  let retrieveCalls = 0
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => ({
    data: [{ id: 'cus_visible' }],
    has_more: true,
  })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    retrieveCalls += 1
    return { id: 'cus_visible', deleted: false, metadata: {} }
  }
  const result = await report({ stripe, organization: { id: REQUEST.organizationId }, adapter: adapter([]) })
  assert.equal(result.status, 'blocked')
  assert.equal(retrieveCalls, 0)
})

test('provider metadata search disagreement with local customer blocks before retrieval', async () => {
  resetRows()
  const stripe = provider()
  let retrieveCalls = 0
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => ({
    data: [{ id: 'cus_other' }],
    has_more: false,
  })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    retrieveCalls += 1
    return { id: 'cus_other', deleted: false, metadata: {} }
  }
  const result = await report({ stripe })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_local_search_disagreement'))
  assert.equal(retrieveCalls, 0)
})

test('malformed subscription metadata-search evidence blocks without a customer identity', async () => {
  resetRows()
  projectionRow = null
  const stripe = provider()
  ;(stripe.customers as unknown as { search: () => Promise<unknown> }).search = async () => ({ data: [], has_more: false })
  ;(stripe.subscriptions as unknown as { search: () => Promise<unknown> }).search = async () => ({
    data: [{ id: 'sub-malformed-search', customer: null, metadata: { referenceId: REQUEST.organizationId } }],
    has_more: false,
    next_page: null,
  })
  const result = await report({ stripe, organization: { id: REQUEST.organizationId }, adapter: adapter([]) })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_subscription_search_malformed'))
})

test('subscription metadata-search results must also appear in customer history', async () => {
  resetRows()
  const stripe = provider()
  ;(stripe.subscriptions as unknown as { search: () => Promise<unknown> }).search = async () => ({
    data: [{
      id: 'sub-orphan-search',
      customer: 'cus_test',
      metadata: { referenceId: REQUEST.organizationId },
    }],
    has_more: false,
    next_page: null,
  })
  ;(stripe.subscriptions as unknown as { list: () => Promise<unknown> }).list = async () => ({ data: [], has_more: false })
  const result = await report({ stripe })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_subscription_search_not_listed'))
})

function attachValidCatalog(stripe: Stripe, options: { productsHasMore?: boolean; pricesHasMore?: boolean } = {}) {
  ;(stripe as unknown as { products: { list: (_params: unknown) => Promise<unknown> } }).products = { list: async () => ({
    data: [{
      id: 'prod_growth',
      active: true,
      metadata: { plan_id: 'growth' },
    }],
    has_more: options.productsHasMore ?? false,
  }) }
  ;(stripe as unknown as { prices: { list: (_params: unknown) => Promise<unknown> } }).prices = { list: async () => ({
    data: [{
      id: 'price_growth',
      active: true,
      product: 'prod_growth',
      unit_amount: 4900,
      currency: 'usd',
      lookup_key: null,
      recurring: { interval: 'month', interval_count: 1 },
    }],
    has_more: options.pricesHasMore ?? false,
  }) }
}

test('catalog product pagination truncation blocks at the reconciliation bound', async () => {
  resetRows()
  const stripe = provider()
  let calls = 0
  ;(stripe as unknown as { products: { list: (_params: unknown) => Promise<unknown> } }).products = { list: async () => {
    calls += 1
    return {
      data: [{ id: `prod-${calls}`, active: true, metadata: { plan_id: 'growth' } }],
      has_more: true,
    }
  } }
  ;(stripe as unknown as { prices: { list: (_params: unknown) => Promise<unknown> } }).prices = { list: async () => ({ data: [], has_more: false }) }
  const result = await report({ stripe, loadPlans: undefined })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_catalog_unbounded'))
  assert.equal(calls, 10)
})

test('catalog price pagination truncation blocks at the reconciliation bound', async () => {
  resetRows()
  const stripe = provider()
  attachValidCatalog(stripe, { pricesHasMore: true })
  let calls = 0
  ;(stripe as unknown as { prices: { list: (_params: unknown) => Promise<unknown> } }).prices = { list: async () => {
    calls += 1
    return {
      data: [{
        id: `price-${calls}`,
        active: true,
        product: 'prod_growth',
        unit_amount: 4900,
        currency: 'usd',
        lookup_key: null,
        recurring: { interval: 'month', interval_count: 1 },
      }],
      has_more: true,
    }
  } }
  const result = await report({ stripe, loadPlans: undefined })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_catalog_unbounded'))
  assert.equal(calls, 10)
})

test('historical Stripe price and product lookups are bounded', async () => {
  resetRows()
  const historicalSubscriptions = Array.from({ length: 51 }, (_, index) => ({
    id: `sub-historical-${index}`,
    customer: 'cus_test',
    status: 'canceled',
    cancel_at_period_end: false,
    latest_invoice: null,
    metadata: { referenceId: REQUEST.organizationId },
    items: {
      data: [{
        id: `si-historical-${index}`,
        quantity: 1,
        current_period_start: Math.floor(Date.parse(PERIOD_START) / 1000),
        current_period_end: Math.floor(Date.parse(PERIOD_END) / 1000),
        price: { id: `price-historical-${index}`, lookup_key: null, recurring: { interval: 'month' } },
      }],
    },
  })) as unknown as Stripe.Subscription[]
  const stripe = provider({ subscriptions: historicalSubscriptions })
  let retrieveCalls = 0
  ;(stripe as unknown as {
    prices: { retrieve: (_id: string, _params?: unknown) => Promise<unknown> }
    products: { retrieve: (_id: string) => Promise<unknown> }
  }).prices = {
    retrieve: async (id: string) => {
      retrieveCalls += 1
      return {
        id,
        product: 'prod-growth-history',
        metadata: {},
        lookup_key: null,
      }
    },
  }
  ;(stripe as unknown as {
    prices: { retrieve: (_id: string, _params?: unknown) => Promise<unknown> }
    products: { retrieve: (_id: string) => Promise<unknown> }
  }).products = {
    retrieve: async () => ({ id: 'prod-growth-history', deleted: false, metadata: { plan_id: 'growth' } }),
  }
  const result = await report({ stripe, loadPlans: async () => [] })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_historical_unbounded'))
  assert.ok(retrieveCalls <= 100)
})

test('site evidence families block instead of silently truncating at the local bound', async () => {
  for (const family of ['sites', 'site_billing', 'site_entitlements'] as const) {
    resetRows()
    if (family === 'sites') siteRows = Array.from({ length: 1_001 }, (_, index) => ({ id: `site-${index}` }))
    if (family === 'site_billing') siteBillingRows = Array.from({ length: 1_001 }, (_, index) => ({ site_id: `site-${index}` }))
    if (family === 'site_entitlements') siteEntitlementRows = Array.from({ length: 1_001 }, (_, index) => ({ site_id: `site-${index}`, key: 'x' }))
    const result = await report()
    assert.equal(result.status, 'blocked')
    assert.ok(result.drifts.some(drift => drift.code === 'local_evidence_unbounded' && drift.subject === family))
  }
})

test('local evidence queries stay within the Cloudflare D1 100-parameter limit', async () => {
  resetRows()
  const subscriptions = Array.from({ length: 101 }, (_, index) => ({
    id: index === 0 ? 'sub_test' : `sub-bounded-${index}`,
    customer: 'cus_test',
    status: index === 0 ? 'active' : 'canceled',
    cancel_at_period_end: false,
    latest_invoice: null,
    metadata: {
      organizationId: REQUEST.organizationId,
      referenceId: REQUEST.organizationId,
      subscriptionId: index === 0 ? 'ba-sub-test' : `ba-bounded-${index}`,
    },
    items: {
      data: [{
        id: `si-bounded-${index}`,
        quantity: 1,
        current_period_start: Math.floor(Date.parse(PERIOD_START) / 1000),
        current_period_end: Math.floor(Date.parse(PERIOD_END) / 1000),
        price: { id: 'price_growth', lookup_key: null, recurring: { interval: 'month' } },
      }],
    },
  })) as unknown as Stripe.Subscription[]
  versionRows = subscriptions.map((subscription, index) => ({
    stripe_subscription_id: subscription.id,
    last_event_created: index,
    last_event_id: `evt-bounded-${index}`,
  }))
  webhookRows = subscriptions.map((_subscription, index) => ({
    stripe_event_id: `evt-bounded-${index}`,
    event_type: 'customer.subscription.updated',
    status: 'processed',
    attempt_count: 1,
    dead_lettered_at: null,
  }))
  const stripe = provider()
  ;(stripe as unknown as {
    subscriptions: {
      list: (_params: { starting_after?: string }) => Promise<{ data: Stripe.Subscription[]; has_more: boolean }>
      search: () => Promise<{ data: never[]; has_more: false; next_page: null }>
    }
  }).subscriptions = {
    list: async params => params.starting_after
      ? { data: subscriptions.slice(100), has_more: false }
      : { data: subscriptions.slice(0, 100), has_more: true },
    search: async () => ({ data: [], has_more: false, next_page: null }),
  }

  await report({ stripe })

  const boundedQueries = queryParameterCounts.filter(({ query }) =>
    query.includes('FROM stripe_subscription_versions') || query.includes('FROM stripe_webhook_events'),
  )
  assert.ok(boundedQueries.length >= 2)
  assert.equal(Math.max(...boundedQueries.map(({ count }) => count)) <= 100, true)
})

test('canonical and legacy owner metadata keys resolve to the same exact organization', async () => {
  resetRows()
  const result = await report({
    stripe: provider({
      customer: {
        metadata: { organization_id: REQUEST.organizationId, customerType: 'organization' },
      },
      subscription: {
        metadata: {
          organization_id: REQUEST.organizationId,
          subscriptionId: 'ba-sub-test',
        },
      },
    }),
  })
  assert.equal(result.status, 'match')
  assert.equal(result.provider.customer.metadata?.ownerId, REQUEST.organizationId)
  assert.equal(result.provider.subscriptions[0]?.metadata.ownerId, REQUEST.organizationId)
})

test('conflicting canonical and legacy owner metadata blocks reconciliation', async () => {
  resetRows()
  const result = await report({
    stripe: provider({
      customer: {
        metadata: {
          organizationId: REQUEST.organizationId,
          organization_id: 'org-other',
          customerType: 'organization',
        },
      },
      subscription: {
        metadata: {
          referenceId: REQUEST.organizationId,
          organizationId: REQUEST.organizationId,
          organization_id: 'org-other',
          subscriptionId: 'ba-sub-test',
        },
      },
    }),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_metadata_conflict'))
  assert.ok(result.drifts.some(drift => drift.code === 'provider_subscription_owner_metadata_conflict'))
})

test('annual and historical price ids report the resolved item price, not monthly catalog price', async () => {
  resetRows()
  const annualEnd = '2027-08-01T00:00:00.000Z'
  const result = await report({
    stripe: provider({
      subscription: {
        items: {
          data: [{
            id: 'si_test',
            quantity: 1,
            current_period_start: Math.floor(Date.parse(PERIOD_START) / 1000),
            current_period_end: Math.floor(Date.parse(annualEnd) / 1000),
            price: { id: 'price_growth_annual', lookup_key: null, recurring: { interval: 'year' } },
          }],
        },
      },
    }),
    loadPlans: async () => [{
      name: 'growth',
      priceId: 'price_growth',
      annualDiscountPriceId: 'price_growth_annual',
      limits: {},
      group: 'krabiclaw',
    }] as unknown as StripePlan[],
  })
  assert.equal(result.provider.subscriptions[0]?.canonicalBasePriceId, 'price_growth_annual')
})

test('accepted org projection requires null per-site subscription ids', async () => {
  resetRows()
  siteRows = [{ id: 'site-1', plan: 'growth', status: 'active' }]
  siteBillingRows = [{
    site_id: 'site-1',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: null,
    plan: 'growth',
    status: 'active',
    current_period_end: PERIOD_END,
    cancel_at_period_end: 0,
  }]
  siteEntitlementRows = Object.entries(getPlanEntitlements('growth')).map(([key, value]) => ({
    site_id: 'site-1',
    key,
    value: String(value),
    source: 'better-auth-stripe',
  }))
  const result = await report()
  assert.equal(result.status, 'match')
  assert.equal(result.localEvidence.siteBilling[0]?.stripeSubscriptionId, null)
})

test('organization and site entitlement evidence reports missing, mismatched, stale, and unrelated rows', async () => {
  resetRows()
  organizationEntitlementRows = [
    { key: 'plan', value: 'free', source: 'better-auth-stripe' },
    { key: 'stale_key', value: '1', source: 'better-auth-stripe' },
    { key: 'unrelated_key', value: '1', source: 'manual' },
  ]
  siteRows = [{ id: 'site-1', plan: 'growth', status: 'active' }]
  siteEntitlementRows = [{ site_id: 'site-1', key: 'stale_key', value: '1', source: 'better-auth-stripe' }]
  const result = await report()
  assert.notEqual(result.status, 'match')
  assert.ok(result.drifts.some(drift => drift.code === 'organization_entitlement_mismatch'))
  assert.ok(result.drifts.some(drift => drift.code === 'organization_entitlement_missing'))
  assert.ok(result.drifts.some(drift => drift.code === 'organization_entitlement_stale'))
  assert.ok(result.drifts.some(drift => drift.code === 'site_entitlement_missing'))
  assert.ok(result.drifts.some(drift => drift.code === 'site_entitlement_stale'))
  assert.ok(!result.drifts.some(drift => drift.subject.includes('unrelated_key')))
})

test('canceled historical subscription can reconcile without a current subscription', async () => {
  resetRows()
  projectionRow = {
    organization_id: REQUEST.organizationId,
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    plan: 'growth',
    status: 'canceled',
    payment_status: 'unknown',
    paid_through: null,
    past_due_since: null,
    current_period_end: PERIOD_END,
    cancel_at_period_end: 0,
    updated_at: NOW.toISOString(),
  }
  organizationEntitlementRows = Object.entries(getPlanEntitlements('free')).map(([key, value]) => ({
    key,
    value: String(value),
    source: 'better-auth-stripe',
  }))
  const canceledRow = {
    id: 'ba-sub-test',
    referenceId: REQUEST.organizationId,
    plan: 'growth',
    status: 'canceled',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_test',
    periodStart: new Date(PERIOD_START),
    periodEnd: new Date(PERIOD_END),
    cancelAtPeriodEnd: false,
    billingInterval: 'month',
    seats: 1,
  }
  const result = await report({
    adapter: adapter([canceledRow]),
    stripe: provider({ subscription: { status: 'canceled' } }),
  })
  assert.equal(result.status, 'match')
  assert.ok(!result.drifts.some(drift => drift.code === 'current_subscription_missing'))
})

test('paid terminal history without a materialized organization projection blocks', async () => {
  resetRows()
  projectionRow = null
  organizationEntitlementRows = []
  const result = await report({
    adapter: adapter([{
      id: 'ba-sub-test',
      referenceId: REQUEST.organizationId,
      plan: 'growth',
      status: 'canceled',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
      cancelAtPeriodEnd: false,
      billingInterval: 'month',
      seats: 1,
    }]),
    stripe: provider({ subscription: { status: 'canceled' } }),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'app_projection_missing'))
})

test('read Stripe history exposes a missing canceled Better Auth fulfillment row', async () => {
  resetRows()
  projectionRow = null
  const result = await report({
    adapter: adapter([{
      id: 'ba-sub-missing',
      referenceId: REQUEST.organizationId,
      plan: 'growth',
      status: 'canceled',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_missing',
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
      cancelAtPeriodEnd: false,
      billingInterval: 'month',
      seats: 1,
    }]),
    stripe: provider({ subscriptions: [] }),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_historical_subscription_missing'))
})

test('malformed Better Auth current rows are blocked before they become nullable drift', async () => {
  resetRows()
  const result = await report({
    adapter: adapter([{
      id: null,
      referenceId: REQUEST.organizationId,
      plan: 'growth',
      status: 'active',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
      cancelAtPeriodEnd: null,
      billingInterval: 'month',
      seats: null,
    }]),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'better_auth_subscription_malformed'))
})

test('malformed Stripe subscription quantity, status, cancel, and period state blocks', async () => {
  resetRows()
  const result = await report({
    stripe: provider({
      subscription: {
        status: 'unknown',
        customer: null,
        cancel_at_period_end: null,
        items: {
          data: [{
            id: 'si_test',
            quantity: 0,
            current_period_start: Math.floor(Date.parse(PERIOD_END) / 1000),
            current_period_end: Math.floor(Date.parse(PERIOD_START) / 1000),
            price: { id: 'price_growth', lookup_key: null, recurring: { interval: 'month' } },
          }],
        },
      },
    }),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_subscription_malformed'))
})

test('Better Auth adapter limit exhaustion blocks as incomplete history', async () => {
  resetRows()
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: `ba-sub-${index}`,
    referenceId: REQUEST.organizationId,
    plan: 'growth',
    status: 'canceled',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: `sub-${index}`,
    periodStart: new Date(PERIOD_START),
    periodEnd: new Date(PERIOD_END),
    cancelAtPeriodEnd: false,
    billingInterval: 'month',
    seats: 1,
  }))
  const result = await report({ adapter: adapter(rows) })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'better_auth_history_unbounded'))
})

test('customer identity ambiguity blocks before a customer read', async () => {
  resetRows()
  projectionRow = null
  let retrieveCalls = 0
  const stripe = provider()
  ;(stripe.customers as unknown as { search: () => Promise<unknown>; retrieve: () => Promise<unknown> }).search = async () => ({
    data: [{ id: 'cus_a' }, { id: 'cus_b' }],
    has_more: false,
  })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    retrieveCalls += 1
    return { id: 'cus_a', deleted: false, metadata: {} }
  }
  const result = await report({
    stripe,
    organization: { id: REQUEST.organizationId },
    adapter: adapter([{ id: 'ba-historical', referenceId: REQUEST.organizationId, plan: 'growth', status: 'canceled' }]),
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_ambiguous'))
  assert.equal(retrieveCalls, 0)
})

test('account id mismatch blocks before customer or subscription reads', async () => {
  resetRows()
  let retrieveCalls = 0
  let listCalls = 0
  const stripe = provider()
  ;(stripe.accounts as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => ({ id: 'acct_other' })
  ;(stripe.customers as unknown as { retrieve: () => Promise<unknown> }).retrieve = async () => {
    retrieveCalls += 1
    return { id: 'cus_test', deleted: false, metadata: {} }
  }
  ;(stripe.subscriptions as unknown as { list: () => Promise<unknown> }).list = async () => {
    listCalls += 1
    return { data: [], has_more: false }
  }
  const result = await report({ stripe })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_account_mismatch'))
  assert.equal(retrieveCalls, 0)
  assert.equal(listCalls, 0)
})

test('provider ownership, plan, status, and period drift are explicit', async () => {
  resetRows()
  const result = await report({
    stripe: provider({
      customer: { metadata: { organizationId: 'org-other', customerType: 'organization' } },
      subscription: {
        status: 'past_due',
        metadata: {
          organizationId: REQUEST.organizationId,
          referenceId: REQUEST.organizationId,
          subscriptionId: 'ba-sub-test',
        },
        items: {
          data: [{
            id: 'si_test',
            quantity: 1,
            current_period_start: Math.floor(Date.parse(PERIOD_START) / 1000),
            current_period_end: Math.floor(Date.parse('2026-10-01T00:00:00.000Z') / 1000),
            price: { id: 'price_other', lookup_key: null, recurring: { interval: 'year' } },
          }],
        },
      },
    }),
    loadPlans: async () => [{ name: 'managed', priceId: 'price_other', limits: {}, group: 'krabiclaw' }] as unknown as StripePlan[],
  })
  assert.equal(result.status, 'blocked')
  assert.ok(result.drifts.some(drift => drift.code === 'provider_customer_metadata_conflict'))
  assert.ok(result.drifts.some(drift => drift.code === 'subscription_plan_mismatch'))
  assert.ok(result.drifts.some(drift => drift.code === 'subscription_status_mismatch'))
  assert.ok(result.drifts.some(drift => drift.code === 'subscription_period_end_mismatch'))
})

test('route and utility are read-only and keep Better Auth SQL behind its adapter', () => {
  assert.doesNotMatch(utilitySource, /\b(?:execute|executeBatch)\s*\(/u)
  assert.doesNotMatch(utilitySource, /(?:customers|subscriptions|invoices)\.(?:create|update|delete|del|cancel|pay|void)\s*\(/u)
  assert.doesNotMatch(utilitySource, /\bFROM\s+(?:organization|subscription)\b/iu)
  assert.doesNotMatch(routeSource, /\b(?:apply|approvalToken|customers\.create|subscriptions\.create|subscriptions\.update|subscriptions\.cancel|invoices\.pay)\b/u)
  assert.match(routeSource, /platformPermissionJsonResponse\(event, env, \{ platform: \['billing'\] \}\)/u)
  assert.match(routeSource, /assertStripeProviderMode\(env\.STRIPE_SECRET_KEY, request\.providerMode\)/u)
  assert.match(routeSource, /setResponseHeader\(event, ['"]cache-control['"], ['"]no-store['"]\)/u)
  assert.match(routeSource, /headers: \{ ['"]cache-control['"]: ['"]no-store['"] \}/u)
  assert.match(routeSource, /assertStripeProviderMode[\s\S]*readDeploymentProvenance[\s\S]*const auth = createAuth/u)
  assert.match(routeSource, /instanceof OperatorSessionError/u)
  assert.match(routeSource, /getOrgAdapter/iu)
})
