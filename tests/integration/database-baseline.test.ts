import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { rebaseline } from '../../scripts/rebaseline-data.mjs'

function baselineDatabase() {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(readFileSync('migrations/0000_baseline.sql', 'utf8'))
  return database
}

function currentSchemaDatabase() {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  const migrations = readdirSync('migrations')
    .filter(name => /^\d{4}_.+\.sql$/u.test(name))
    .sort()
  for (const migration of migrations) database.exec(readFileSync(join('migrations', migration), 'utf8'))
  return database
}

test('the baseline creates the complete schema from zero', () => {
  const database = baselineDatabase()
  try {
    const tableCount = database.prepare(`
      SELECT count(*) count
      FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).get() as { count: number }
    // The baseline is complete when it carries exactly the tables the schema
    // declares. A hardcoded number says nothing about which table is missing,
    // and goes stale on every change that is supposed to be fine. The snapshot
    // beside the baseline is generated from schema.ts, so it is that
    // declaration in a form this test can read.
    const snapshot = JSON.parse(readFileSync('migrations/meta/0000_snapshot.json', 'utf8')) as { tables: Record<string, { name: string }> }
    const declared = Object.values(snapshot.tables).map(table => table.name).sort()
    const built = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map(row => row.name)
    assert.deepEqual(built, declared)
    assert.equal(tableCount.count, declared.length)
    const ledgerCount = database.prepare("SELECT count(*) count FROM sqlite_schema WHERE name = 'd1_migrations'").get() as { count: number }
    assert.equal(ledgerCount.count, 0)
    const splitAvailabilityTables = database.prepare("SELECT count(*) count FROM sqlite_schema WHERE type = 'table' AND name IN ('experience_slot_overrides', 'reservation_slot_overrides')").get() as { count: number }
    assert.equal(splitAvailabilityTables.count, 0)
    assert.deepEqual(
      database.pragma('table_info(user_workspace_state)').filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name),
      ['user_id'],
    )
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('a rebaseline payload applies to the complete migrated schema', () => {
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-rebaseline-'))
  const targetPath = join(directory, 'target.sqlite')
  const payloadPath = join(directory, 'payload.sql')
  let destination: Database.Database | undefined
  try {
    rebaseline('migrations/0000_baseline.sql', targetPath, { payloadPath, withoutJwks: true })
    destination = currentSchemaDatabase()
    destination.exec(readFileSync(payloadPath, 'utf8'))

    const tables = destination.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{ name: string }>
    assert.equal(tables.some(table => table.name === 'legal_intake_references'), false)
    assert.equal(tables.some(table => table.name === 'stripe_connected_accounts'), true)
    assert.equal(destination.pragma('foreign_key_check').length, 0)
  } finally {
    destination?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the baseline enforces canonical cross-scope and structural constraints', () => {
  const database = baselineDatabase()
  try {
    database.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
    database.prepare("INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site', 'org', 'site', 'site')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location', 'org', 'site', 'location', 'Location')").run()
    database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('other-location', 'org', 'site', 'other-location', 'Other location')").run()
    // The catalog belongs to the organization; a site and a location reach it
    // through their own relationship rows, and every one of those is scoped by
    // organization so a relationship cannot cross a tenant boundary.
    database.prepare("INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES ('product', 'org', 'Product', 'product', 'user', 'user')").run()
    database.prepare("INSERT INTO product_variants (id, organization_id, product_id, name, created_by, updated_by) VALUES ('variant', 'org', 'product', 'Default', 'user', 'user')").run()
    database.prepare("INSERT INTO product_publications (organization_id, product_id, site_id, published, created_by, updated_by) VALUES ('org', 'product', 'site', 1, 'user', 'user')").run()
    database.prepare("INSERT INTO product_locations (organization_id, product_id, location_id, published, created_by, updated_by) VALUES ('org', 'product', 'location', 1, 'user', 'user')").run()
    database.prepare("INSERT INTO collections (id, organization_id, site_id, location_id, name, slug, created_by, updated_by) VALUES ('collection', 'org', 'site', 'location', 'Food', 'food', 'user', 'user')").run()
    database.prepare("INSERT INTO collection_products (organization_id, collection_id, product_id, created_by, updated_by) VALUES ('org', 'collection', 'product', 'user', 'user')").run()
    database.prepare(`INSERT INTO prices (id, organization_id, product_variant_id, location_id, currency, unit_amount, created_by, updated_by)
      VALUES ('price', 'org', 'variant', 'location', 'THB', 10000, 'user', 'user')`).run()

    database.prepare("INSERT INTO organization (id, name, slug) VALUES ('other-org', 'Other', 'other-org')").run()
    database.prepare("INSERT INTO products (id, organization_id, name, slug, created_by, updated_by) VALUES ('other-product', 'other-org', 'Theirs', 'theirs', 'user', 'user')").run()
    assert.throws(
      () => database.prepare("INSERT INTO collection_products (organization_id, collection_id, product_id, created_by, updated_by) VALUES ('org', 'collection', 'other-product', 'user', 'user')").run(),
      /FOREIGN KEY constraint failed/,
      'a collection cannot carry another tenant\'s product',
    )
    assert.throws(
      () => database.prepare("INSERT INTO product_locations (organization_id, product_id, location_id, published, created_by, updated_by) VALUES ('other-org', 'other-product', 'location', 1, 'user', 'user')").run(),
      /FOREIGN KEY constraint failed/,
      'a product cannot be offered at another tenant\'s location',
    )

    // Bookability is the existence of a config row, and a cadence longer than
    // a week has to say from when.
    database.prepare("INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_by, updated_by) VALUES ('product', 'org', 90, 8, 'user', 'user')").run()
    assert.throws(
      () => database.prepare(`INSERT INTO product_availability_rules (id, organization_id, product_id, timezone, weekday, start_time, interval_weeks, created_by, updated_by)
        VALUES ('fortnightly', 'org', 'product', 'Asia/Bangkok', 6, '14:00', 2, 'user', 'user')`).run(),
      /product_availability_rules_anchor_check/,
    )
    database.prepare(`INSERT INTO product_availability_rules (id, organization_id, product_id, timezone, weekday, start_time, interval_weeks, effective_from_date, created_by, updated_by)
      VALUES ('fortnightly', 'org', 'product', 'Asia/Bangkok', 6, '14:00', 2, '2026-01-03', 'user', 'user')`).run()

    assert.throws(
      () => database.prepare("INSERT INTO organization (id, name, slug) VALUES ('blank', 'Blank', '   ')").run(),
      /organization_slug_required_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source) VALUES ('video', 'org', 'site', 'video', 'cloudflare_r2', 'uploaded')").run(),
      /media_assets_video_thumbnail_check/,
    )
    database.prepare("INSERT INTO site_locales (id,organization_id,site_id,locale,is_source,status) VALUES ('source','org','site','en',1,'published')").run()
    database.prepare("INSERT INTO content_documents (id,organization_id,site_id,kind,row_role,locale,summary,status,visibility,published_at,source,metadata_json) VALUES ('social','org','site','social_post','root','en','Body','published','public','2026-01-01T00:00:00.000Z','manual',?)").run(JSON.stringify({ post_type: 'alert', alert_type: 'covid_19', channels: {} }))
    assert.throws(
      () => database.prepare("UPDATE content_documents SET metadata_json = ? WHERE id = 'social'").run(JSON.stringify({ post_type: 'promotion', channels: {} })),
      /content_documents_social_post_type_check/,
    )
    assert.throws(
      () => database.prepare("UPDATE content_documents SET metadata_json = ? WHERE id = 'social'").run(JSON.stringify({ post_type: 'alert', channels: {} })),
      /content_documents_social_topic_shape_check/,
    )
    assert.throws(
      () => database.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES ('bad-en', 'org', 'site', 'en', 0, 'published')").run(),
      /site_locales_english_source_check/,
    )
    // A review names a product in its own organization. The product is not
    // tied to one location any more, so reviewing it at either branch the
    // tenant runs is a real thing to do.
    assert.throws(
      () => database.prepare("INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, rating) VALUES ('bad-review', 'org', 'site', 'location', 'other-product', 5)").run(),
      /FOREIGN KEY constraint failed/,
    )
    database.prepare("INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, rating) VALUES ('review', 'org', 'site', 'location', 'product', 5)").run()
    database.prepare("INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, rating) VALUES ('other-branch-review', 'org', 'site', 'other-location', 'product', 5)").run()
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

// Closed value sets (document kinds, block types, statuses, theme ids) are not CHECK
// constraints: D1 cannot rebuild a referenced parent table, so a value set that
// grows must not require one. They are enforced by the registries in shared/.
test('the baseline keeps structural JSON checks without enum membership checks', () => {
  const database = baselineDatabase()
  try {
    database.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
    database.prepare("INSERT INTO sites (id, organization_id, slug) VALUES ('site', 'org', 'site')").run()
    database.prepare("INSERT INTO site_locales (id,organization_id,site_id,locale,is_source,status) VALUES ('source','org','site','en',1,'published')").run()
    database.prepare("INSERT INTO content_documents (id,organization_id,site_id,kind,row_role,locale,title,path,metadata_json) VALUES ('document','org','site','page','root','en','Page','/page','{\"page_type\":\"custom\"}')").run()
    database.prepare("INSERT INTO content_blocks (id, document_id, type, position, data_json) VALUES ('block', 'document', 'markdown', 0, '{}')").run()
    assert.throws(() => database.prepare("UPDATE content_blocks SET data_json = '[]' WHERE id = 'block'").run(), /content_blocks_data_json_check/)
    const checks = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table'").all() as Array<{ sql: string }>
    // The rule is about value sets that grow on a table D1 cannot rebuild. A
    // boolean's domain is 0 and 1 forever, and a table nothing references can
    // be rebuilt; everything else must state its membership in a registry
    // under shared/ rather than in the schema.
    const referenced = new Set([...readFileSync('migrations/0000_baseline.sql', 'utf8').matchAll(/REFERENCES `([a-z_]+)`/g)].map(match => match[1]!))
    const enumChecks = checks.flatMap((row) => {
      const table = row.sql.match(/CREATE TABLE `([a-z_]+)`/)?.[1]
      if (!table || !referenced.has(table)) return []
      return [...row.sql.matchAll(/CONSTRAINT "([^"]+)" CHECK\((\w+) IN \(([^()]*)\)\)/g)]
        .filter(match => match[3]!.replaceAll(' ', '') !== '0,1')
        .map(match => match[1]!)
    })
    assert.deepEqual(enumChecks, [])
    assert.equal(checks.some(row => row.sql.includes('"sites"."')), false)
  } finally {
    database.close()
  }
})
