import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'

import { syncProducts } from '../../server/utils/product-management.ts'

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

async function seedProduct(db: D1Database, id: string, locationId = 'secondary') {
  await db.prepare(`
    INSERT INTO products (id, organization_id, site_id, location_id, category, name, slug, sort_order, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'org', 'site', ?, 'Food', ?, ?, 0, 'actor', 'actor', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).bind(id, locationId, id, id).run()
}

test('location-scoped Product writes never fall back to the primary location', async () => {
  const { miniflare, db } = await migratedD1()
  try {
    await seedProduct(db, 'secondary-owned')
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
