import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { orderForDrop } from '../../scripts/reset-d1.mjs'

test('preview reset drops populated bookings and review cycles, then replays the baseline with foreign keys enabled', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'preview-reset-test', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': {
      type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
    } } }, env: { DB: { type: 'd1' } },
  } }] })
  try {
    const database = await runtime.getD1Database('DB')
    // Built from the schema rather than the committed baseline file: the reset
    // this proves runs against whatever the schema currently declares, and the
    // baseline is regenerated at each epoch cutover.
    const baselineStatements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await database.batch(baselineStatements.map(sql => database.prepare(sql)))
    assert.deepEqual(await database.prepare('PRAGMA foreign_keys').first(), { foreign_keys: 1 })
    await database.batch(`
      INSERT INTO organization (id, name, slug) VALUES ('org', 'Reset test', 'reset-test');
      INSERT INTO sites (id, organization_id, slug) VALUES ('site', 'org', 'reset-test');
      INSERT INTO business_locations (id, organization_id, site_id, slug, title)
        VALUES ('location', 'org', 'site', 'location', 'Location');
      INSERT INTO customers (id, organization_id, site_id, source)
        VALUES ('customer', 'org', 'site', 'reservation');
      INSERT INTO collections (id, organization_id, site_id, name, slug, sort_order, created_by, updated_by)
        VALUES ('collection', 'org', 'site', 'Classes', 'classes', 0, 'actor', 'actor');
      INSERT INTO products (id, organization_id, name, slug, created_by, updated_by)
        VALUES ('product', 'org', 'Class', 'class', 'actor', 'actor');
      INSERT INTO product_publications (organization_id, product_id, site_id, published, created_by, updated_by)
        VALUES ('org', 'product', 'site', 1, 'actor', 'actor');
      INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_by, updated_by)
        VALUES ('org', 'product', 'location', 1, 1, 'actor', 'actor');
      INSERT INTO product_variants (id, organization_id, product_id, name, created_by, updated_by)
        VALUES ('variant', 'org', 'product', 'Standard', 'actor', 'actor');
      INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_by, updated_by)
        VALUES ('product', 'org', 120, 8, 'actor', 'actor');
      INSERT INTO product_sessions (id, organization_id, product_id, location_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
        VALUES ('session', 'org', 'product', 'location', 'Asia/Bangkok', '2026-09-10T07:00:00.000Z', '2026-09-10T09:00:00.000Z', 8, 'scheduled', 'actor', 'actor');
      INSERT INTO location_reservation_configs (location_id, organization_id, slot_capacity, created_by, updated_by)
        VALUES ('location', 'org', 8, 'actor', 'actor');
    `.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => database.prepare(sql)))
    for (const kind of ['reservation', 'booking']) {
      await database.prepare(`
        INSERT INTO requests (
          id, kind, organization_id, site_id, location_id, customer_id, conversation_state, payload_json
        ) VALUES (?, ?, 'org', 'site', 'location', 'customer', 'needs_attention', ?)
      `).bind(kind, kind, JSON.stringify({
        guest: { name: 'Reset guest', email: 'reset@playwright.example', phone: '+66812345678' },
        party_size_is_minimum: false, notes: null, ip_hash: null, cancellation: {}, completion: {}, review: {},
      })).run()
      // The seats live on the booking or the reservation, so the populated
      // state this reset has to survive includes one of each.
      if (kind === 'booking') {
        await database.prepare(`
          INSERT INTO bookings (id, organization_id, site_id, product_id, product_session_id, product_variant_id, customer_id, request_id, party_size, status)
          VALUES ('booking-row', 'org', 'site', 'product', 'session', 'variant', 'customer', 'booking', 2, 'confirmed')
        `).run()
      } else {
        await database.prepare(`
          INSERT INTO reservations (id, organization_id, site_id, location_id, customer_id, request_id, timezone, starts_at, ends_at, party_size, status)
          VALUES ('reservation-row', 'org', 'site', 'location', 'customer', 'reservation', 'Asia/Bangkok', '2026-09-10T07:00:00.000Z', '2026-09-10T09:00:00.000Z', 2, 'confirmed')
        `).run()
      }
      await database.prepare(`
        INSERT INTO review_requests (
          id, organization_id, site_id, location_id, customer_id, booking_type, booking_id, token_hash, expires_at
        ) VALUES (?, 'org', 'site', 'location', 'customer', ?, ?, ?, '2026-10-01T00:00:00.000Z')
      `).bind(`invite-${kind}`, kind, kind, `token-${kind}`).run()
      await database.prepare(`
        INSERT INTO reviews (
          id, organization_id, site_id, location_id, customer_id, booking_id, booking_type, review_request_id, product_id, rating
        ) VALUES (?, 'org', 'site', 'location', 'customer', ?, ?, ?, ?, 5)
      `).bind(`review-${kind}`, kind, kind, `invite-${kind}`, kind === 'booking' ? 'product' : null).run()
      await database.prepare('UPDATE requests SET review_id = ? WHERE id = ?').bind(`review-${kind}`, kind).run()
    }
    assert.deepEqual((await database.prepare('PRAGMA foreign_key_check').all()).results, [])
    const { results: objects } = await database.prepare(`
      SELECT name, type, sql FROM sqlite_schema
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name
    `).all<{ name: string; type: 'table' | 'view'; sql: string }>()
    await database.batch([
      database.prepare('PRAGMA defer_foreign_keys = ON'),
      ...orderForDrop(objects).map(object => database.prepare(`DROP ${object.type.toUpperCase()} "${object.name.replaceAll('"', '""')}"`)),
      database.prepare('PRAGMA defer_foreign_keys = OFF'),
    ])
    assert.deepEqual(await database.prepare('PRAGMA foreign_keys').first(), { foreign_keys: 1 })
    assert.deepEqual((await database.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results, [])

    await database.batch(baselineStatements.map(sql => database.prepare(sql)))
    assert.deepEqual((await database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results, objects.map(({ name }) => ({ name })))
    assert.deepEqual((await database.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally {
    await runtime.dispose()
  }
})
