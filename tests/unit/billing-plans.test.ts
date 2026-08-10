import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { EnvWithSiteCache } from '../../server/utils/billing-plans.ts'

// ── KV stub ──────────────────────────────────────────────────────────────────

function makeKv(initial: Record<string, string> = {}): KVNamespace {
  const store: Record<string, string> = { ...initial }
  return {
    get: async (key: string) => store[key] ?? null,
    put: async (key: string, value: string) => { store[key] = value },
    delete: async (key: string) => { Reflect.deleteProperty(store, key) },
    list: async () => ({ keys: [], list_complete: true, cursor: '', cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace
}

// ── Fake Stripe SDK ──────────────────────────────────────────────────────────
//
// fetchStripeProducts() does `new Stripe(...)` internally, so the only way to
// intercept it without changing production code is mocking the 'stripe'
// module itself. This must happen before the real billing-plans module is
// imported, since ESM resolves the 'stripe' specifier at that import's
// evaluation time.

let stripeProducts: unknown[] = []
let stripePrices: unknown[] = []
let stripeCallCount = 0

class FakeStripe {
  products = {
    list: async () => {
      stripeCallCount++
      return { data: stripeProducts, has_more: false }
    },
  }

  prices = {
    list: async () => {
      return { data: stripePrices, has_more: false }
    },
  }
}

mock.module('stripe', {
  defaultExport: FakeStripe,
})

const { BillingPlansError, getCachedPlans } = await import('../../server/utils/billing-plans.ts')

// The public sales catalog uses one versioned cache key regardless of
// MANAGED_SERVICE_ENABLED.
const CACHE_KEY = 'stripe-plans:v4'

const GROWTH_PRODUCT = {
  id: 'prod_growth',
  name: 'Growth',
  description: 'Growth plan',
  images: [],
  metadata: { plan_id: 'growth' },
}

const GROWTH_PRICE = {
  id: 'price_growth_month',
  unit_amount: 4900,
  currency: 'usd',
  type: 'recurring',
  recurring: { interval: 'month', interval_count: 1 },
  product: 'prod_growth',
}

const MANAGED_PRODUCT = {
  id: 'prod_managed',
  name: 'Managed',
  description: 'Managed plan',
  images: [],
  metadata: { plan_id: 'managed' },
}

const SEO_PRODUCT = {
  id: 'prod_seo',
  name: 'SEO Accelerator',
  description: 'SEO Accelerator plan',
  images: [],
  metadata: { plan_id: 'seo_accelerator' },
}

const MANAGED_PRICE = {
  id: 'price_managed_month',
  unit_amount: 14900,
  currency: 'usd',
  type: 'recurring',
  recurring: { interval: 'month', interval_count: 1 },
  product: 'prod_managed',
}

const SEO_PRICE = {
  id: 'price_seo_month',
  unit_amount: 34900,
  currency: 'usd',
  type: 'recurring',
  recurring: { interval: 'month', interval_count: 1 },
  product: 'prod_seo',
}

const CACHED_STARTER_PLAN = {
  id: 'free',
  name: 'Starter',
  tagline: 'Get your business online for free',
  highlighted: false,
  prices: [],
  features: ['Bookings & ticketed experiences'],
  limits: {
    aiCredits: 500,
    customDomain: false,
    googleBusiness: false,
    advancedSeo: false,
    whiteLabel: false,
    apiAccess: false,
    support: 'Community',
  },
  cta: { label: 'Start Free', href: '/signup' },
}

const CACHED_GROWTH_PLAN = {
  id: 'growth',
  name: 'Growth',
  tagline: 'Growth plan',
  highlighted: true,
  badge: 'Most Popular',
  prices: [{ id: 'price_growth_month', amount: 4900, currency: 'usd', interval: 'month' }],
  features: ['Restaurant or experience site live in minutes'],
  limits: {
    aiCredits: 2000,
    customDomain: true,
    googleBusiness: true,
    advancedSeo: false,
    whiteLabel: false,
    apiAccess: false,
    support: 'Priority',
  },
  cta: { label: 'Get Growth', href: '/signup?plan=growth' },
}

function baseEnv(siteCache?: KVNamespace): EnvWithSiteCache {
  const env: EnvWithSiteCache = { STRIPE_SECRET_KEY: 'sk_test_123' }
  if (siteCache) env.SITE_CACHE = siteCache
  return env
}

beforeEach(() => {
  stripeProducts = []
  stripePrices = []
  stripeCallCount = 0
})

describe('getCachedPlans — KV read-through cache', () => {
  test('returns parsed plans from KV without calling Stripe', async () => {
    const cached = [CACHED_STARTER_PLAN, CACHED_GROWTH_PLAN]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    const result = await getCachedPlans(baseEnv(kv))

    assert.deepEqual(result, cached)
    assert.equal(stripeCallCount, 0)
  })

  test('normalizes valid cache order to Starter then Growth', async () => {
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify([CACHED_GROWTH_PLAN, CACHED_STARTER_PLAN]) })

    const result = await getCachedPlans(baseEnv(kv))

    assert.deepEqual(result.map((plan) => plan.id), ['free', 'growth'])
    assert.equal(stripeCallCount, 0)
  })

  test('rejects an incomplete cache that is missing Growth', async () => {
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify([CACHED_STARTER_PLAN]) })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_CACHE_INVALID',
    )

    assert.equal(stripeCallCount, 0)
  })

  test('rejects a cached Growth price that is not exactly USD 4900', async () => {
    const cached = [
      CACHED_STARTER_PLAN,
      {
        ...CACHED_GROWTH_PLAN,
        prices: [{ ...CACHED_GROWTH_PLAN.prices[0], amount: 3900 }],
      },
    ]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_CACHE_INVALID',
    )

    assert.equal(stripeCallCount, 0)
  })

  test('rejects malformed nested plan data without calling Stripe', async () => {
    const cached = [{
      ...CACHED_STARTER_PLAN,
      limits: { ...CACHED_STARTER_PLAN.limits, aiCredits: '500' },
    }]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_CACHE_INVALID',
    )

    assert.equal(stripeCallCount, 0)
  })

  test('rejects retired plan IDs in the public cache', async () => {
    const cached = [{ ...CACHED_STARTER_PLAN, id: 'managed' }]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_CACHE_INVALID',
    )

    assert.equal(stripeCallCount, 0)
  })

  test('rejects duplicate public plan IDs in the cache', async () => {
    const cached = [CACHED_STARTER_PLAN, { ...CACHED_STARTER_PLAN }]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_CACHE_INVALID',
    )

    assert.equal(stripeCallCount, 0)
  })

  test('fetches from Stripe on KV miss and writes the result back to KV', async () => {
    stripeProducts = [GROWTH_PRODUCT]
    stripePrices = [GROWTH_PRICE]
    const kv = makeKv({})

    const result = await getCachedPlans(baseEnv(kv))

    assert.equal(stripeCallCount, 1)
    assert.ok(result.some((p) => p.id === 'free'), 'includes the static Starter plan')
    const growth = result.find((p) => p.id === 'growth')
    assert.ok(growth, 'includes the fetched Growth plan')
    assert.equal(growth?.prices[0]?.amount, 4900)

    const stored = await kv.get(CACHE_KEY, 'text')
    // Compare through a JSON round-trip on both sides: KV storage always
    // JSON-serializes, which drops `undefined` properties (e.g. badge/image)
    // that are still present as explicit keys on the in-memory result.
    assert.deepEqual(JSON.parse(stored as string), JSON.parse(JSON.stringify(result)))
  })

  test('fails fast when cached JSON is invalid without calling Stripe', async () => {
    const kv = makeKv({ [CACHE_KEY]: 'not-valid-json{{{' })

    await assert.rejects(
      () => getCachedPlans(baseEnv(kv)),
      (error: unknown) =>
        error instanceof BillingPlansError
        && error.code === 'BILLING_PLANS_CACHE_INVALID'
        && error.statusCode === 503,
    )

    assert.equal(stripeCallCount, 0)
  })

test('skips KV entirely when SITE_CACHE is undefined', async () => {
    stripeProducts = [GROWTH_PRODUCT]
    stripePrices = [GROWTH_PRICE]

    const result = await getCachedPlans(baseEnv())

    assert.equal(stripeCallCount, 1)
  assert.ok(result.some((p) => p.id === 'growth'))
})

test('rejects a provider catalog that is missing Growth', async () => {
  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
  assert.equal(stripeCallCount, 1)
})

test('rejects a provider Growth price that is not exactly USD 4900', async () => {
  stripeProducts = [GROWTH_PRODUCT]
  stripePrices = [{ ...GROWTH_PRICE, unit_amount: 3900 }]

  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
  assert.equal(stripeCallCount, 1)
})

test('Stripe metadata cannot override application-owned Growth capabilities', async () => {
  stripeProducts = [{
    ...GROWTH_PRODUCT,
    metadata: {
      plan_id: 'growth',
      ai_credits: '999999',
      custom_domains: 'false',
      google_business: 'false',
      advanced_seo: 'true',
      white_label: 'true',
      api_access: 'true',
      support: 'Unlimited support',
    },
  }]
  stripePrices = [GROWTH_PRICE]

  const growth = (await getCachedPlans(baseEnv())).find((plan) => plan.id === 'growth')

  assert.deepEqual(growth?.limits, {
    aiCredits: 2000,
    customDomain: true,
    googleBusiness: true,
    advancedSeo: false,
    whiteLabel: false,
    apiAccess: false,
    support: 'Priority',
  })
})

test('public billing plans omit retired concierge plans even when enabled', async () => {
  stripeProducts = [GROWTH_PRODUCT, MANAGED_PRODUCT, SEO_PRODUCT]
  stripePrices = [GROWTH_PRICE, MANAGED_PRICE, SEO_PRICE]

  const result = await getCachedPlans({
    ...baseEnv(),
    MANAGED_SERVICE_ENABLED: 'true',
  })

  assert.deepEqual(result.map((plan) => plan.id), ['free', 'growth'])
})

test('rejects an annual-only paid product instead of returning an undefined monthly price', async () => {
  stripeProducts = [GROWTH_PRODUCT]
  stripePrices = [{
    ...GROWTH_PRICE,
    id: 'price_growth_year',
    recurring: { interval: 'year', interval_count: 1 },
  }]

  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
})

test('rejects duplicate canonical monthly prices', async () => {
  stripeProducts = [GROWTH_PRODUCT]
  stripePrices = [
    GROWTH_PRICE,
    { ...GROWTH_PRICE, id: 'price_growth_month_duplicate' },
  ]

  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
})

test('rejects duplicate active products for one new-sale plan', async () => {
  stripeProducts = [
    GROWTH_PRODUCT,
    {
      ...GROWTH_PRODUCT,
      id: 'prod_growth_duplicate',
      name: 'Growth duplicate',
    },
  ]
  stripePrices = [
    GROWTH_PRICE,
    {
      ...GROWTH_PRICE,
      id: 'price_growth_duplicate_month',
      product: 'prod_growth_duplicate',
    },
  ]

  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
})

test('rejects mixed currencies across the canonical monthly and annual prices', async () => {
  stripeProducts = [GROWTH_PRODUCT]
  stripePrices = [
    GROWTH_PRICE,
    {
      ...GROWTH_PRICE,
      id: 'price_growth_year',
      currency: 'eur',
      recurring: { interval: 'year', interval_count: 1 },
    },
  ]

  await assert.rejects(
    () => getCachedPlans(baseEnv()),
    (error: unknown) => error instanceof BillingPlansError && error.code === 'BILLING_PLANS_INVALID_CATALOG',
  )
})
})

describe('getCachedPlans — in-flight coalescing', () => {
  test('two concurrent cache misses share a single Stripe fetch', async () => {
    stripeProducts = [GROWTH_PRODUCT]
    stripePrices = [GROWTH_PRICE]
    const env = baseEnv()

    const [a, b] = await Promise.all([getCachedPlans(env), getCachedPlans(env)])

    assert.equal(stripeCallCount, 1, 'fetchStripeProducts should only be called once')
    assert.deepEqual(a, b)
  })
})

test('public billing plan cache does not split snapshots by the retired sales flag', async () => {
  stripeProducts = [GROWTH_PRODUCT]
  stripePrices = [GROWTH_PRICE]
  const kv = makeKv()

  await getCachedPlans(baseEnv(kv))
  await getCachedPlans({
    ...baseEnv(kv),
    MANAGED_SERVICE_ENABLED: 'true',
  })

  assert.equal(stripeCallCount, 1)
})
