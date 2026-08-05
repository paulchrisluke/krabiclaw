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
