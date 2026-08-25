import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

function databaseBeforeCleanup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  for (const file of readdirSync('migrations').filter(file => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) < 125).sort()) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }
  db.pragma('foreign_keys = ON')
  return db
}

function applyPublicationMigrations(db: Database.Database) {
  db.exec(readFileSync('migrations/0125_dark_talisman.sql', 'utf8'))
  db.exec(readFileSync('migrations/0126_remarkable_shotgun.sql', 'utf8'))
  db.exec(readFileSync('migrations/0127_chunky_maximus.sql', 'utf8'))
}

test('0125 deletes every retired publication state and dependent current row', () => {
  const db = databaseBeforeCleanup()
  db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').run('org-cleanup', 'Cleanup', 'cleanup')
  db.prepare('INSERT INTO sites (id, organization_id, slug, subdomain) VALUES (?, ?, ?, ?)').run('site-cleanup', 'org-cleanup', 'cleanup', 'cleanup')
  db.prepare("INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, status) VALUES (?, ?, ?, 'image', 'external_url', 'external', 'active')").run('asset-cleanup', 'org-cleanup', 'site-cleanup')

  db.prepare("INSERT INTO posts (id, organization_id, site_id, body, status, created_by) VALUES (?, ?, ?, ?, 'draft', ?)").run('post-hidden', 'org-cleanup', 'site-cleanup', 'Hidden', 'user-cleanup')
  db.prepare("INSERT INTO posts (id, organization_id, site_id, body, status, created_by) VALUES (?, ?, ?, ?, 'published', ?)").run('post-live', 'org-cleanup', 'site-cleanup', 'Live', 'user-cleanup')
  db.prepare("INSERT INTO post_channel_jobs (id, post_id, organization_id, channel) VALUES (?, ?, ?, 'site')").run('job-hidden', 'post-hidden', 'org-cleanup')
  db.prepare("INSERT INTO post_media (id, organization_id, site_id, post_id, media_asset_id) VALUES (?, ?, ?, ?, ?)").run('post-media-hidden', 'org-cleanup', 'site-cleanup', 'post-hidden', 'asset-cleanup')

  db.prepare("INSERT INTO blog_posts (id, organization_id, site_id, title, slug, body, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'archived')").run('blog-hidden', 'org-cleanup', 'site-cleanup', 'Hidden', 'hidden', 'Hidden', 'News')
  db.prepare("INSERT INTO blog_posts (id, organization_id, site_id, title, slug, body, category, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')").run('blog-scheduled', 'org-cleanup', 'site-cleanup', 'Scheduled', 'scheduled', 'Scheduled', 'News')
  db.prepare("INSERT INTO content_documents (id, owner_type, owner_id) VALUES (?, 'tenant_blog', ?)").run('blog-doc-hidden', 'blog-hidden')
  db.prepare("INSERT INTO content_blocks (id, document_id, type, data_json) VALUES (?, ?, 'markdown', '{}')").run('blog-block-hidden', 'blog-doc-hidden')

  db.prepare("INSERT INTO platform_docs (id, title, slug, body, status) VALUES (?, ?, ?, ?, 'draft')").run('doc-hidden', 'Hidden', 'hidden-doc', 'Hidden')
  db.prepare("INSERT INTO platform_docs (id, title, slug, body, status) VALUES (?, ?, ?, ?, 'published')").run('doc-live', 'Live', 'live-doc', 'Live')
  db.prepare("INSERT INTO platform_content_components (id, content_type, content_id, type, data_json) VALUES (?, 'doc', ?, 'faq', '{}')").run('doc-component-hidden', 'doc-hidden')
  db.prepare("INSERT INTO content_documents (id, owner_type, owner_id) VALUES (?, 'platform_doc', ?)").run('duplicate-doc', 'doc-live')
  db.prepare("INSERT INTO content_blocks (id, document_id, type, data_json) VALUES (?, ?, 'markdown', '{}')").run('duplicate-block', 'duplicate-doc')

  db.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES (?, ?, ?, 'en', 1, 'disabled')").run('locale-source', 'org-cleanup', 'site-cleanup')
  db.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES (?, ?, ?, 'th', 0, 'draft')").run('locale-hidden', 'org-cleanup', 'site-cleanup')
  db.prepare("INSERT INTO tenant_pages (id, organization_id, site_id, title, page_type, source) VALUES (?, ?, ?, ?, 'custom', 'manual')").run('page-cleanup', 'org-cleanup', 'site-cleanup', 'Page')
  db.prepare("INSERT INTO content_documents (id, owner_type, owner_id) VALUES (?, 'tenant_page', ?)").run('locale-doc-hidden', 'variant-hidden')
  db.prepare("INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, document_id, path, title) VALUES (?, ?, ?, ?, 'th', ?, '/th', ?)").run('variant-hidden', 'org-cleanup', 'site-cleanup', 'page-cleanup', 'locale-doc-hidden', 'ไทย')
  db.prepare("INSERT INTO content_blocks (id, document_id, type, data_json) VALUES (?, ?, 'markdown', '{}')").run('locale-block-hidden', 'locale-doc-hidden')
  db.prepare("INSERT INTO tenant_redirects (id, organization_id, site_id, locale, from_path, to_path) VALUES (?, ?, ?, 'th', '/old', '/th')").run('locale-redirect-hidden', 'org-cleanup', 'site-cleanup')

  applyPublicationMigrations(db)

  for (const [table, id] of [
    ['posts', 'post-hidden'], ['post_channel_jobs', 'job-hidden'], ['post_media', 'post-media-hidden'],
    ['blog_posts', 'blog-hidden'], ['content_documents', 'blog-doc-hidden'], ['content_blocks', 'blog-block-hidden'],
    ['platform_docs', 'doc-hidden'], ['platform_content_components', 'doc-component-hidden'],
    ['content_documents', 'duplicate-doc'], ['content_blocks', 'duplicate-block'],
    ['site_locales', 'locale-hidden'], ['tenant_page_variants', 'variant-hidden'],
    ['content_documents', 'locale-doc-hidden'], ['content_blocks', 'locale-block-hidden'], ['tenant_redirects', 'locale-redirect-hidden'],
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id = ?`).get(id).count, 0, `${table}.${id} should be deleted`)
  }
  assert.equal(db.prepare("SELECT status FROM posts WHERE id = 'post-live'").get().status, 'published')
  assert.equal(db.prepare("SELECT status FROM blog_posts WHERE id = 'blog-scheduled'").get().status, 'scheduled')
  assert.equal(db.prepare("SELECT title FROM platform_docs WHERE id = 'doc-live'").get().title, 'Live')
  assert.equal(db.prepare("SELECT status FROM site_locales WHERE id = 'locale-source'").get().status, 'published')
  assert.equal(db.pragma('foreign_key_check').length, 0)
})

test('publication cleanup migrations reject retired states and duplicate platform-doc storage', () => {
  const db = databaseBeforeCleanup()
  applyPublicationMigrations(db)

  const docColumns = db.pragma('table_info(platform_docs)').map(column => column.name)
  assert.equal(docColumns.includes('status'), false)
  assert.equal(docColumns.includes('published_at'), false)
  assert.equal(docColumns.includes('parent_doc_id'), false)

  db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').run('org-guard', 'Guard', 'guard')
  db.prepare('INSERT INTO sites (id, organization_id, slug, subdomain) VALUES (?, ?, ?, ?)').run('site-guard', 'org-guard', 'guard', 'guard')
  assert.throws(() => db.prepare("INSERT INTO posts (id, organization_id, site_id, body, status, created_by) VALUES ('bad-post', 'org-guard', 'site-guard', 'bad', 'draft', 'user')").run(), /published or scheduled/)
  assert.throws(() => db.prepare("INSERT INTO blog_posts (id, organization_id, site_id, title, slug, body, category, status) VALUES ('bad-blog', 'org-guard', 'site-guard', 'bad', 'bad', 'bad', 'News', 'archived')").run(), /published or scheduled/)
  assert.throws(() => db.prepare("INSERT INTO content_documents (id, owner_type, owner_id) VALUES ('bad-doc', 'platform_doc', 'doc')").run(), /platform docs do not use content_documents/)
  assert.throws(() => db.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, status) VALUES ('bad-locale', 'org-guard', 'site-guard', 'th', 'draft')").run(), /CHECK constraint failed/)
  assert.throws(() => db.prepare("INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES ('bad-source', 'org-guard', 'site-guard', 'en', 1, 'disabled')").run(), /CHECK constraint failed/)
})
