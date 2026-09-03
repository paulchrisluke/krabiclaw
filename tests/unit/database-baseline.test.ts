import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'

function baselineDatabase() {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(readFileSync('migrations/0000_epoch_3_baseline.sql', 'utf8'))
  return database
}

function migratedDatabase() {
  const database = baselineDatabase()
  database.exec(readFileSync('migrations/0001_product_order_index.sql', 'utf8'))
  database.exec(readFileSync('migrations/0002_busy_dust.sql', 'utf8'))
  database.exec(readFileSync('migrations/0003_flawless_nocturne.sql', 'utf8'))
  return database
}

test('epoch-3 baseline creates the complete schema from zero', () => {
  const database = baselineDatabase()
  try {
    const objectCounts = database.prepare(`
      SELECT type, count(*) count
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY type
    `).all() as Array<{ type: string; count: number }>
    assert.deepEqual(Object.fromEntries(objectCounts.map(row => [row.type, row.count])), {
      index: 244,
      table: 103,
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

test('epoch-3 baseline enforces canonical cross-scope and value constraints', () => {
  const database = migratedDatabase()
  try {
    database.prepare("INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')").run()
    database.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
    database.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site', 'org', 'site', 'site')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location', 'org', 'site', 'location', 'Location')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('other-location', 'org', 'site', 'other-location', 'Other location')").run()
    database.prepare(`
      INSERT INTO products (
        id, organization_id, site_id, location_id, category, name, slug,
        sort_order, created_by, updated_by
      ) VALUES ('product', 'org', 'site', 'location', 'food', 'Product', 'product', 0, 'user', 'user')
    `).run()
    database.prepare(`INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, valid_from, provenance, created_by)
      VALUES ('price', 'org', 'site', 'location', 'product', 10000, 'THB', 'item', 'unspecified', '2026-01-01T00:00:00.000Z', 'test', 'user')`).run()

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

    database.prepare("INSERT INTO product_menu_placements (id, organization_id, site_id, location_id, product_id, section, sort_order, created_by, updated_by) VALUES ('placement', 'org', 'site', 'location', 'product', 'Mains', 0, 'user', 'user')").run()
    database.prepare("INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, updated_by) VALUES ('channel', 'org', 'site', 'location', 'product', 'ordering', 'user')").run()
    database.prepare("INSERT INTO modifier_groups (id, organization_id, site_id, location_id, name, minimum_selections, maximum_selections, created_by, updated_by) VALUES ('group', 'org', 'site', 'location', 'Heat', 1, 1, 'user', 'user')").run()
    database.prepare("INSERT INTO modifier_options (id, organization_id, site_id, location_id, modifier_group_id, name, price_delta_minor, created_by, updated_by) VALUES ('option', 'org', 'site', 'location', 'group', 'Hot', 100, 'user', 'user')").run()
    database.prepare("INSERT INTO product_modifier_groups (id, organization_id, site_id, location_id, product_id, modifier_group_id) VALUES ('link', 'org', 'site', 'location', 'product', 'group')").run()
    database.prepare("INSERT INTO catalog_provider_mappings (id, organization_id, site_id, location_id, resource_type, resource_id, provider, external_id) VALUES ('mapping', 'org', 'site', 'location', 'product', 'product', 'merchant', 'external-product')").run()

    database.prepare("INSERT INTO inventory_authorities (id, organization_id, site_id, location_id, authority_type, created_by, updated_by) VALUES ('authority', 'org', 'site', 'location', 'krabiclaw', 'user', 'user')").run()
    database.prepare("INSERT INTO inventory_items (id, organization_id, site_id, location_id, product_id, authority_id, quantity_on_hand, quantity_reserved, revision, state) VALUES ('inventory', 'org', 'site', 'location', 'product', 'authority', 5, 2, 1, 'current')").run()
    database.prepare("INSERT INTO inventory_movements (id, organization_id, site_id, location_id, product_id, inventory_item_id, authority_id, movement_type, quantity_on_hand_delta, quantity_reserved_delta, resulting_quantity_on_hand, resulting_quantity_reserved, base_revision, resulting_revision, actor_type, actor_id, idempotency_key) VALUES ('movement', 'org', 'site', 'location', 'product', 'inventory', 'authority', 'reserve', 0, 2, 5, 2, 0, 1, 'system', 'checkout', 'reserve-order')").run()

    assert.throws(
      () => database.prepare("INSERT INTO inventory_authorities (id, organization_id, site_id, location_id, authority_type, provider, created_by, updated_by) VALUES ('invalid-external', 'org', 'site', 'other-location', 'external', 'provider', 'user', 'user')").run(),
      /inventory_authorities_configuration_check/,
    )
    assert.throws(
      () => database.prepare("UPDATE inventory_items SET quantity_reserved = 6 WHERE id = 'inventory'").run(),
      /inventory_items_quantity_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO inventory_movements (id, organization_id, site_id, location_id, product_id, inventory_item_id, authority_id, movement_type, quantity_on_hand_delta, quantity_reserved_delta, resulting_quantity_on_hand, resulting_quantity_reserved, base_revision, resulting_revision, actor_type, actor_id, idempotency_key) VALUES ('bad-revision', 'org', 'site', 'location', 'product', 'inventory', 'authority', 'reserve', 0, 1, 5, 3, 1, 3, 'system', 'checkout', 'bad-revision')").run(),
      /inventory_movements_revision_check/,
    )

    assert.throws(
      () => database.prepare("INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, updated_by) VALUES ('cross-scope', 'org', 'site', 'other-location', 'product', 'seo', 'user')").run(),
      /FOREIGN KEY constraint failed/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO modifier_options (id, organization_id, site_id, location_id, modifier_group_id, name, created_by, updated_by) VALUES ('cross-option', 'org', 'site', 'other-location', 'group', 'Invalid', 'user', 'user')").run(),
      /FOREIGN KEY constraint failed/,
    )
    database.prepare("DELETE FROM reviews WHERE product_id = 'product'").run()
    database.prepare("DELETE FROM products WHERE id = 'product'").run()
    assert.equal((database.prepare("SELECT count(*) count FROM inventory_items WHERE id = 'inventory'").get() as { count: number }).count, 0)
    assert.equal((database.prepare("SELECT count(*) count FROM inventory_movements WHERE id = 'movement'").get() as { count: number }).count, 1)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('epoch-3 leaves extensible application registries out of database CHECK constraints', () => {
  const database = baselineDatabase()
  try {
    const definitions = database.prepare(`
      SELECT name, sql
      FROM sqlite_schema
      WHERE type = 'table'
        AND name IN ('content_documents', 'content_blocks', 'resource_localizations', 'media_assets', 'media_placements')
      ORDER BY name
    `).all() as Array<{ name: string, sql: string }>

    assert.equal(definitions.length, 5)
    const sqlByTable = Object.fromEntries(definitions.map(row => [row.name, row.sql]))
    assert.doesNotMatch(sqlByTable.content_documents, /owner_type[^,]*CHECK/i)
    assert.doesNotMatch(sqlByTable.content_blocks, /type[^,]*CHECK/i)
    assert.doesNotMatch(sqlByTable.resource_localizations, /resource_type[^,]*CHECK/i)
    assert.doesNotMatch(sqlByTable.media_assets, /owner_type[^,]*CHECK/i)
    assert.doesNotMatch(sqlByTable.media_placements, /owner_type[^,]*CHECK/i)
    assert.doesNotMatch(sqlByTable.media_placements, /slot[^,]*CHECK/i)
  } finally {
    database.close()
  }
})
