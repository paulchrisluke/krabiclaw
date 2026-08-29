import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'

function baselineDatabase() {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(readFileSync('migrations/0000_epoch_2_baseline.sql', 'utf8'))
  return database
}

test('epoch-2 baseline creates the complete schema from zero', () => {
  const database = baselineDatabase()
  try {
    const objectCounts = database.prepare(`
      SELECT type, count(*) count
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY type
    `).all() as Array<{ type: string; count: number }>
    assert.deepEqual(Object.fromEntries(objectCounts.map(row => [row.type, row.count])), {
      index: 268,
      table: 113,
      trigger: 1,
    })
    const ledgerCount = database.prepare("SELECT count(*) count FROM sqlite_schema WHERE name = 'd1_migrations'").get() as { count: number }
    assert.equal(ledgerCount.count, 0)
    assert.deepEqual(
      database.pragma('table_info(chowbot_channel_state)').filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name),
      ['user_id', 'channel'],
    )
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('epoch-2 baseline enforces canonical cross-scope and value constraints', () => {
  const database = baselineDatabase()
  try {
    database.prepare("INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')").run()
    database.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
    database.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site', 'org', 'site', 'site')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location', 'org', 'site', 'location', 'Location')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('other-location', 'org', 'site', 'other-location', 'Other location')").run()
    database.prepare(`
      INSERT INTO products (
        id, organization_id, site_id, location_id, category, name, slug,
        price_amount, sort_order, created_by, updated_by
      ) VALUES ('product', 'org', 'site', 'location', 'food', 'Product', 'product', '100', 0, 'user', 'user')
    `).run()

    assert.throws(
      () => database.prepare("INSERT INTO organization (id, name, slug) VALUES ('blank', 'Blank', '   ')").run(),
      /organization_slug_required_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO sites (id, organization_id, slug, default_currency) VALUES ('bad-currency', 'org', 'bad-currency', 'XYZ')").run(),
      /sites_default_currency_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source) VALUES ('video', 'org', 'site', 'video', 'cloudflare_r2', 'uploaded')").run(),
      /media_assets_video_thumbnail_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES ('bad-en', 'org', 'site', 'en', 0, 'disabled')").run(),
      /site_locales_english_source_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, rating) VALUES ('bad-review', 'org', 'site', 'other-location', 'product', 5)").run(),
      /FOREIGN KEY constraint failed/,
    )
    database.prepare("INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, rating) VALUES ('review', 'org', 'site', 'location', 'product', 5)").run()
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})
