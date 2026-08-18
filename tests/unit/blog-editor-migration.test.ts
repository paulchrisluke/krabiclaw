import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationDir = resolve(process.cwd(), 'migrations')
const cleanupMigration = readFileSync(resolve(migrationDir, '0121_last_crystal.sql'), 'utf8')

function databaseAt0120() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  const migrations = readdirSync(migrationDir)
    .filter(file => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 120)
    .sort()
  for (const migration of migrations) {
    db.exec(readFileSync(resolve(migrationDir, migration), 'utf8'))
  }
  db.pragma('foreign_keys = ON')
  return db
}

test('0121 removes staged publication data without destroying current content or dependent rows', () => {
  const db = databaseAt0120()

  db.prepare("INSERT INTO user (id, name, email) VALUES ('user-test', 'Test', 'test@example.com')").run()
  db.prepare("INSERT INTO organization (id, name, slug) VALUES ('org-test', 'Test', 'test')").run()
  db.prepare("INSERT INTO sites (id, organization_id, slug, subdomain, vertical) VALUES ('site-test', 'org-test', 'test', 'test', 'service')").run()
  db.prepare(`
    INSERT INTO onboarding_drafts (id, user_id, organization_id, name, vertical, source_type, payload_json)
    VALUES ('draft-test', 'user-test', 'org-test', 'Draft', 'service', 'manual', '{}')
  `).run()

  db.prepare(`
    INSERT INTO tenant_pages (id, organization_id, site_id, path, title, page_type, status, source)
    VALUES ('page-test', 'org-test', 'site-test', '/published', 'Page', 'custom', 'published', 'test')
  `).run()
  db.prepare(`
    INSERT INTO content_documents (id, owner_type, owner_id, draft_revision_id, published_revision_id)
    VALUES ('document-test', 'tenant_page', 'variant-test', 'revision-draft', 'revision-published')
  `).run()
  db.prepare(`INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown) VALUES ('revision-draft', 'document-test', '{}', 'current')`).run()
  db.prepare(`INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown) VALUES ('revision-published', 'document-test', '{}', 'published')`).run()
  db.prepare(`INSERT INTO content_blocks (id, document_id, type, position, data_json) VALUES ('block-test', 'document-test', 'markdown', 0, '{"markdown":"current"}')`).run()
  db.prepare(`
    INSERT INTO tenant_page_variants
      (id, organization_id, site_id, page_id, locale, draft_document_id, published_revision_id,
       ever_published, published_path, draft_path, title, status)
    VALUES
      ('variant-test', 'org-test', 'site-test', 'page-test', 'en', 'document-test', 'revision-published',
       1, '/published', '/current', 'Page', 'published')
  `).run()
  db.prepare(`
    INSERT INTO tenant_compliance (id, organization_id, site_id, privacy_page_id)
    VALUES ('compliance-test', 'org-test', 'site-test', 'page-test')
  `).run()

  db.prepare(`
    INSERT INTO site_link_pages (id, organization_id, site_id, title, status)
    VALUES ('links-test', 'org-test', 'site-test', 'Links', 'published')
  `).run()
  db.prepare(`
    INSERT INTO site_link_items (id, organization_id, site_id, link_page_id, label, destination, status)
    VALUES ('link-test', 'org-test', 'site-test', 'links-test', 'Contact', '/contact', 'active')
  `).run()
  db.prepare(`
    INSERT INTO offerings (id, organization_id, site_id, name, slug, status)
    VALUES ('offering-test', 'org-test', 'site-test', 'Advice', 'advice', 'published')
  `).run()
  db.prepare(`
    INSERT INTO menus (id, organization_id, site_id, name, status)
    VALUES ('menu-live', 'org-test', 'site-test', 'Live', 'published'),
           ('menu-draft', 'org-test', 'site-test', 'Draft', 'draft')
  `).run()
  db.prepare(`
    INSERT INTO blog_posts (id, title, slug, body, category, status, scheduled_for, scheduled_revision_id)
    VALUES ('blog-test', 'Scheduled', 'scheduled', 'Body', 'News', 'scheduled', '2026-09-01T12:00:00.000Z', 'revision-published')
  `).run()

  db.exec(cleanupMigration)

  assert.deepEqual(
    db.prepare('SELECT document_id, path FROM tenant_page_variants WHERE id = ?').get('variant-test'),
    { document_id: 'document-test', path: '/current' },
  )
  assert.equal(db.prepare('SELECT COUNT(*) FROM content_blocks WHERE document_id = ?').pluck().get('document-test'), 1)
  assert.deepEqual(
    db.prepare('SELECT from_path, to_path FROM tenant_redirects WHERE owner_variant_id = ?').get('variant-test'),
    { from_path: '/published', to_path: '/current' },
  )
  assert.equal(db.prepare('SELECT privacy_page_id FROM tenant_compliance WHERE id = ?').pluck().get('compliance-test'), 'page-test')
  assert.equal(db.prepare('SELECT link_page_id FROM site_link_items WHERE id = ?').pluck().get('link-test'), 'links-test')
  assert.equal(db.prepare('SELECT COUNT(*) FROM offerings WHERE id = ?').pluck().get('offering-test'), 1)
  assert.deepEqual(db.prepare('SELECT id, is_visible FROM menus ORDER BY id').all(), [
    { id: 'menu-draft', is_visible: 0 },
    { id: 'menu-live', is_visible: 1 },
  ])
  assert.deepEqual(
    db.prepare('SELECT status, scheduled_for FROM blog_posts WHERE id = ?').get('blog-test'),
    { status: 'scheduled', scheduled_for: '2026-09-01T12:00:00.000Z' },
  )
  assert.equal(db.prepare('SELECT status FROM onboarding_drafts WHERE id = ?').pluck().get('draft-test'), 'active')
  assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'content_revisions'").pluck().get(), 0)
  assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'tenant_navigation_items'").pluck().get(), 0)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})
