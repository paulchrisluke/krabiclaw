import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'

import { syncProducts, updateProduct } from '../../server/utils/product-management.ts'

const fixedPrice = (amount: number, overrides: Record<string, unknown> = {}) => ({
  amount_minor: amount,
  currency: 'THB',
  unit: 'item',
  tax_behavior: 'unspecified',
  ...overrides,
})

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
  return { miniflare, db }
}

async function seedProduct(db: D1Database, id: string, locationId = 'secondary', withPrice = true) {
  await db.prepare(`
    INSERT INTO products (id, organization_id, site_id, location_id, category, name, slug, sort_order, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'org', 'site', ?, 'Food', ?, ?, 0, 'actor', 'actor', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).bind(id, locationId, id, id).run()
  if (withPrice) {
    await db.prepare(`
      INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, valid_from, provenance, created_by)
      VALUES (?, 'org', 'site', ?, ?, 10000, 'THB', 'item', 'unspecified', '2026-01-01T00:00:00.000Z', 'manual', 'actor')
    `).bind(`${id}-price`, locationId, id).run()
  }
}

function syncOne(db: D1Database, productId: string, price: ReturnType<typeof fixedPrice> | null) {
  return syncProducts(db, 'org', 'site', 'secondary', [{
    product_id: productId,
    category: 'Food',
    name: productId,
    price,
  }], { actorId: 'actor' })
}

function updateOne(db: D1Database, productId: string, price: ReturnType<typeof fixedPrice> | null) {
  return updateProduct(
    db,
    'org',
    'site',
    'secondary',
    productId,
    { price } as Parameters<typeof updateProduct>[5],
    { actorId: 'actor' },
    {} as Parameters<typeof updateProduct>[7],
  )
}

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

async function assertOneWinner(first: Promise<unknown>, second: Promise<unknown>) {
  const results = await Promise.allSettled([first, second])
  const summary = results.map(result => result.status === 'fulfilled' ? 'fulfilled' : String(result.reason))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, summary.join('\n'))
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
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

test('D1 atomically rejects stale and overlapping Product Price writes', async () => {
  const { miniflare, db } = await migratedD1()
  try {
    await seedProduct(db, 'replace-replace')
    let [firstDb, secondDb] = batchBarrierDatabases(db)
    await assertOneWinner(syncOne(firstDb, 'replace-replace', fixedPrice(11000)), syncOne(secondDb, 'replace-replace', fixedPrice(12000)))
    await assertPriceRows(db, 'replace-replace', { total: 2, active: 1, ended: 1, scheduled: 0 })

    await seedProduct(db, 'replace-clear')
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    const replaceClearWinner = await assertOneWinner(syncOne(firstDb, 'replace-clear', fixedPrice(11000)), syncOne(secondDb, 'replace-clear', null))
    await assertPriceRows(db, 'replace-clear', replaceClearWinner === 0
      ? { total: 2, active: 1, ended: 1, scheduled: 0 }
      : { total: 1, active: 0, ended: 1, scheduled: 0 })

    await seedProduct(db, 'null-fixed', 'secondary', false)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    await assertOneWinner(syncOne(firstDb, 'null-fixed', fixedPrice(11000)), syncOne(secondDb, 'null-fixed', fixedPrice(12000)))
    await assertPriceRows(db, 'null-fixed', { total: 1, active: 1, ended: 0, scheduled: 0 })

    await seedProduct(db, 'scheduled', 'secondary', false)
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    await assertOneWinner(
      syncOne(firstDb, 'scheduled', fixedPrice(11000, { valid_from: '2030-01-01T00:00:00.000Z', valid_until: '2030-12-01T00:00:00.000Z' })),
      syncOne(secondDb, 'scheduled', fixedPrice(12000, { valid_from: '2030-06-01T00:00:00.000Z', valid_until: '2031-01-01T00:00:00.000Z' })),
    )
    await assertPriceRows(db, 'scheduled', { total: 1, active: 0, ended: 0, scheduled: 1 })

    await seedProduct(db, 'update-replace')
    ;[firstDb, secondDb] = batchBarrierDatabases(db)
    await assertOneWinner(updateOne(firstDb, 'update-replace', fixedPrice(11000)), updateOne(secondDb, 'update-replace', fixedPrice(12000)))
    await assertPriceRows(db, 'update-replace', { total: 2, active: 1, ended: 1, scheduled: 0 })

    await assert.rejects(
      db.prepare(`INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, valid_from, valid_until, provenance, created_by)
        VALUES ('forced-overlap', 'org', 'site', 'secondary', 'scheduled', 9000, 'THB', 'item', 'unspecified', '2030-02-01T00:00:00.000Z', '2030-08-01T00:00:00.000Z', 'manual', 'actor')`).run(),
      /prices_overlap/,
    )
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})

test('location-scoped Product writes never fall back to the primary location', async () => {
  const { miniflare, db } = await migratedD1()
  try {
    await seedProduct(db, 'secondary-owned', 'secondary', false)
    await assert.rejects(
      syncProducts(db, 'org', 'site', 'primary', [{ product_id: 'secondary-owned', category: 'Food', name: 'Wrong target', price: null }], { actorId: 'actor' }),
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
      syncProducts(db, 'org', 'site', 'secondary', [{ product_id: '   ', category: 'Food', name: 'Blank ID', price: null }], { actorId: 'actor' }),
      /non-empty string/i,
    )

    const stored = await db.prepare("SELECT location_id, name FROM products WHERE id = 'secondary-owned'").first<{ location_id: string; name: string }>()
    assert.deepEqual(stored, { location_id: 'secondary', name: 'secondary-owned' })
  } finally {
    await Promise.race([miniflare.dispose(), new Promise(resolve => setTimeout(resolve, 2_000))])
  }
})
