import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationDir = resolve(process.cwd(), 'migrations')
const migration0092 = readFileSync(resolve(migrationDir, '0092_tranquil_fixer.sql'), 'utf8')
const migration0093 = readFileSync(resolve(migrationDir, '0093_skinny_raider.sql'), 'utf8')
const migration0094 = readFileSync(resolve(migrationDir, '0094_green_white_tiger.sql'), 'utf8')
const migration0095 = readFileSync(resolve(migrationDir, '0095_remarkable_reptil.sql'), 'utf8')
const migration0096Billing = readFileSync(resolve(migrationDir, '0096_parched_prism.sql'), 'utf8')
const migration0096 = readFileSync(resolve(migrationDir, '0096_spotty_bromley.sql'), 'utf8')
const migration0097Billing = readFileSync(resolve(migrationDir, '0097_wise_layla_miller.sql'), 'utf8')
const migration0097 = readFileSync(resolve(migrationDir, '0097_repair_dangling_content_revisions.sql'), 'utf8')
const migration0098 = readFileSync(resolve(migrationDir, '0098_tenant_page_translation_and_redirect_scope.sql'), 'utf8')
const migration0099 = readFileSync(resolve(migrationDir, '0099_repair_canonical_tenant_blocks.sql'), 'utf8')
const migration0104 = readFileSync(resolve(migrationDir, '0104_repair_ncls_canonical_parity.sql'), 'utf8')
const migration0100 = readFileSync(resolve(migrationDir, '0100_remove_translation_automation.sql'), 'utf8')
const migration0101 = readFileSync(resolve(migrationDir, '0101_invoice_payment_ledger.sql'), 'utf8')

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

test('0092 through 0099 apply as one chain with translated fixtures', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [{ type: 'home_hero', title: 'Home', subtitle: 'Source subtitle' }])
  db.prepare(`
    INSERT INTO site_content (id, organization_id, site_id, page, field, content, hero_title, hero_subtitle)
    VALUES (?, ?, ?, 'home', 'hero', ?, ?, ?)
  `).run('chain-source', 'org-test', 'site-test', 'Source body', 'Home', 'Source subtitle')
  db.prepare(`
    INSERT INTO site_content (id, organization_id, site_id, page, field, content)
    VALUES (?, ?, ?, 'home', 'body', ?)
  `).run('chain-source-body', 'org-test', 'site-test', 'Source prose')
  db.prepare(`
    INSERT INTO site_content_translations (id, organization_id, site_id, locale, page, field, content, hero_title, hero_subtitle, status)
    VALUES (?, ?, ?, 'th', 'home', 'hero', ?, ?, ?, 'published')
  `).run('chain-published-translation', 'org-test', 'site-test', 'Translated body', 'บ้าน', 'คำบรรยาย')
  db.prepare(`
    INSERT INTO site_content_translations (id, organization_id, site_id, locale, page, field, content, status)
    VALUES (?, ?, ?, 'th', 'home', 'hero.subtitle', ?, 'draft')
  `).run('chain-draft-translation', 'org-test', 'site-test', 'ฉบับร่าง')
  db.prepare(`
    INSERT INTO site_content_translations (id, organization_id, site_id, locale, page, field, content, status)
    VALUES (?, ?, ?, 'th', 'home', 'body', ?, 'draft')
  `).run('chain-draft-body-translation', 'org-test', 'site-test', 'ฉบับร่างเนื้อหา')

  for (const migration of [migration0092, migration0093, migration0094, migration0095, migration0096, migration0097, migration0098, migration0099]) {
    db.exec(migration)
  }

  const variant = db.prepare(`
    SELECT v.status, v.published_revision_id, d.draft_revision_id
      FROM tenant_page_variants v
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
     WHERE v.page_id = 'page-test' AND v.locale = 'th'
  `).get() as { status: string; published_revision_id: string | null; draft_revision_id: string | null } | undefined
  assert.equal(variant?.status, 'published')
  assert.ok(variant?.published_revision_id)
  assert.ok(variant?.draft_revision_id)
  assert.notEqual(variant?.published_revision_id, variant?.draft_revision_id)
  const publishedSnapshot = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(variant?.published_revision_id) as { snapshot_json: string }).snapshot_json) as { blocks: Array<{ data: Record<string, unknown> }> }
  const draftSnapshot = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(variant?.draft_revision_id) as { snapshot_json: string }).snapshot_json) as { blocks: Array<{ data: Record<string, unknown> }> }
  assert.equal(publishedSnapshot.blocks.some(block => Object.values(block.data).includes('ฉบับร่างเนื้อหา')), false)
  assert.equal(draftSnapshot.blocks.some(block => Object.values(block.data).includes('ฉบับร่างเนื้อหา')), true)
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM content_blocks WHERE id LIKE 'migrated-site-content-translation-block:%' OR id LIKE 'migrated-location-translation-block:%'").get() as { count: number }).count,
    0,
  )
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

test('0100 retires translation automation state without dropping localized content tables', () => {
  const db = databaseBeforeTenantPageMigration()
  db.exec(migration0092)
  db.exec(migration0097)
  db.exec(migration0098)
  db.prepare('INSERT INTO translation_jobs (id, organization_id, site_id, source_locale, target_locale) VALUES (?, ?, ?, ?, ?)').run('translation-job-test', 'org-test', 'site-test', 'en', 'th')
  db.prepare('INSERT INTO site_entitlements (id, site_id, organization_id, key, value, source) VALUES (?, ?, ?, ?, ?, ?)').run('translation-entitlement-test', 'site-test', 'org-test', 'translation', 'true', 'test')
  db.prepare('INSERT INTO organization_entitlements (id, organization_id, key, value, source) VALUES (?, ?, ?, ?, ?)').run('translation-languages-entitlement-test', 'org-test', 'translation_languages', '1', 'test')

  db.exec(migration0100)

  for (const tableName of ['translation_job_items', 'translation_jobs', 'tenant_page_translation_fields']) {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name: string } | undefined
    assert.equal(table, undefined)
  }
  const entitlements = db.prepare("SELECT COUNT(*) AS count FROM (SELECT key FROM site_entitlements WHERE key IN ('translation', 'translation_languages') UNION ALL SELECT key FROM organization_entitlements WHERE key IN ('translation', 'translation_languages'))").get() as { count: number }
  assert.equal(entitlements.count, 0)
  for (const tableName of ['business_location_translations', 'menu_translations', 'menu_item_translations', 'post_translations']) {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name: string } | undefined
    assert.equal(table?.name, tableName)
  }
})

test('0101 preserves known billing coverage and invalidates paid rows without a boundary', () => {
  const db = databaseBeforeTenantPageMigration()
  for (const migration of [migration0092, migration0093, migration0094, migration0095, migration0096Billing, migration0096, migration0097Billing, migration0097, migration0098, migration0099, migration0100]) {
    db.exec(migration)
  }
  db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').run('org-unknown', 'Unknown', 'unknown')
  db.prepare(`
    INSERT INTO organization_billing
      (organization_id, stripe_subscription_id, payment_status, paid_through, last_paid_invoice_id, last_payment_event_created, last_payment_event_id)
    VALUES (?, ?, 'paid', ?, ?, ?, ?), (?, ?, 'paid', NULL, NULL, ?, ?)
  `).run(
    'org-test', 'sub-known', '2026-09-01T00:00:00.000Z', 'in-known', 10, 'evt-known',
    'org-unknown', 'sub-unknown', 11, 'evt-unknown',
  )
  db.prepare(`
    INSERT INTO site_billing
      (id, site_id, organization_id, payment_status, paid_through, last_paid_invoice_id)
    VALUES (?, ?, ?, 'paid', ?, ?)
  `).run('site-billing-test', 'site-test', 'org-test', '2026-09-01T00:00:00.000Z', 'in-known')

  db.exec(migration0101)

  const known = db.prepare('SELECT payment_status, paid_through, last_paid_invoice_id FROM organization_billing WHERE organization_id = ?').get('org-test') as { payment_status: string; paid_through: string; last_paid_invoice_id: string } | undefined
  assert.deepEqual(known, { payment_status: 'paid', paid_through: '2026-09-01T00:00:00.000Z', last_paid_invoice_id: 'in-known' })
  const unknown = db.prepare('SELECT payment_status, paid_through, last_paid_invoice_id FROM organization_billing WHERE organization_id = ?').get('org-unknown') as { payment_status: string; paid_through: string | null; last_paid_invoice_id: string | null } | undefined
  assert.deepEqual(unknown, { payment_status: 'unknown', paid_through: null, last_paid_invoice_id: null })
  const ledger = db.prepare('SELECT stripe_invoice_id, status, base_plan_price_id, period_end FROM stripe_invoice_payments WHERE organization_id = ?').get('org-test') as { stripe_invoice_id: string; status: string; base_plan_price_id: string; period_end: string } | undefined
  assert.deepEqual(ledger, { stripe_invoice_id: 'in-known', status: 'paid', base_plan_price_id: 'legacy', period_end: '2026-09-01T00:00:00.000Z' })
  const site = db.prepare('SELECT payment_status, paid_through, last_paid_invoice_id FROM site_billing WHERE site_id = ?').get('site-test') as { payment_status: string; paid_through: string; last_paid_invoice_id: string } | undefined
  assert.deepEqual(site, { payment_status: 'paid', paid_through: '2026-09-01T00:00:00.000Z', last_paid_invoice_id: 'in-known' })
})

test('0099 normalizes migrated block payloads and rebuilds the published snapshot', () => {
  const db = databaseBeforeTenantPageMigration()
  insertLegacyPage(db, [
    { type: 'home_hero', title: 'Home', label: 'Learn more', url: '/about' },
    { type: 'services_intro', title: 'Our Services' },
    { type: 'video_feature', features: [{ name: 'Approach', desc: 'How we help' }] },
    { type: 'qa', title: 'Questions' },
    { type: 'reviews', title: 'Client stories' },
  ])

  db.exec(migration0092)
  db.exec(migration0099)

  const rows = db.prepare(`
    SELECT b.type, b.position, b.data_json
      FROM content_blocks b
      JOIN content_documents d ON d.id = b.document_id
      JOIN tenant_page_variants v ON v.id = d.owner_id
     WHERE v.page_id = ? AND d.owner_type = 'tenant_page'
     ORDER BY b.position, b.id
  `).all('page-test') as Array<{ type: string; position: number; data_json: string }>
  const services = rows.find(row => row.type === 'offering_grid')
  const approach = rows.find(row => row.type === 'feature_grid' && JSON.parse(row.data_json).section === 'approach')
  const faq = rows.find(row => row.type === 'faq')
  const reviews = rows.find(row => row.type === 'testimonial_grid')
  assert.deepEqual(JSON.parse(services?.data_json ?? '{}'), { title: 'Our Services', source: 'site_offerings', section: 'services' })
  assert.deepEqual(JSON.parse(approach?.data_json ?? '{}'), { items: [{ title: 'Approach', description: 'How we help' }], section: 'approach' })
  assert.deepEqual(JSON.parse(faq?.data_json ?? '{}'), { title: 'Questions', source: 'page_qa', section: 'qa' })
  assert.deepEqual(JSON.parse(reviews?.data_json ?? '{}'), { title: 'Client stories', source: 'site_reviews', section: 'reviews' })

  const document = db.prepare(`
    SELECT d.published_revision_id
      FROM content_documents d
      JOIN tenant_page_variants v ON v.id = d.owner_id AND d.owner_type = 'tenant_page'
     WHERE v.page_id = ? AND v.locale = 'en'
  `).get('page-test') as { published_revision_id: string } | undefined
  assert.ok(document?.published_revision_id)
  const snapshot = JSON.parse((db.prepare('SELECT snapshot_json FROM content_revisions WHERE id = ?').get(document.published_revision_id) as { snapshot_json: string }).snapshot_json) as { blocks: Array<{ data: Record<string, unknown> }> }
  assert.equal(snapshot.blocks.find(block => block.data.section === 'services')?.data.source, 'site_offerings')
  assert.equal(snapshot.blocks.find(block => block.data.section === 'approach')?.data.items instanceof Array, true)
})

test('0104 repairs NCLS donation destinations and canonical home order in every live document', () => {
  const db = databaseBeforeTenantPageMigration()
  for (const migration of [migration0092, migration0093, migration0094, migration0095, migration0096, migration0097, migration0098, migration0099]) {
    db.exec(migration)
  }
  db.prepare('INSERT INTO sites (id, organization_id, slug, subdomain, vertical) VALUES (?, ?, ?, ?, ?)').run('site-ncls-blawby', 'org-test', 'ncls', 'ncls', 'service')
  db.prepare('INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run('locale-ncls', 'org-test', 'site-ncls-blawby', 'en', 'English', 1, 'published')

  const pages = [
    { id: 'ncls-home-page', parentPath: '/', path: '/', title: 'Home' },
    { id: 'ncls-donate-page', parentPath: '/legacy-donate', path: '/donate', title: 'Donate' },
  ]
  for (const page of pages) {
    db.prepare(`
      INSERT INTO tenant_pages (id, organization_id, site_id, path, title, page_type, status, source)
      VALUES (?, ?, ?, ?, ?, 'system', 'published', 'test')
    `).run(page.id, 'org-test', 'site-ncls-blawby', page.parentPath, page.title)
    db.prepare(`
      INSERT INTO tenant_page_variants
        (id, organization_id, site_id, page_id, locale, published_path, draft_path, title, status, ever_published)
      VALUES (?, ?, ?, ?, 'en', ?, ?, ?, 'published', 1)
    `).run(`${page.id}-variant`, 'org-test', 'site-ncls-blawby', page.id, page.path, page.path, page.title)
  }

  const homeBlocks = [
    ['home-hero', 'hero', 0, { section: 'hero' }],
    ['home-services', 'offering_grid', 1, { section: 'services' }],
    ['home-approach', 'feature_grid', 2, { section: 'approach' }],
    ['home-qa', 'faq', 3, { section: 'qa' }],
    ['home-reviews', 'testimonial_grid', 4, { section: 'reviews' }],
    ['home-consultation', 'contact_cta', 5, { section: 'consultation' }],
    ['home-articles', 'feature_grid', 6, { section: 'articles' }],
    ['home-articles-more', 'button_group', 7, { section: 'articles-more' }],
  ] as const
  const donationBlocks = [
    ['donate-hero', 'hero', 0, { section: 'page-hero' }],
    ['donate-choices', 'donation_choices', 1, { section: 'donation', tiers: [{ amount: 100, title: 'Justice Advocate' }] }],
  ] as const

  function insertDocument(variantId: string, path: string, blocks: ReadonlyArray<readonly [string, string, number, Record<string, unknown>]>) {
    const documentId = `${variantId}-document`
    const revisionIds = [`${variantId}-draft`, `${variantId}-published`]
    const snapshotBlocks = blocks.map(([id, type, position, data]) => ({ id, type, position, data }))
    const snapshot = JSON.stringify({
      schemaVersion: 1,
      metadata: { locale: 'en', path, title: path === '/' ? 'Home' : 'Donate', summary: null, seoTitle: null, seoDescription: null, canonicalUrl: null, robots: null, pageType: 'system', recipe: path === '/' ? 'home' : 'donate' },
      blocks: snapshotBlocks,
    })
    db.prepare(`
      INSERT INTO content_documents (id, owner_type, owner_id, draft_revision_id, published_revision_id)
      VALUES (?, 'tenant_page', ?, ?, ?)
    `).run(documentId, variantId, revisionIds[0], revisionIds[1])
    for (const revisionId of revisionIds) {
      db.prepare(`
        INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, label)
        VALUES (?, ?, ?, '', ?)
      `).run(revisionId, documentId, snapshot, revisionId)
    }
    for (const [id, type, position, data] of blocks) {
      db.prepare(`
        INSERT INTO content_blocks (id, document_id, type, position, data_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, documentId, type, position, JSON.stringify(data))
    }
  }

  insertDocument('ncls-home-page-variant', '/', homeBlocks)
  insertDocument('ncls-donate-page-variant', '/donate', donationBlocks)
  db.exec(migration0104)

  const donation = db.prepare(`
    SELECT data_json FROM content_blocks WHERE id = 'donate-choices'
  `).get() as { data_json: string }
  assert.equal(JSON.parse(donation.data_json).destination, 'https://donate.stripe.com/bIY29UfAUec37GocMM')

  const donationRevisions = db.prepare(`
    SELECT r.snapshot_json
      FROM content_revisions r
      JOIN content_documents d ON d.id = r.document_id
     WHERE d.owner_id = 'ncls-donate-page-variant'
  `).all() as Array<{ snapshot_json: string }>
  assert.equal(donationRevisions.length, 2)
  for (const revision of donationRevisions) {
    assert.equal(JSON.parse(revision.snapshot_json).blocks[1].data.destination, 'https://donate.stripe.com/bIY29UfAUec37GocMM')
  }

  const homeRows = db.prepare(`
    SELECT json_extract(data_json, '$.section') AS section, position
      FROM content_blocks
     WHERE document_id = 'ncls-home-page-variant-document'
     ORDER BY position
  `).all() as Array<{ section: string; position: number }>
  assert.deepEqual(homeRows.map(row => row.section), ['hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'articles-more', 'consultation'])
  assert.deepEqual(homeRows.map(row => row.position), [0, 1, 2, 3, 4, 5, 6, 7])

  const homeRevisions = db.prepare(`
    SELECT r.snapshot_json
      FROM content_revisions r
      JOIN content_documents d ON d.id = r.document_id
     WHERE d.owner_id = 'ncls-home-page-variant'
  `).all() as Array<{ snapshot_json: string }>
  assert.equal(homeRevisions.length, 2)
  for (const revision of homeRevisions) {
    const homeSnapshot = JSON.parse(revision.snapshot_json) as { blocks: Array<{ position: number; data: { section: string } }> }
    assert.deepEqual(homeSnapshot.blocks.map(block => block.data.section), ['hero', 'services', 'approach', 'qa', 'reviews', 'articles', 'articles-more', 'consultation'])
    assert.deepEqual(homeSnapshot.blocks.map(block => block.position), [0, 1, 2, 3, 4, 5, 6, 7])
  }
})
