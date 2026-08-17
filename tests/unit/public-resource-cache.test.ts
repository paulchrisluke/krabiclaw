import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const purgedHostnames: string[][] = []

async function execute(_db: unknown, query: string) {
  if (query.includes("SET status = 'processing'")) return { meta: { changes: 1 } }
  return { meta: { changes: 1 } }
}

async function queryAll<T>(_db: unknown, query: string): Promise<T[]> {
  if (query.includes('FROM public_resource_cache_invalidations')) {
    return [{ id: 'invalidation-1', site_id: 'site-1', attempt_count: 0 }] as T[]
  }
  if (query.includes('FROM site_domains')) return []
  if (query.includes('FROM sites')) {
    return [{ subdomain: 'tenant', custom_domain: null }] as T[]
  }
  return []
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, queryAll },
})

mock.module('../../server/utils/edge-cache.ts', {
  namedExports: {
    purgeSiteKvCache: async (_kv: unknown, hostnames: string[]) => {
      purgedHostnames.push(hostnames)
    },
  },
})

const { purgePublicResourceCacheSafe } = await import('../../server/utils/public-resource-cache.ts')

test('safe cache purge passes the configured free-site domain to durable invalidation draining', async () => {
  purgedHostnames.length = 0
  const kv = {
    list: async () => ({ keys: [], list_complete: true }),
    delete: async () => undefined,
  }

  await purgePublicResourceCacheSafe({
    DB: {},
    SITE_CACHE: kv,
    NUXT_PUBLIC_FREE_SITE_DOMAIN: 'https://krabiclaw.com',
  }, 'site-1')

  assert.deepEqual(purgedHostnames, [['tenant.krabiclaw.com']])
})
