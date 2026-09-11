import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { orderForDrop } from '../../scripts/reset-d1.mjs'

test('preview reset drops populated bookings and review cycles, then replays the baseline with foreign keys enabled', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'preview-reset-test', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': {
      type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
    } } }, env: { DB: { type: 'd1' } },
  } }] })
  const baseline = readFileSync('migrations/0000_baseline.sql', 'utf8')
  try {
    const database = await runtime.getD1Database('DB')
    const baselineStatements = baseline.split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)
    await database.batch(baselineStatements.map(sql => database.prepare(sql)))
    assert.deepEqual(await database.prepare('PRAGMA foreign_keys').first(), { foreign_keys: 1 })
    await database.batch(`
      INSERT INTO organization (id, name, slug) VALUES ('org', 'Reset test', 'reset-test');
      INSERT INTO sites (id, organization_id, slug) VALUES ('site', 'org', 'reset-test');
      INSERT INTO business_locations (id, organization_id, site_id, slug, title)
        VALUES ('location', 'org', 'site', 'location', 'Location');
      INSERT INTO customers (id, organization_id, site_id, source)
        VALUES ('customer', 'org', 'site', 'reservation');
      INSERT INTO product_categories (
        id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_by, updated_by
      ) VALUES ('category', 'org', 'site', 'location', 'experience', 'Classes', 'classes', 0, 'actor', 'actor');
      INSERT INTO products (
        id, organization_id, site_id, location_id, category_id, product_type, name, slug,
        experience_json, sort_order, created_by, updated_by
      ) VALUES ('experience', 'org', 'site', 'location', 'category', 'experience', 'Class', 'class', '{}', 0, 'actor', 'actor');
    `.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => database.prepare(sql)))
    for (const kind of ['reservation', 'booking']) {
      await database.prepare(`
        INSERT INTO requests (
          id, kind, organization_id, site_id, location_id, product_id, customer_id,
          status, booking_date, time_slot, party_size, conversation_state, payload_json
        ) VALUES (?, ?, 'org', 'site', 'location', ?, 'customer', 'confirmed',
          '2026-09-10', '14:00', 2, 'needs_attention', ?)
      `).bind(kind, kind, kind === 'booking' ? 'experience' : null, JSON.stringify({
        guest: { name: 'Reset guest', email: 'reset@playwright.example', phone: '+66812345678' },
        party_size_is_minimum: false, cancellation: {}, completion: {}, review: {},
      })).run()
      await database.prepare(`
        INSERT INTO review_requests (
          id, organization_id, site_id, location_id, customer_id, booking_type, booking_id, token_hash, expires_at
        ) VALUES (?, 'org', 'site', 'location', 'customer', ?, ?, ?, '2026-10-01T00:00:00.000Z')
      `).bind(`invite-${kind}`, kind, kind, `token-${kind}`).run()
      await database.prepare(`
        INSERT INTO reviews (
          id, organization_id, site_id, location_id, customer_id, booking_id, booking_type, review_request_id, product_id, rating
        ) VALUES (?, 'org', 'site', 'location', 'customer', ?, ?, ?, ?, 5)
      `).bind(`review-${kind}`, kind, kind, `invite-${kind}`, kind === 'booking' ? 'experience' : null).run()
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
