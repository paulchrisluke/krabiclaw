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

const { getCachedPlans } = await import('../../server/utils/billing-plans.ts')

const CACHE_KEY = 'stripe-plans:v1'

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
  recurring: { interval: 'month' },
  product: 'prod_growth',
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
    const cached = [{ id: 'free', name: 'Starter' }]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(cached) })

    const result = await getCachedPlans(baseEnv(kv))

    assert.deepEqual(result, cached)
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

  test('falls back to Stripe when cached JSON is invalid', async () => {
    stripeProducts = [GROWTH_PRODUCT]
    stripePrices = [GROWTH_PRICE]
    const kv = makeKv({ [CACHE_KEY]: 'not-valid-json{{{' })

    const result = await getCachedPlans(baseEnv(kv))

    assert.equal(stripeCallCount, 1)
    assert.ok(result.some((p) => p.id === 'growth'))
  })

  test('skips KV entirely when SITE_CACHE is undefined', async () => {
    stripeProducts = [GROWTH_PRODUCT]
    stripePrices = [GROWTH_PRICE]

    const result = await getCachedPlans(baseEnv())

    assert.equal(stripeCallCount, 1)
    assert.ok(result.some((p) => p.id === 'growth'))
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
