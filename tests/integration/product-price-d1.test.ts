import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'

import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { englishManifestHash, getProductCatalogLocalization } from '../../server/utils/localization.ts'
import {
  createProduct,
  createProductsBatch,
  getProduct,
  listLocationProducts,
  syncProducts,
  updateProduct,
} from '../../server/utils/product-management.ts'

async function migratedD1() {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
  })
  const db = await miniflare.getD1Database('DB')
  for (const filename of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const migration = readFileSync(`migrations/${filename}`, 'utf8')
    for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  }
  await db.prepare("INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')").run()
  await db.prepare("INSERT INTO user (id, name, email) VALUES ('actor', 'Actor', 'actor@example.com')").run()
  await db.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
  await db.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site', 'org', 'site', 'site')").run()
  await db.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('other-site', 'org', 'other-site', 'other-site')").run()
  await db.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('primary', 'org', 'site', 'primary', 'Primary')").run()
  await db.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('secondary', 'org', 'site', 'secondary', 'Secondary')").run()
  await db.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('other-site-location', 'org', 'other-site', 'other', 'Other')").run()
  await db.prepare("UPDATE sites SET primary_location_id = 'primary' WHERE id = 'site'").run()
  // Products need a category at their own location, so the fixture creates one
  // per location up front and every seeded Product references it.
  for (const [categoryId, siteId, locationId] of [
    ['cat-primary', 'site', 'primary'],
    ['cat-secondary', 'site', 'secondary'],
    ['cat-other-site', 'other-site', 'other-site-location'],
  ]) {
    await db.prepare(`
      INSERT INTO product_categories (id, organization_id, site_id, location_id, name, slug, sort_order, created_by, updated_by)
      VALUES (?, 'org', ?, ?, 'Food', 'food', 0, 'actor', 'actor')
    `).bind(categoryId, siteId, locationId).run()
  }
  return { miniflare, db }
}

const CATEGORY_FOR_LOCATION: Record<string, string> = {
  primary: 'cat-primary',
  secondary: 'cat-secondary',
  'other-site-location': 'cat-other-site',
}

async function seedProduct(db: D1Database, id: string, locationId = 'secondary', withPrice = false) {
  await db.prepare(`
    INSERT INTO products (id, organization_id, site_id, location_id, category_id, name, slug, sort_order, created_by, updated_by, created_at, updated_at)
    SELECT ?, organization_id, site_id, location_id, id, ?, ?, 0, 'actor', 'actor', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      FROM product_categories WHERE id = ?
  `).bind(id, id, id, CATEGORY_FOR_LOCATION[locationId]).run()
  if (withPrice) {
    await db.prepare(`
      INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, valid_from, provenance, created_by)
      SELECT ?, organization_id, site_id, location_id, id, 10000, 'THB', 'item', 'unspecified', '2026-01-01T00:00:00.000Z', 'manual', 'actor'
        FROM products WHERE id = ?
    `).bind(`${id}-price`, id).run()
  }
}

const fixedPrice = (amount: number, overrides: Record<string, unknown> = {}) => ({
  amount_minor: amount,
  currency: 'THB',
  unit: 'item',
  tax_behavior: 'unspecified',
  ...overrides,
})

// Wraps two references to the same D1Database so their first `.batch()` call
// each waits for the other to arrive before either proceeds — forces a real
// interleaving of both requests' batches instead of one finishing before the
// other starts.
function batchBarrierDatabases(db: D1Database): [D1Database, D1Database] {
  let arrivals = 0
  let release!: () => void
  const bothReady = new Promise<void>((resolve) => { release = resolve })
  const wrap = () => {
    let firstBatch = true
    return new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            if (firstBatch) {
              firstBatch = false
              arrivals += 1
              if (arrivals === 2) release()
              await bothReady
            }
            return await target.batch(statements)
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  return [wrap(), wrap()]
}

// Like batchBarrierDatabases, but deterministically orders the two batch
// commits instead of releasing them simultaneously: both callers must still
// finish their pre-batch reads first (so `later`'s snapshot is captured
// before `earlier` commits), but `earlier`'s batch is guaranteed to fully
// complete before `later`'s batch is allowed to run. Used to test both valid
// serial orderings of a race deterministically, rather than leaving which
// ordering gets exercised up to scheduler timing.
function orderedBatchBarrier(db: D1Database): { earlier: D1Database; later: D1Database } {
  let arrivals = 0
  let releaseBothArrived!: () => void
  const bothArrived = new Promise<void>((resolve) => { releaseBothArrived = resolve })
  let releaseEarlierDone!: () => void
  const earlierDone = new Promise<void>((resolve) => { releaseEarlierDone = resolve })
  const wrap = (role: 'earlier' | 'later') => {
    let firstBatch = true
    return new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            if (firstBatch) {
              firstBatch = false
              arrivals += 1
              if (arrivals === 2) releaseBothArrived()
              await bothArrived
              if (role === 'later') await earlierDone
            }
            const result = await target.batch(statements)
            if (role === 'earlier') releaseEarlierDone()
            return result
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  return { earlier: wrap('earlier'), later: wrap('later') }
}

async function assertOneWinner(first: Promise<unknown>, second: Promise<unknown>): Promise<number> {
  const results = await Promise.allSettled([first, second])
  const summary = results.map(result => result.status === 'fulfilled' ? 'fulfilled' : String(result.reason))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, summary.join('\n'))
  assert.equal(results.filter(result => result.status === 'rejected').length, 1, summary.join('\n'))
  const rejection = results.find(result => result.status === 'rejected')
  assert.equal(rejection?.status === 'rejected' ? (rejection.reason as { status?: number }).status : undefined, 409, summary.join('\n'))
  return results.findIndex(result => result.status === 'fulfilled')
}

async function assertPriceRows(
  db: D1Database,
  productId: string,
  expected: { total: number; active: number; ended: number; scheduled: number },
) {
  const rows = await db.prepare(`
    SELECT id, valid_from, valid_until,
      CASE WHEN valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND (valid_until IS NULL OR valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) THEN 1 ELSE 0 END AS active,
      CASE WHEN valid_until IS NOT NULL AND valid_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END AS ended,
      CASE WHEN valid_from > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END AS scheduled
    FROM prices WHERE product_id = ? ORDER BY valid_from, id
  `).bind(productId).all<{ id: string; valid_from: string; valid_until: string | null; active: number; ended: number; scheduled: number }>()
  assert.equal(rows.results.length, expected.total, JSON.stringify(rows.results))
  assert.equal(rows.results.reduce((sum, row) => sum + Number(row.active), 0), expected.active, JSON.stringify(rows.results))
  assert.equal(rows.results.reduce((sum, row) => sum + Number(row.ended), 0), expected.ended, JSON.stringify(rows.results))
  assert.equal(rows.results.reduce((sum, row) => sum + Number(row.scheduled), 0), expected.scheduled, JSON.stringify(rows.results))

  const overlap = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM prices left_price
    JOIN prices right_price ON right_price.product_id = left_price.product_id AND right_price.id > left_price.id
    WHERE left_price.product_id = ?
      AND left_price.valid_from < COALESCE(right_price.valid_until, '9999-12-31T23:59:59.999Z')
      AND right_price.valid_from < COALESCE(left_price.valid_until, '9999-12-31T23:59:59.999Z')
  `).bind(productId).first<{ count: number }>()
  assert.equal(Number(overlap?.count ?? -1), 0)
}

// Confirms the losing racer's whole batch rolled back, not just its Price
// write: the product row's own content fields must reflect only the winner's
// input, never a mix of both requests' distinguishable `name` values.
async function assertWinnerOnly(db: D1Database, productId: string, expectedName: string) {
  const row = await db.prepare('SELECT name FROM products WHERE id = ?').bind(productId).first<{ name: string }>()
  assert.equal(row?.name, expectedName)
}

async function countCacheInvalidations(db: D1Database, siteId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM public_resource_cache_invalidations WHERE site_id = ?').bind(siteId).first<{ count: number }>()
  return Number(row?.count ?? 0)
}

test('location-scoped Product writes never fall back to the primary location', async () => {
  const { miniflare, db } = await migratedD1()
  try {
    await seedProduct(db, 'secondary-owned')
    await seedProduct(db, 'other-site-owned', 'other-site-location', true)
    assert.equal((await db.prepare("SELECT site_id FROM prices WHERE product_id = 'other-site-owned'").first<{ site_id: string }>())?.site_id, 'other-site')
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'secondary', [{ product_id: 'other-site-owned', category_id: 'cat-secondary', name: 'Wrong site', price: null }], { actorId: 'actor' }),
      /not found at this location/i,
    )
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'primary', [{ product_id: 'secondary-owned', category_id: 'cat-secondary', name: 'Wrong target', price: null }], { actorId: 'actor' }),
      /not found at this location/i,
    )
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'missing-location', [], { actorId: 'actor' }),
      /Location not found/i,
    )
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'other-site-location', [], { actorId: 'actor' }),
      /Location not found/i,
    )
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'secondary', [{ product_id: '   ', category_id: 'cat-secondary', name: 'Blank ID', price: null }], { actorId: 'actor' }),
      /non-empty string/i,
    )

    const stored = await db.prepare("SELECT location_id, name FROM products WHERE id = 'secondary-owned'").first<{ location_id: string; name: string }>()
    assert.deepEqual(stored, { location_id: 'secondary', name: 'secondary-owned' })
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})

test('Product writes preserve nullable Price semantics through D1', async () => {
  const { miniflare, db } = await migratedD1()
  const attribution = { actorId: 'actor' }
  const env: CloudflareEnv = {
    DB: db,
    BETTER_AUTH_SECRET: 'test-secret',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
  }
  try {
    await db.prepare("UPDATE sites SET default_currency = 'THB' WHERE id = 'site'").run()

    const created = await createProduct(db, 'org', 'site', 'secondary', {
      category_id: 'cat-secondary',
      name: 'Market fish',
      price: null,
      details: [{ key: 'price-note', label: 'Price', values: ['Market Price'] }],
    }, attribution, env)
    assert.equal(created.price, null)
    assert.equal((await getProduct(db, 'org', 'site', 'secondary', created.id))?.price, null)
    assert.equal((await listLocationProducts(db, 'org', 'site', 'secondary')).find(product => product.id === created.id)?.price, null)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM prices WHERE product_id = ?').bind(created.id).first<{ count: number }>())?.count, 0)

    const fixed = await syncProducts(db, 'org', 'site', 'secondary', [{
      product_id: created.id,
      category_id: created.category_id,
      name: created.name,
      price: { amount_minor: 0, valid_from: '2026-01-02T00:00:00.000Z' },
      details: [],
    }], attribution)
    assert.equal(fixed[0]?.price?.amount_minor, 0)
    assert.equal(fixed[0]?.price?.currency, 'THB')
    assert.equal(fixed[0]?.price?.unit, 'item')
    assert.equal(fixed[0]?.price?.tax_behavior, 'unspecified')

    const cleared = await syncProducts(db, 'org', 'site', 'secondary', [{
      product_id: created.id,
      category_id: created.category_id,
      name: created.name,
      price: null,
    }], attribution)
    assert.equal(cleared[0]?.price, null)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM prices WHERE product_id = ? AND valid_until IS NULL').bind(created.id).first<{ count: number }>())?.count, 0)

    const batched = await createProductsBatch(db, 'org', 'site', 'secondary', [
      { category_id: 'cat-secondary', name: 'Fixed', price: { amount_minor: 500, valid_from: '2026-01-03T00:00:00.000Z' } },
      { category_id: 'cat-secondary', name: 'No fixed price', price: null },
    ], attribution)
    assert.equal(batched.length, 2)
    const fixedProduct = batched[0]
    assert.ok(fixedProduct)
    assert.equal(fixedProduct.price?.currency, 'THB')
    assert.equal(batched[1]?.price, null)

    const unchanged = await updateProduct(db, 'org', 'site', 'secondary', fixedProduct.id, { name: 'Fixed renamed' }, attribution, env)
    assert.equal(unchanged.price?.amount_minor, 500)
    const removed = await updateProduct(db, 'org', 'site', 'secondary', fixedProduct.id, { price: null }, attribution, env)
    assert.equal(removed.price, null)
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})

test('Product imports commit categories and Products atomically, including concurrent conflicts', async () => {
  const { miniflare, db } = await migratedD1()
  const attribution = { actorId: 'actor', priceProvenance: 'ai-import' as const }
  try {
    for (const rejected of [
      [{ category: 'New section', name: 'Valid', price: null }, { category: 'x'.repeat(201), name: 'Invalid category', price: null }],
      [{ category: 'New section', name: 'x'.repeat(241), price: null }],
    ]) {
      await assert.rejects(createProductsBatch(db, 'org', 'site', 'secondary', rejected, attribution))
      assert.equal((await db.prepare("SELECT COUNT(*) count FROM product_categories WHERE location_id = 'secondary'").first<{ count: number }>())?.count, 1)
      assert.equal((await db.prepare('SELECT COUNT(*) count FROM products').first<{ count: number }>())?.count, 0)
    }

    const imported = await createProductsBatch(db, 'org', 'site', 'secondary', [
      { category: 'Small Plates', name: 'One', price: { amount_minor: 100, valid_from: '2026-01-01T00:00:00.000Z' } },
      { category: 'small-plates', name: 'Two', price: null },
      { category: 'Small Plates', name: 'Three', price: null },
    ], attribution)
    assert.deepEqual(imported.map(product => [product.category.slug, product.sort_order]), [['small-plates', 0], ['small-plates', 1], ['small-plates-2', 0]])
    assert.equal(imported[0]?.price?.amount_minor, 100)

    const racers = batchBarrierDatabases(db)
    const outcomes = await Promise.allSettled(racers.map((connection, index) => createProductsBatch(connection, 'org', 'site', 'secondary', [
      { category: `Import ${index}`, name: `Private ${index}`, price: null },
      { category: 'Shared section', name: `Shared ${index}`, price: null },
    ], attribution)))
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    const winner = outcomes.findIndex(outcome => outcome.status === 'fulfilled')
    const names = (await db.prepare("SELECT name FROM product_categories WHERE name LIKE 'Import %' OR name = 'Shared section' ORDER BY name").all<{ name: string }>()).results.map(row => row.name)
    assert.deepEqual(names, [`Import ${winner}`, 'Shared section'])
    assert.equal((await db.prepare('SELECT COUNT(*) count FROM products').first<{ count: number }>())?.count, 5)
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})

test('Product catalog localization reads category records from the current schema', async () => {
  const { miniflare, db } = await migratedD1()
  try {
    await seedProduct(db, 'localized-product')
    await db.prepare("INSERT INTO organization_billing (organization_id, access_plan) VALUES ('org', 'growth')").run()
    await db.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES ('en', 'org', 'site', 'en', 1, 'published'), ('th', 'org', 'site', 'th', 0, 'published')").run()
    await db.prepare("INSERT INTO platform_locale_catalogs (locale, label, direction, status, source_manifest_hash, created_by_user_id, updated_by_user_id) VALUES ('th', 'Thai', 'ltr', 'available', ?, 'actor', 'actor')").bind(await englishManifestHash()).run()
    await db.prepare("INSERT INTO site_language_licenses (id, organization_id, site_id, locale, status) VALUES ('license', 'org', 'site', 'th', 'active')").run()
    const catalog = await getProductCatalogLocalization(db, 'org', 'site', 'th')
    assert.deepEqual(catalog.products, [{
      id: 'localized-product', location_id: 'secondary', category_id: 'cat-secondary',
      category: { id: 'cat-secondary', name: 'Food', slug: 'food', sort_order: 0 },
      source: { name: 'localized-product', description: '' }, localization: null,
    }])
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})

test('concurrent Price mutations remain atomic under D1 batch semantics', async () => {
  const { miniflare, db } = await migratedD1()
  const env: CloudflareEnv = {
    DB: db,
    BETTER_AUTH_SECRET: 'test-secret',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
  }
  try {
    await seedProduct(db, 'replace-replace', 'secondary', true)
    let [firstDb, secondDb] = batchBarrierDatabases(db)
    let invalidationsBefore = await countCacheInvalidations(db, 'site')
    const replaceReplaceWinner = await assertOneWinner(
      syncProducts(firstDb, 'org', 'site', 'secondary', [{ product_id: 'replace-replace', category_id: 'cat-secondary', name: 'replace-replace-A', price: fixedPrice(11000) }], { actorId: 'actor' }),
      syncProducts(secondDb, 'org', 'site', 'secondary', [{ product_id: 'replace-replace', category_id: 'cat-secondary', name: 'replace-replace-B', price: fixedPrice(12000) }], { actorId: 'actor' }),
    )
    await assertPriceRows(db, 'replace-replace', { total: 2, active: 1, ended: 1, scheduled: 0 })
    await assertWinnerOnly(db, 'replace-replace', replaceReplaceWinner === 0 ? 'replace-replace-A' : 'replace-replace-B')
    // The loser's cache-invalidation insert is part of its own rejected
    // batch — only the winner's should have committed.
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    await seedProduct(db, 'replace-clear', 'secondary', true)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const replaceClearWinner = await assertOneWinner(
      syncProducts(firstDb, 'org', 'site', 'secondary', [{ product_id: 'replace-clear', category_id: 'cat-secondary', name: 'replace-clear-A', price: fixedPrice(11000) }], { actorId: 'actor' }),
      syncProducts(secondDb, 'org', 'site', 'secondary', [{ product_id: 'replace-clear', category_id: 'cat-secondary', name: 'replace-clear-B', price: null }], { actorId: 'actor' }),
    )
    await assertPriceRows(db, 'replace-clear', replaceClearWinner === 0
      ? { total: 2, active: 1, ended: 1, scheduled: 0 }
      : { total: 1, active: 0, ended: 1, scheduled: 0 })
    await assertWinnerOnly(db, 'replace-clear', replaceClearWinner === 0 ? 'replace-clear-A' : 'replace-clear-B')
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    await seedProduct(db, 'null-fixed', 'secondary', false)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const nullFixedWinner = await assertOneWinner(
      syncProducts(firstDb, 'org', 'site', 'secondary', [{ product_id: 'null-fixed', category_id: 'cat-secondary', name: 'null-fixed-A', price: fixedPrice(11000) }], { actorId: 'actor' }),
      syncProducts(secondDb, 'org', 'site', 'secondary', [{ product_id: 'null-fixed', category_id: 'cat-secondary', name: 'null-fixed-B', price: fixedPrice(12000) }], { actorId: 'actor' }),
    )
    await assertPriceRows(db, 'null-fixed', { total: 1, active: 1, ended: 0, scheduled: 0 })
    await assertWinnerOnly(db, 'null-fixed', nullFixedWinner === 0 ? 'null-fixed-A' : 'null-fixed-B')
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    await seedProduct(db, 'scheduled', 'secondary', false)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const scheduledWinner = await assertOneWinner(
      syncProducts(firstDb, 'org', 'site', 'secondary', [{ product_id: 'scheduled', category_id: 'cat-secondary', name: 'scheduled-A', price: fixedPrice(11000, { valid_from: '2030-01-01T00:00:00.000Z', valid_until: '2030-12-01T00:00:00.000Z' }) }], { actorId: 'actor' }),
      syncProducts(secondDb, 'org', 'site', 'secondary', [{ product_id: 'scheduled', category_id: 'cat-secondary', name: 'scheduled-B', price: fixedPrice(12000, { valid_from: '2030-06-01T00:00:00.000Z', valid_until: '2031-01-01T00:00:00.000Z' }) }], { actorId: 'actor' }),
    )
    await assertPriceRows(db, 'scheduled', { total: 1, active: 0, ended: 0, scheduled: 1 })
    await assertWinnerOnly(db, 'scheduled', scheduledWinner === 0 ? 'scheduled-A' : 'scheduled-B')
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    await seedProduct(db, 'update-replace', 'secondary', true)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const updateReplaceWinner = await assertOneWinner(
      updateProduct(firstDb, 'org', 'site', 'secondary', 'update-replace', { name: 'update-replace-A', price: fixedPrice(11000) }, { actorId: 'actor' }, env),
      updateProduct(secondDb, 'org', 'site', 'secondary', 'update-replace', { name: 'update-replace-B', price: fixedPrice(12000) }, { actorId: 'actor' }, env),
    )
    await assertPriceRows(db, 'update-replace', { total: 2, active: 1, ended: 1, scheduled: 0 })
    await assertWinnerOnly(db, 'update-replace', updateReplaceWinner === 0 ? 'update-replace-A' : 'update-replace-B')
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    // Verifies sync_products' complete-state contract for a row asserting
    // the *same* fixed Price (no close/insert queued) raced against a
    // concurrent replacement of that Price. Unlike the races above, this
    // pair is not mutually exclusive — the no-op racer never writes to
    // `prices`, so if it commits first there is a valid serial order where
    // both succeed. What must never happen is the no-op racer reporting
    // success while asserting a Price that was already replaced by the time
    // its guarded batch ran. Both valid orderings are exercised explicitly
    // (deterministically, not left to scheduler timing) with orderedBatchBarrier.

    // Ordering 1: same-price commits first, then the replacement — a valid
    // serial order, so both must succeed.
    await seedProduct(db, 'same-price-first', 'secondary', true)
    let ordered = orderedBatchBarrier(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const [samePriceFirstOutcome, replacementAfterOutcome] = await Promise.allSettled([
      syncProducts(ordered.earlier, 'org', 'site', 'secondary', [{ product_id: 'same-price-first', category_id: 'cat-secondary', name: 'same-price-first-A', price: fixedPrice(10000) }], { actorId: 'actor' }),
      syncProducts(ordered.later, 'org', 'site', 'secondary', [{ product_id: 'same-price-first', category_id: 'cat-secondary', name: 'same-price-first-B', price: fixedPrice(15000) }], { actorId: 'actor' }),
    ])
    assert.equal(samePriceFirstOutcome.status, 'fulfilled', JSON.stringify(samePriceFirstOutcome))
    assert.equal(replacementAfterOutcome.status, 'fulfilled', JSON.stringify(replacementAfterOutcome))
    await assertPriceRows(db, 'same-price-first', { total: 2, active: 1, ended: 1, scheduled: 0 })
    await assertWinnerOnly(db, 'same-price-first', 'same-price-first-B')
    // Both requests are a valid serial order here, so both cache-invalidation
    // inserts should have committed.
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 2)

    // Ordering 2: the replacement commits first, then the (now stale)
    // same-price assertion — its exact snapshot no longer matches, so its
    // guarded batch must abort entirely and it must report 409.
    await seedProduct(db, 'replacement-first', 'secondary', true)
    ordered = orderedBatchBarrier(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const [replacementFirstOutcome, samePriceAfterOutcome] = await Promise.allSettled([
      syncProducts(ordered.earlier, 'org', 'site', 'secondary', [{ product_id: 'replacement-first', category_id: 'cat-secondary', name: 'replacement-first-B', price: fixedPrice(15000) }], { actorId: 'actor' }),
      syncProducts(ordered.later, 'org', 'site', 'secondary', [{ product_id: 'replacement-first', category_id: 'cat-secondary', name: 'replacement-first-A', price: fixedPrice(10000) }], { actorId: 'actor' }),
    ])
    assert.equal(replacementFirstOutcome.status, 'fulfilled', JSON.stringify(replacementFirstOutcome))
    assert.equal(samePriceAfterOutcome.status, 'rejected', JSON.stringify(samePriceAfterOutcome))
    assert.equal(samePriceAfterOutcome.status === 'rejected' ? (samePriceAfterOutcome.reason as { status?: number }).status : undefined, 409)
    await assertPriceRows(db, 'replacement-first', { total: 2, active: 1, ended: 1, scheduled: 0 })
    await assertWinnerOnly(db, 'replacement-first', 'replacement-first-B')
    // The later (stale) request's whole batch — including its own
    // cache-invalidation insert — must have rolled back.
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)

    // Verifies a rejected sync_products batch is atomic beyond the specific
    // Product/Price row it races on: the same batch also carries the dense
    // reorder write and (when requested) the omitted-products availability
    // write, both scoped to the whole location. A rejected batch must leave
    // an unrelated sibling Product's sort_order and available exactly where
    // the winning request left them, never applying what the losing
    // request's own reorder/availability writes intended.
    await seedProduct(db, 'atomicity-target', 'secondary', true)
    await seedProduct(db, 'atomicity-sibling', 'secondary', false)
    await db.prepare("UPDATE products SET sort_order = 9, available = 1 WHERE id = 'atomicity-sibling'").run()
    ordered = orderedBatchBarrier(db)
    invalidationsBefore = await countCacheInvalidations(db, 'site')
    const [atomicityWinnerOutcome, atomicityLoserOutcome] = await Promise.allSettled([
      syncProducts(ordered.earlier, 'org', 'site', 'secondary', [
        { product_id: 'atomicity-target', category_id: 'cat-secondary', name: 'atomicity-target-winner', price: fixedPrice(20000) },
        { product_id: 'atomicity-sibling', category_id: 'cat-secondary', name: 'atomicity-sibling', price: null },
      ], { actorId: 'actor' }),
      syncProducts(ordered.later, 'org', 'site', 'secondary', [
        { product_id: 'atomicity-sibling', category_id: 'cat-secondary', name: 'atomicity-sibling', price: null, available: false },
        { product_id: 'atomicity-target', category_id: 'cat-secondary', name: 'atomicity-target-loser', price: fixedPrice(30000) },
      ], { actorId: 'actor' }),
    ])
    assert.equal(atomicityWinnerOutcome.status, 'fulfilled', JSON.stringify(atomicityWinnerOutcome))
    assert.equal(atomicityLoserOutcome.status, 'rejected', JSON.stringify(atomicityLoserOutcome))
    assert.equal(atomicityLoserOutcome.status === 'rejected' ? (atomicityLoserOutcome.reason as { status?: number }).status : undefined, 409)
    await assertWinnerOnly(db, 'atomicity-target', 'atomicity-target-winner')
    // Winner listed target first (sort_order 0), sibling second (sort_order
    // 1) — the loser's reversed order and available=false must never have
    // applied, since its batch rolled back entirely alongside its Price write.
    const siblingRow = await db.prepare("SELECT sort_order, available FROM products WHERE id = 'atomicity-sibling'").first<{ sort_order: number; available: number }>()
    assert.equal(siblingRow?.sort_order, 1)
    assert.equal(siblingRow?.available, 1)
    assert.equal(await countCacheInvalidations(db, 'site'), invalidationsBefore + 1)
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})
