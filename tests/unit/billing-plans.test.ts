import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ── Minimal stub types ──────────────────────────────────────────────────────

type KvValue = string | null

function makeKv(initial: Record<string, string> = {}): KVNamespace {
  const store: Record<string, string> = { ...initial }
  return {
    get: async (key: string, _type?: string) => (store[key] ?? null) as KvValue,
    put: async (key: string, value: string) => { store[key] = value },
    delete: async (key: string) => { delete store[key] },
    list: async () => ({ keys: [], list_complete: true, cursor: '', cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace
}

// ── Isolate: inline a testable subset of getCachedPlans logic ───────────────
//
// We cannot import '../../server/utils/billing-plans' directly in a Node test
// runner without Nuxt auto-imports resolved, so we replicate the minimal KV
// read-through + JSON-parse logic here to prove the cache contract.

async function readFromKv(kv: KVNamespace | undefined, key: string): Promise<unknown[] | null> {
  if (!kv) return null
  const raw = await kv.get(key, 'text').catch(() => null) as string | null
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown[]
  } catch {
    return null // invalid JSON → cache miss
  }
}

async function writeToKv(kv: KVNamespace | undefined, key: string, data: unknown[], ttl: number) {
  if (!kv) return
  await kv.put(key, JSON.stringify(data), { expirationTtl: ttl } as Parameters<KVNamespace['put']>[2]).catch(() => {})
}

const CACHE_KEY = 'stripe-plans:v1'
const CACHE_TTL = 3600

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getCachedPlans — KV read-through cache', () => {
  test('returns parsed plans on KV hit', async () => {
    const plans = [{ id: 'free', name: 'Starter' }]
    const kv = makeKv({ [CACHE_KEY]: JSON.stringify(plans) })

    const result = await readFromKv(kv, CACHE_KEY)
    assert.deepEqual(result, plans)
  })

  test('returns null on KV miss', async () => {
    const kv = makeKv({})
    const result = await readFromKv(kv, CACHE_KEY)
    assert.equal(result, null)
  })

  test('returns null on invalid JSON in KV', async () => {
    const kv = makeKv({ [CACHE_KEY]: 'not-valid-json{{{' })
    const result = await readFromKv(kv, CACHE_KEY)
    assert.equal(result, null)
  })

  test('writes fetched plans to KV', async () => {
    const kv = makeKv({})
    const fetched = [{ id: 'growth', name: 'Growth' }]
    await writeToKv(kv, CACHE_KEY, fetched, CACHE_TTL)

    const stored = await readFromKv(kv, CACHE_KEY)
    assert.deepEqual(stored, fetched)
  })

  test('swallows KV write errors silently', async () => {
    // KV that throws on put
    const failingKv = {
      get: async () => null,
      put: async () => { throw new Error('KV write failed') },
    } as unknown as KVNamespace

    // Should not throw
    await assert.doesNotReject(
      writeToKv(failingKv, CACHE_KEY, [{ id: 'free' }], CACHE_TTL)
    )
  })

  test('skips KV entirely when SITE_CACHE is undefined', async () => {
    const result = await readFromKv(undefined, CACHE_KEY)
    assert.equal(result, null)
  })
})

describe('getCachedPlans — in-flight coalescing', () => {
  test('two concurrent callers sharing an inflight promise receive the same result', async () => {
    let callCount = 0
    async function fakeFetch(): Promise<{ id: string }[]> {
      callCount++
      // Simulate async Stripe latency
      await new Promise(r => setTimeout(r, 10))
      return [{ id: 'growth' }]
    }

    // Simulate the coalescing pattern from billing-plans.ts
    let inflight: Promise<{ id: string }[]> | null = null

    async function getWithCoalescing() {
      if (inflight) return inflight
      inflight = fakeFetch().finally(() => { inflight = null })
      return inflight
    }

    const [a, b] = await Promise.all([getWithCoalescing(), getWithCoalescing()])

    assert.equal(callCount, 1, 'fetchStripeProducts should only be called once')
    assert.deepEqual(a, b)
  })
})
