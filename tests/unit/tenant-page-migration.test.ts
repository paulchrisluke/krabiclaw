import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationDir = resolve(process.cwd(), 'migrations')
const migration0092 = readFileSync(resolve(migrationDir, '0092_tranquil_fixer.sql'), 'utf8')

function databaseBeforeTenantPageMigration() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  const migrations = readdirSync(migrationDir)
    .filter(file => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) < 92)
    .sort()
  for (const migration of migrations) db.exec(readFileSync(resolve(migrationDir, migration), 'utf8'))
  db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').run('org-test', 'Test', 'test')
  db.prepare('INSERT INTO sites (id, organization_id, slug, subdomain, vertical) VALUES (?, ?, ?, ?, ?)').run('site-test', 'org-test', 'test', 'test', 'service')
  db.prepare('INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run('locale-test', 'org-test', 'site-test', 'en', 'English', 1, 'published')
  db.prepare('INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run('locale-test-th', 'org-test', 'site-test', 'th', 'ไทย', 0, 'published')
  return db
}

function insertLegacyPage(db: Database.Database, components: Array<Record<string, unknown>>) {
  db.prepare('INSERT INTO tenant_pages (id, organization_id, site_id, path, title, page_type, components_json, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'page-test',
    'org-test',
    'site-test',
    '/',
    'Home',
    'static',
    JSON.stringify(components),
    'published',
    'test',
  )
}

test('0092 migrates legacy route pages without persisting route-owned component markers', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [
    { type: 'home_hero', title: 'Home' },
    { type: 'latest_articles' },
    { type: 'article_filters' },
    { type: 'disclaimer', content: 'Notice' },
  ])

  db.exec(migration0092)

  const rows = db.prepare(`
    SELECT b.type, b.position, b.data_json
      FROM content_blocks b
      JOIN content_documents d ON d.id = b.document_id
      JOIN tenant_page_variants v ON v.id = d.owner_id
     WHERE v.page_id = ?
     ORDER BY b.position
  `).all('page-test') as Array<{ type: string; position: number; data_json: string }>

  assert.deepEqual(rows.map(row => row.type), ['hero', 'callout'])
  assert.deepEqual(rows.map(row => row.position), [0, 3])
  assert.equal(JSON.parse(rows[0]!.data_json).legacy_type, 'home_hero')
  assert.equal(JSON.parse(rows[1]!.data_json).legacy_type, 'disclaimer')
})

test('0092 rejects an unrecognized legacy component instead of dropping it', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [{ type: 'unknown_legacy_component' }])

  assert.throws(() => db.exec(migration0092), /tenant_page_legacy_component_type_check/)
})

test('0092 preserves location translation variants and keeps draft translations unpublished', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [{ type: 'home_hero', title: 'Home' }])
  db.prepare(`
    INSERT INTO business_locations (id, organization_id, site_id, slug, title)
    VALUES (?, ?, ?, ?, ?)
  `).run('location-test', 'org-test', 'site-test', 'beach', 'Beach')
  db.prepare(`
    INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, content, hero_title)
    VALUES (?, ?, ?, ?, 'location', 'hero', ?, ?)
  `).run('location-content-test', 'org-test', 'site-test', 'location-test', 'Beach body', 'Beach')
  db.prepare(`
    INSERT INTO site_content_translations (id, organization_id, site_id, location_id, locale, page, field, content, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('location-translation-test', 'org-test', 'site-test', 'location-test', 'th', 'location', 'hero', 'ชายหาด', 'draft')
  db.prepare(`
    INSERT INTO site_content_translations (id, organization_id, site_id, locale, page, field, content, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('site-translation-test', 'org-test', 'site-test', 'th', 'home', 'hero', 'หน้าแรก', 'draft')

  db.exec(migration0092)

  const locationVariant = db.prepare(`
    SELECT v.status, v.published_revision_id, d.id AS document_id
      FROM tenant_page_variants v
      JOIN tenant_pages p ON p.id = v.page_id
      JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
     WHERE p.path = '/locations/beach' AND v.locale = 'th'
  `).get() as { status: string; published_revision_id: string | null; document_id: string } | undefined
  assert.ok(locationVariant)
  assert.equal(locationVariant.status, 'draft')
  assert.equal(locationVariant.published_revision_id, null)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM content_blocks WHERE document_id = ?').get(locationVariant.document_id) as { count: number }).count, 1)

  const siteVariant = db.prepare(`
    SELECT status, published_revision_id FROM tenant_page_variants
     WHERE page_id = 'page-test' AND locale = 'th'
  `).get() as { status: string; published_revision_id: string | null } | undefined
  assert.deepEqual(siteVariant, { status: 'draft', published_revision_id: null })
})
