import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test, { type TestContext } from 'node:test'
import { Miniflare } from 'miniflare'

import { drainPublicResourceCacheInvalidations, purgePublicResourceCacheNow, type OrganizationChangeDrainEnv } from '../../server/utils/public-resource-cache.ts'
import { buildOrganizationDocuments, expandDocumentsForSurfaces, indexItemPayload, syncOrganizationSearchIndex } from '../../server/utils/public-search.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'

const searchEnv: OrganizationChangeDrainEnv = {
  NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN: 'https://krabiclaw.com',
  AI_SEARCH_INSTANCE_ID: 'test-index',
  AI_SEARCH: {
    get: () => ({
      items: {
        list: async () => ({ result: [], result_info: { per_page: 50, total_count: 0 } }),
        upload: async () => ({}),
        delete: async () => ({}),
      },
    }),
  } as unknown as NonNullable<OrganizationChangeDrainEnv['AI_SEARCH']>,
}

async function migratedCacheD1(context: TestContext) {
  const miniflare = new Miniflare({
    workers: [{
      config: {
        name: 'public-resource-cache-test',
        type: 'worker',
        compatibilityDate: '2024-11-01',
        manifest: {
          mainModule: 'index.mjs',
          modules: {
            'index.mjs': {
              type: 'esm',
              contents: 'export default { fetch() { return new Response("ok") } }',
            },
          },
        },
        env: {
          DB: { type: 'd1' },
          ORGANIZATION_CACHE: { type: 'kv' },
        },
      },
    }],
  })
  context.after(() => miniflare.dispose())
  const db = await miniflare.getD1Database('DB')
  const kv = await miniflare.getKVNamespace('ORGANIZATION_CACHE')
  for (const filename of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const migration = readFileSync(`migrations/${filename}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  }
  await db.prepare("INSERT INTO organization (id, name, slug, subdomain) VALUES ('org', 'Org', 'org', 'org')").run()
  await db.prepare("INSERT INTO organization (id, name, slug, subdomain, theme_id) VALUES ('platform', 'Platform', 'platform', 'platform', 'krabiclaw-theme-v1')").run()
  return { db, kv }
}

async function insertInvalidation(
  db: D1Database,
  input: {
    id: string
    status: 'pending' | 'processing' | 'processed' | 'failed'
    attemptCount: number
    claimedAt?: string | null
    processedAt?: string | null
    createdAt: string
  },
) {
  await db.prepare(`
    INSERT INTO public_resource_cache_invalidations
      (id, organization_id, reason, status, attempt_count, claimed_at, processed_at, created_at)
    VALUES (?, 'org', 'test', ?, ?, ?, ?, ?)
  `).bind(input.id, input.status, input.attemptCount, input.claimedAt ?? null, input.processedAt ?? null, input.createdAt).run()
}

test('a scoped sync returns current pending work after its queued item finishes indexing', async (t) => {
  const { db } = await migratedCacheD1(t)
  await db.prepare("INSERT INTO business_locations (id, organization_id, slug, title) VALUES ('location', 'org', 'location', 'Location')").run()
  const records = expandDocumentsForSurfaces(await buildOrganizationDocuments(db, 'org'))
  assert.equal(records.length, 1)
  const record = records[0]!
  let lists = 0
  let uploads = 0
  const env = {
    AI_SEARCH_INSTANCE_ID: 'test-index',
    AI_SEARCH: { get: () => ({
      stats: async () => { throw new Error('instance-wide status must not block this organization') },
      items: {
        list: async () => {
          lists += 1
          return {
            result: [{ id: 'item', key: record.key, status: lists === 1 ? 'queued' : 'completed',
              metadata: lists === 1 ? null : { content_hash: indexItemPayload(record).contentHash } }],
            result_info: { per_page: 50, total_count: 1 },
          }
        },
        upload: async () => { uploads += 1 },
        delete: async () => { throw new Error('the current item must not be deleted') },
      },
    }) },
  } as unknown as CloudflareEnv

  assert.deepEqual(await syncOrganizationSearchIndex(env, db, 'org'), {
    indexed: 0, unchanged: 1, pending: 0, deleted: 0, indexingUnconfirmedReason: null,
  })
  assert.equal(lists, 3)
  assert.equal(uploads, 0)
})

test('cache invalidation drain enforces the durable work lifecycle', async (t) => {
  const { db, kv } = await migratedCacheD1(t)
  await t.test('validates its domain before claiming work and purges both cache contracts', async () => {
    await insertInvalidation(db, {
      id: 'pending', status: 'pending', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z',
    })

    await assert.rejects(
      drainPublicResourceCacheInvalidations(db, kv, { NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN: undefined }, {}),
      /NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN is required/,
    )
    const row = await db.prepare(`
      SELECT status, attempt_count FROM public_resource_cache_invalidations WHERE id = 'pending'
    `).first<{ status: string; attempt_count: number }>()
    assert.deepEqual(row, { status: 'pending', attempt_count: 0 })
    await assert.rejects(
      drainPublicResourceCacheInvalidations(db, kv, { NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN: 'https://krabiclaw.com' }, {}),
      /AI Search binding is required/,
    )
    assert.deepEqual(await db.prepare(`
      SELECT status, attempt_count FROM public_resource_cache_invalidations WHERE id = 'pending'
    `).first(), { status: 'pending', attempt_count: 0 })

    await kv.put('public~org~v4~page', 'public resource')
    await kv.put('html:org.krabiclaw.com:/', 'html')
    assert.equal(await drainPublicResourceCacheInvalidations(db, kv, searchEnv, {}), 1)
    assert.equal(await kv.get('public~org~v4~page'), null)
    assert.equal(await kv.get('html:org.krabiclaw.com:/'), null)
    const processed = await db.prepare(`
      SELECT status, attempt_count FROM public_resource_cache_invalidations WHERE id = 'pending'
    `).first<{ status: string; attempt_count: number }>()
    assert.deepEqual(processed, { status: 'processed', attempt_count: 1 })
  })
  await db.prepare('DELETE FROM public_resource_cache_invalidations').run()

  await t.test('terminates exhausted work and removes old terminal history', async () => {
    const now = new Date('2026-09-05T12:00:00.000Z')
    const failingKv = new Proxy(kv, {
      get(target, property) {
        if (property === 'list') return async () => { throw new Error('injected KV failure') }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await insertInvalidation(db, {
      id: 'last-attempt', status: 'pending', attemptCount: 4, createdAt: '2026-09-05T11:00:00.000Z',
    })
    await insertInvalidation(db, {
      id: 'stale-exhausted', status: 'processing', attemptCount: 5,
      createdAt: '2026-09-05T10:00:00.000Z',
    })
    for (const status of ['processed', 'failed'] as const) {
      await insertInvalidation(db, {
        id: `old-${status}`, status, attemptCount: 5,
        processedAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
      })
    }

    await assert.rejects(
      drainPublicResourceCacheInvalidations(db, failingKv, searchEnv, { now }),
      /injected KV failure/,
    )

    const terminal = await db.prepare(`
      SELECT id, status, attempt_count, claimed_at, processed_at, last_error
        FROM public_resource_cache_invalidations ORDER BY id
    `).all<{
      id: string
      status: string
      attempt_count: number
      claimed_at: string | null
      processed_at: string | null
      last_error: string | null
    }>()
    assert.deepEqual(terminal.results, [
      {
        id: 'last-attempt', status: 'failed', attempt_count: 5, claimed_at: null,
        processed_at: now.toISOString(), last_error: 'injected KV failure',
      },
      {
        id: 'stale-exhausted', status: 'failed', attempt_count: 5, claimed_at: null,
        processed_at: now.toISOString(), last_error: 'Retry limit reached',
      },
    ])
  })
})


test('an organization write purges that organization despite an older invalidation for another', async (t) => {
  const { db, kv } = await migratedCacheD1(t)
  await db.prepare("INSERT INTO organization (id, name, slug, subdomain) VALUES ('changed', 'Changed', 'changed', 'changed')").run()
  await insertInvalidation(db, {
    id: 'older-other-org', status: 'pending', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z',
  })
  for (const organization of ['org', 'changed']) {
    await kv.put(`public~${organization}~v4~page`, 'cached public resource')
    await kv.put(`html:${organization}.krabiclaw.com:/`, 'cached HTML')
  }
  await purgePublicResourceCacheNow({ DB: db, ORGANIZATION_CACHE: kv, NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN: 'https://krabiclaw.com' }, 'changed')
  assert.equal(await kv.get('public~changed~v4~page'), null)
  assert.equal(await kv.get('html:changed.krabiclaw.com:/'), null)
  assert.equal(await kv.get('public~org~v4~page'), 'cached public resource')
  assert.equal(await kv.get('html:org.krabiclaw.com:/'), 'cached HTML')
  // The write clears its own organization's caches and queues the row that makes every
  // other worker converge; the queue's own bookkeeping belongs to the drainer,
  // not to a mutation's response time.
  const rows = await db.prepare('SELECT organization_id, status, attempt_count FROM public_resource_cache_invalidations ORDER BY organization_id')
    .all<{ organization_id: string; status: string; attempt_count: number }>()
  assert.deepEqual(rows.results, [
    { organization_id: 'changed', status: 'pending', attempt_count: 0 },
    { organization_id: 'org', status: 'pending', attempt_count: 0 },
  ])
  await assert.rejects(
    drainPublicResourceCacheInvalidations(db, kv, searchEnv, { organizationId: 'changed', limit: 0 }),
    /pending cache or search index work remains/,
  )
  assert.equal(await drainPublicResourceCacheInvalidations(db, kv, searchEnv, { organizationId: 'changed' }), 1)
  assert.equal(await kv.get('public~org~v4~page'), 'cached public resource')
  assert.equal(await drainPublicResourceCacheInvalidations(db, kv, searchEnv, {}), 1)
  assert.equal(await kv.get('public~org~v4~page'), null)
  assert.equal(await kv.get('html:org.krabiclaw.com:/'), null)
})

test('a complete fresh reconciliation clears older terminal work, but no work cannot claim to repair it', async (t) => {
  const { db, kv } = await migratedCacheD1(t)
  const now = new Date('2026-09-29T04:30:00.000Z')
  await insertInvalidation(db, {
    id: 'old-failed', status: 'failed', attemptCount: 5,
    processedAt: '2026-09-28T04:30:00.000Z', createdAt: '2026-09-28T04:00:00.000Z',
  })
  await assert.rejects(
    drainPublicResourceCacheInvalidations(db, kv, searchEnv, { organizationId: 'org', now }),
    /failed cache or search index work remains/,
  )
  await insertInvalidation(db, {
    id: 'fresh', status: 'pending', attemptCount: 0, createdAt: '2026-09-29T04:00:00.000Z',
  })
  assert.equal(await drainPublicResourceCacheInvalidations(db, kv, searchEnv, { organizationId: 'org', now }), 1)
  const rows = await db.prepare("SELECT id, status, last_error FROM public_resource_cache_invalidations ORDER BY id")
    .all<{ id: string; status: string; last_error: string | null }>()
  assert.deepEqual(rows.results, [
    { id: 'fresh', status: 'processed', last_error: null },
    { id: 'old-failed', status: 'processed', last_error: null },
  ])
})

test('a global drain reports one failed organization after processing other organizations', async (t) => {
  const { db, kv } = await migratedCacheD1(t)
  await db.prepare("INSERT INTO organization (id, name, slug, subdomain) VALUES ('changed', 'Changed', 'changed', 'changed')").run()
  await insertInvalidation(db, {
    id: 'first', status: 'pending', attemptCount: 0, createdAt: '2026-09-29T04:00:00.000Z',
  })
  await db.prepare(`INSERT INTO public_resource_cache_invalidations
    (id, organization_id, reason, status, attempt_count, created_at)
    VALUES ('second', 'changed', 'test', 'pending', 0, '2026-09-29T04:01:00.000Z')`).run()
  await kv.put('public~changed~v4~page', 'old page')
  const failingKv = new Proxy(kv, {
    get(target, property) {
      if (property === 'list') return async (options: { prefix?: string }) => {
        if (options.prefix?.startsWith('public~org~')) throw new Error('injected org KV failure')
        return await target.list(options)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await assert.rejects(
    drainPublicResourceCacheInvalidations(db, failingKv, searchEnv, { now: new Date('2026-09-29T04:30:00.000Z') }),
    /injected org KV failure/,
  )
  assert.equal(await kv.get('public~changed~v4~page'), null)
  const rows = await db.prepare('SELECT id, status, attempt_count FROM public_resource_cache_invalidations ORDER BY id')
    .all<{ id: string; status: string; attempt_count: number }>()
  assert.deepEqual(rows.results, [
    { id: 'first', status: 'pending', attempt_count: 1 },
    { id: 'second', status: 'processed', attempt_count: 1 },
  ])
})

test('simultaneous drains cannot sync one organization out of order', async (t) => {
  const { db, kv } = await migratedCacheD1(t)
  await insertInvalidation(db, {
    id: 'first', status: 'pending', attemptCount: 0, createdAt: '2026-09-29T04:00:00.000Z',
  })
  let releaseFirst!: () => void
  let signalFirst!: () => void
  const firstEntered = new Promise<void>(resolve => { signalFirst = resolve })
  const firstMayFinish = new Promise<void>(resolve => { releaseFirst = resolve })
  let providerReads = 0
  const env: OrganizationChangeDrainEnv = {
    ...searchEnv,
    AI_SEARCH: {
      get: () => ({ items: {
        list: async () => {
          providerReads += 1
          if (providerReads === 1) {
            signalFirst()
            await firstMayFinish
          }
          return { result: [], result_info: { per_page: 50, total_count: 0 } }
        },
        upload: async () => ({}),
        delete: async () => ({}),
      } }),
    } as unknown as NonNullable<OrganizationChangeDrainEnv['AI_SEARCH']>,
  }
  const now = new Date('2026-09-29T04:30:00.000Z')
  const first = drainPublicResourceCacheInvalidations(db, kv, env, { organizationId: 'org', now })
  try {
    await firstEntered
    await insertInvalidation(db, {
      id: 'second', status: 'pending', attemptCount: 0, createdAt: '2026-09-29T04:01:00.000Z',
    })
    await assert.rejects(
      drainPublicResourceCacheInvalidations(db, kv, env, { organizationId: 'org', now }),
      /processing cache or search index work remains|pending cache or search index work remains/,
    )
    assert.equal(providerReads, 1)
    assert.deepEqual(await db.prepare("SELECT status, attempt_count FROM public_resource_cache_invalidations WHERE id = 'second'").first(),
      { status: 'pending', attempt_count: 0 })
  } finally {
    releaseFirst()
  }
  await assert.rejects(first, /pending cache or search index work remains/)
  assert.equal(await drainPublicResourceCacheInvalidations(db, kv, env, { organizationId: 'org', now }), 1)
  assert.equal(providerReads, 2)
})
