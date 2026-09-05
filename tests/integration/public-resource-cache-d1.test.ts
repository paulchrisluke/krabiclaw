import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'

import { drainPublicResourceCacheInvalidations, purgePublicResourceCacheSafe } from '../../server/utils/public-resource-cache.ts'

async function migratedCacheD1() {
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
          SITE_CACHE: { type: 'kv' },
        },
      },
    }],
  })
  const db = await miniflare.getD1Database('DB')
  const kv = await miniflare.getKVNamespace('SITE_CACHE')
  for (const filename of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const migration = readFileSync(`migrations/${filename}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  }
  await db.prepare("INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')").run()
  await db.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
  await db.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site', 'org', 'site', 'site')").run()
  return { miniflare, db, kv }
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
      (id, site_id, reason, status, attempt_count, claimed_at, processed_at, created_at)
    VALUES (?, 'site', 'test', ?, ?, ?, ?, ?)
  `).bind(input.id, input.status, input.attemptCount, input.claimedAt ?? null, input.processedAt ?? null, input.createdAt).run()
}

test('cache invalidation drain enforces the durable work lifecycle', async (t) => {
  const { miniflare, db, kv } = await migratedCacheD1()
  try {
    await t.test('validates its domain before claiming work and purges both cache contracts', async () => {
      await insertInvalidation(db, {
        id: 'pending', status: 'pending', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z',
      })

      await assert.rejects(
        drainPublicResourceCacheInvalidations(db, kv, { freeSiteDomain: undefined }),
        /NUXT_PUBLIC_FREE_SITE_DOMAIN is required/,
      )
      const row = await db.prepare(`
        SELECT status, attempt_count FROM public_resource_cache_invalidations WHERE id = 'pending'
      `).first<{ status: string; attempt_count: number }>()
      assert.deepEqual(row, { status: 'pending', attempt_count: 0 })

      await kv.put('public~site~v3~page', 'public resource')
      await kv.put('html:site.krabiclaw.com:/', 'html')
      assert.equal(await drainPublicResourceCacheInvalidations(db, kv, {
        freeSiteDomain: 'https://krabiclaw.com',
      }), 1)
      assert.equal(await kv.get('public~site~v3~page'), null)
      assert.equal(await kv.get('html:site.krabiclaw.com:/'), null)
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

      assert.equal(await drainPublicResourceCacheInvalidations(db, failingKv, {
        now,
        freeSiteDomain: 'https://krabiclaw.com',
      }), 0)

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
  } finally {
    await miniflare.dispose()
  }
})


test('a site write purges that site despite an older invalidation for another site', async () => {
  const { miniflare, db, kv } = await migratedCacheD1()
  try {
    await db.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('changed', 'org', 'changed', 'changed')").run()
    await insertInvalidation(db, {
      id: 'older-other-site', status: 'pending', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z',
    })
    for (const site of ['site', 'changed']) {
      await kv.put(`public~${site}~v3~page`, 'cached public resource')
      await kv.put(`html:${site}.krabiclaw.com:/`, 'cached HTML')
    }
    await purgePublicResourceCacheSafe({ DB: db, SITE_CACHE: kv, NUXT_PUBLIC_FREE_SITE_DOMAIN: 'https://krabiclaw.com' }, 'changed')
    assert.equal(await kv.get('public~changed~v3~page'), null)
    assert.equal(await kv.get('html:changed.krabiclaw.com:/'), null)
    assert.equal(await kv.get('public~site~v3~page'), 'cached public resource')
    assert.equal(await kv.get('html:site.krabiclaw.com:/'), 'cached HTML')
    const rows = await db.prepare('SELECT site_id, status, attempt_count FROM public_resource_cache_invalidations ORDER BY site_id')
      .all<{ site_id: string; status: string; attempt_count: number }>()
    assert.deepEqual(rows.results, [
      { site_id: 'changed', status: 'processed', attempt_count: 1 },
      { site_id: 'site', status: 'pending', attempt_count: 0 },
    ])
    assert.equal(await drainPublicResourceCacheInvalidations(db, kv, { freeSiteDomain: 'https://krabiclaw.com' }), 1)
    assert.equal(await kv.get('public~site~v3~page'), null)
    assert.equal(await kv.get('html:site.krabiclaw.com:/'), null)
  } finally {
    await miniflare.dispose()
  }
})
