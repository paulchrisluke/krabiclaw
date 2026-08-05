import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationDir = resolve(process.cwd(), 'migrations')
const migration0092 = readFileSync(resolve(migrationDir, '0092_tranquil_fixer.sql'), 'utf8')
const migration0097 = readFileSync(resolve(migrationDir, '0097_repair_dangling_content_revisions.sql'), 'utf8')
const migration0098 = readFileSync(resolve(migrationDir, '0098_tenant_page_translation_and_redirect_scope.sql'), 'utf8')

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

test('0092 preserves live source fallback while keeping draft translation overrides in the draft revision', () => {
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
    INSERT INTO site_content_translations (id, organization_id, site_id, locale, page, field, content, hero_title, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('site-translation-test', 'org-test', 'site-test', 'th', 'home', 'hero', 'หน้าแรก', 'หน้าแรก', 'draft')

  db.exec(migration0092)

  const locationVariant = db.prepare(`
    SELECT v.status, v.published_revision_id, d.id AS document_id
      FROM tenant_page_variants v
      JOIN tenant_pages p ON p.id = v.page_id
      JOIN content_documents d ON d.owner_id = v.id AND d.owner_type = 'tenant_page'
     WHERE p.path = '/locations/beach' AND v.locale = 'th'
  `).get() as { status: string; published_revision_id: string | null; document_id: string } | undefined
  assert.ok(locationVariant)
  assert.equal(locationVariant.status, 'published')
  assert.ok(locationVariant.published_revision_id)
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM content_blocks WHERE document_id = ?').get(locationVariant.document_id) as { count: number }).count, 1)
  const locationDocument = db.prepare(`
    SELECT draft_revision_id, published_revision_id
      FROM content_documents WHERE id = ?
  `).get(locationVariant.document_id) as { draft_revision_id: string; published_revision_id: string } | undefined
  assert.ok(locationDocument)
  const publishedSnapshot = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(locationDocument.published_revision_id) as { snapshot_json: string }).snapshot_json) as { blocks: Array<{ data: { content?: string } }> }
  const draftSnapshot = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(locationDocument.draft_revision_id) as { snapshot_json: string }).snapshot_json) as { blocks: Array<{ data: { content?: string } }> }
  assert.equal(publishedSnapshot.blocks[0]?.data.content, 'Beach body')
  assert.equal(draftSnapshot.blocks[0]?.data.content, 'ชายหาด')

  const siteVariant = db.prepare(`
    SELECT status, published_revision_id FROM tenant_page_variants
     WHERE page_id = 'page-test' AND locale = 'th'
  `).get() as { status: string; published_revision_id: string | null } | undefined
  assert.equal(siteVariant?.status, 'published')
  assert.ok(siteVariant?.published_revision_id)
  const siteDocument = db.prepare(`
    SELECT d.draft_revision_id, d.published_revision_id
      FROM content_documents d
      JOIN tenant_page_variants v ON v.id = d.owner_id AND d.owner_type = 'tenant_page'
     WHERE v.page_id = 'page-test' AND v.locale = 'th'
  `).get() as { draft_revision_id: string; published_revision_id: string } | undefined
  assert.ok(siteDocument)
  const sitePublished = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(siteDocument.published_revision_id) as { snapshot_json: string }).snapshot_json) as { metadata: { title: string } }
  const siteDraft = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(siteDocument.draft_revision_id) as { snapshot_json: string }).snapshot_json) as { metadata: { title: string } }
  assert.equal(sitePublished.metadata.title, 'Home')
  assert.equal(siteDraft.metadata.title, 'หน้าแรก')
})

test('0092 preserves existing published content revisions while rebuilding content tables', () => {
  const db = databaseBeforeTenantPageMigration()
  db.pragma('foreign_keys = ON')
  db.prepare(`
    INSERT INTO content_documents
      (id, owner_type, owner_id, draft_revision_id, published_revision_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('blog-document', 'tenant_blog', 'blog-post', 'blog-revision', 'blog-revision')
  db.prepare(`
    INSERT INTO content_revisions
      (id, document_id, snapshot_json, body_markdown, label)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'blog-revision',
    'blog-document',
    JSON.stringify({ blocks: [{ id: 'blog-block', type: 'markdown', position: 0, data: { markdown: 'Body' } }] }),
    'Body',
    'Published',
  )
  db.prepare(`
    INSERT INTO content_blocks
      (id, document_id, type, position, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run('blog-block', 'blog-document', 'markdown', 0, JSON.stringify({ markdown: 'Body' }))

  db.exec(migration0092)

  const revision = db.prepare(`
    SELECT d.published_revision_id, r.document_id, r.body_markdown
      FROM content_documents d
      JOIN content_revisions r ON r.id = d.published_revision_id
     WHERE d.id = ?
  `).get('blog-document') as { published_revision_id: string; document_id: string; body_markdown: string } | undefined
  assert.deepEqual(revision, {
    published_revision_id: 'blog-revision',
    document_id: 'blog-document',
    body_markdown: 'Body',
  })
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM content_blocks WHERE document_id = ?').get('blog-document') as { count: number }).count,
    1,
  )
})

test('0097 repairs a dangling published blog revision from the canonical post body', () => {
  const db = databaseBeforeTenantPageMigration()
  db.exec(migration0092)
  db.prepare(`
    INSERT INTO blog_posts
      (id, organization_id, site_id, title, slug, body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('blog-post', 'org-test', 'site-test', 'Post', 'post', '# Body', 'published')
  db.prepare(`
    INSERT INTO content_documents
      (id, owner_type, owner_id, draft_revision_id, published_revision_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('blog-document', 'tenant_blog', 'blog-post', 'missing-revision', 'missing-revision')

  db.exec(migration0097)

  const document = db.prepare(`
    SELECT draft_revision_id, published_revision_id
      FROM content_documents
     WHERE id = ?
  `).get('blog-document') as { draft_revision_id: string; published_revision_id: string } | undefined
  assert.deepEqual(document, {
    draft_revision_id: 'repaired-content-revision:blog-document',
    published_revision_id: 'repaired-content-revision:blog-document',
  })
  const revision = db.prepare(`
    SELECT body_markdown, snapshot_json
      FROM content_revisions
     WHERE id = ?
  `).get('repaired-content-revision:blog-document') as { body_markdown: string; snapshot_json: string } | undefined
  assert.equal(revision?.body_markdown, '# Body')
  assert.equal(JSON.parse(revision?.snapshot_json ?? '{}').blocks[0].data.markdown, '# Body')
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM content_blocks WHERE document_id = ?').get('blog-document') as { count: number }).count,
    1,
  )
})

test('0097 repairs a dangling tenant-page revision with a valid page snapshot', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [{ type: 'home_hero', title: 'Home' }])
  db.exec(migration0092)

  const document = db.prepare(`
    SELECT d.id
      FROM content_documents d
      JOIN tenant_page_variants v ON v.id = d.owner_id AND d.owner_type = 'tenant_page'
     WHERE v.page_id = 'page-test' AND v.locale = 'en'
  `).get() as { id: string } | undefined
  assert.ok(document)
  db.prepare('DELETE FROM content_blocks WHERE document_id = ?').run(document.id)
  db.prepare(`
    UPDATE content_documents
       SET draft_revision_id = 'missing-tenant-page-revision',
           published_revision_id = 'missing-tenant-page-revision'
     WHERE id = ?
  `).run(document.id)

  db.exec(migration0097)

  const repaired = db.prepare(`
    SELECT snapshot_json
      FROM content_revisions
     WHERE id = 'repaired-content-revision:' || ?
  `).get(document.id) as { snapshot_json: string } | undefined
  assert.ok(repaired)
  const snapshot = JSON.parse(repaired.snapshot_json) as {
    metadata: { locale: string; path: string; title: string; pageType: string }
    blocks: Array<{ type: string; data: { markdown?: string } }>
  }
  assert.deepEqual(snapshot.metadata, {
    locale: 'en',
    path: '/',
    title: 'Home',
    summary: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: null,
    pageType: 'system',
    recipe: null,
  })
  assert.equal(snapshot.blocks[0]?.type, 'markdown')
  assert.equal(snapshot.blocks[0]?.data.markdown, 'Home')
})

test('0098 scopes existing redirects to the owning source locale and adds translation field state', () => {
  const db = databaseBeforeTenantPageMigration()
  db.exec(migration0092)
  db.exec(migration0097)
  db.prepare(`
    INSERT INTO tenant_redirects
      (id, organization_id, site_id, from_path, to_path, status_code, behavior, reason, source)
    VALUES (?, ?, ?, ?, ?, 301, 'redirect', 'manual', 'manual')
  `).run('redirect-test', 'org-test', 'site-test', '/old', '/new')

  db.exec(migration0098)

  const redirect = db.prepare('SELECT locale, owner_variant_id FROM tenant_redirects WHERE id = ?').get('redirect-test') as { locale: string; owner_variant_id: string | null } | undefined
  assert.deepEqual(redirect, { locale: 'en', owner_variant_id: null })
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenant_page_translation_fields'").get() as { name: string } | undefined
  assert.equal(table?.name, 'tenant_page_translation_fields')
})
