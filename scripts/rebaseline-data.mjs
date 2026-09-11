#!/usr/bin/env node
// Offline transfer of a database export into the current generated baseline.
// Never imported by application runtime.
//
//   node scripts/rebaseline-data.mjs <source.sql|source.sqlite> <target.sqlite> [--payload <payload.sql>] [--without-jwks]
//
// The target is created from migrations/0000_baseline.sql, every table is
// copied column-for-column, the data transforms below run against the copied
// rows, and the result is audited. With --payload the script also writes the
// data-only replacement that `wrangler d1 execute --file` applies to a database
// that already carries the baseline (its d1_migrations ledger is never touched).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { CONTENT_DOCUMENT_SCOPE_QUERY, MEDIA_PLACEMENT_OWNER_AUDIT_QUERY } from './audit-orphaned-media-placements.mjs'

const BASELINE = 'migrations/0000_baseline.sql'
const hash = value => createHash('sha256').update(value).digest('hex')
const qi = value => `"${value.replaceAll('"', '""')}"`
const assert = (condition, message) => { if (!condition) throw new Error(message) }

export function openDatabase(path) {
  if (!path.endsWith('.sql')) return new Database(path, { readonly: true, fileMustExist: true })
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  db.exec(readFileSync(path, 'utf8'))
  return db
}

const tableNames = db => db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', '__drizzle_migrations') ORDER BY name").all().map(row => row.name)
const columns = (db, table) => db.prepare(`PRAGMA table_info(${qi(table)})`).all().map(row => row.name)
const digest = (rows, names) => hash(rows.map(row => JSON.stringify(names.map(name => row[name]))).sort().join('\n'))

// Category labels of KrabiClaw's collections become their URL segment (utils/article-collections.ts).
const ARTICLE_CATEGORY_SLUG = `CASE (d.metadata_json ->> '$.category')
  WHEN 'Marketing' THEN 'marketing' WHEN 'Technology' THEN 'technology' WHEN 'Design' THEN 'design' WHEN 'Business' THEN 'business'
  WHEN 'SEO' THEN 'seo' WHEN 'Social Media' THEN 'social-media'
  WHEN 'Getting Started' THEN 'getting-started' WHEN 'Menu Management' THEN 'menu-management' WHEN 'Theme Customization' THEN 'theme-customization'
  WHEN 'SEO & Marketing' THEN 'seo-marketing' WHEN 'Integrations' THEN 'integrations' WHEN 'Advanced' THEN 'advanced' ELSE 'uncategorized' END`
const ARTICLE_NAV_KEYS = "'$.nav_section', '$.nav_title', '$.nav_order', '$.nav_section_order', '$.nav_group', '$.nav_group_order', '$.hide_from_nav', '$.featured_order'"
const FEATURED = "mp.owner_type = 'content_document' AND mp.slot = 'featured'"
const LEADS_ALREADY = `EXISTS (
  SELECT 1 FROM content_blocks cb JOIN media_placements bp
    ON bp.owner_type = 'content_block' AND bp.owner_id = cb.id AND bp.slot = 'media' AND bp.sort_order = 0
   WHERE cb.document_id = mp.owner_id AND cb.parent_block_id IS NULL AND cb.position = 0 AND cb.type = 'image' AND bp.asset_id = mp.asset_id)`

/** Ordered data transforms. Each is idempotent on its own result. */
export const TRANSFORMS = [
  // --- KrabiClaw's own site runs the platform template and owns the apex domain
  { name: 'platform_site_template', sql: `UPDATE sites SET theme_id = 'krabiclaw-theme-v1', vertical = 'service', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 'platform' AND theme_id <> 'krabiclaw-theme-v1'` },
  { name: 'platform_subdomain_demoted', sql: `UPDATE site_domains SET role = 'secondary', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE site_id = 'platform' AND role = 'canonical' AND domain <> 'krabiclaw.com'` },
  { name: 'platform_apex_domain', sql: `INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, desired_state, dns_status)
    SELECT 'domain-platform-apex', organization_id, id, 'krabiclaw.com', 'custom', 'canonical', 'active', 'active', 'valid'
      FROM sites WHERE id = 'platform' ON CONFLICT(domain) DO NOTHING` },
  // --- the platform split (#870): one site model, one contact model, one telemetry surface
  { name: 'platform_contact_requests_removed', sql: "DELETE FROM requests WHERE kind = 'platform_contact'" },
  { name: 'platform_activity_scope_is_global', sql: "UPDATE activity_entries SET scope_kind = 'global' WHERE scope_kind = 'platform'" },
  { name: 'platform_notification_scope_is_global', sql: "UPDATE activity_entries SET scope_kind = 'global' WHERE kind = 'notification' AND scope_kind = 'platform'" },
  { name: 'platform_mcp_telemetry_removed', sql: "DELETE FROM mcp_tool_call_events WHERE mcp_surface = 'platform'" },
  { name: 'work_requests_removed', sql: "DELETE FROM requests WHERE kind = 'work'" },
  // Documentation is KrabiClaw's second article collection; every article names its collection.
  { name: 'documentation_becomes_articles', sql: `UPDATE content_documents SET
      kind = 'article',
      status = COALESCE(status, 'published'),
      visibility = 'public',
      published_at = COALESCE(published_at, created_at),
      first_published_at = COALESCE(first_published_at, published_at, created_at),
      metadata_json = json_object('collection', 'docs', 'category', metadata_json ->> '$.category', 'tags', json('[]'), 'slug_manually_overridden', 1)
    WHERE kind = 'platform_doc'` },
  { name: 'articles_carry_collection', sql: `UPDATE content_documents SET metadata_json = json_set(metadata_json, '$.collection', 'blog')
    WHERE kind = 'article' AND row_role = 'root' AND json_type(metadata_json, '$.collection') IS NULL` },
  { name: 'article_nav_model_removed', sql: `UPDATE content_documents SET metadata_json = json_remove(metadata_json, ${ARTICLE_NAV_KEYS})
    WHERE kind = 'article' AND (${ARTICLE_NAV_KEYS.split(', ').map(key => `json_type(metadata_json, ${key}) IS NOT NULL`).join(' OR ')})` },
  // --- the featured placement becomes the leading image block (#873)
  { name: 'cover_blocks_make_room', sql: `UPDATE content_blocks SET position = position + 1
    WHERE parent_block_id IS NULL AND document_id IN (SELECT mp.owner_id FROM media_placements mp WHERE ${FEATURED} AND NOT ${LEADS_ALREADY})` },
  { name: 'cover_blocks_inserted', sql: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json)
    SELECT 'cover-' || mp.owner_id, mp.owner_id, NULL, 'image', 0, NULL, '{"caption":""}'
      FROM media_placements mp WHERE ${FEATURED} AND NOT ${LEADS_ALREADY}` },
  { name: 'cover_placements_inserted', sql: `INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status)
    SELECT 'cover-placement-' || mp.owner_id, mp.organization_id, mp.site_id, 'content_block', 'cover-' || mp.owner_id, 'media', mp.asset_id, 0, 'active'
      FROM media_placements mp WHERE ${FEATURED} AND EXISTS (SELECT 1 FROM content_blocks cb WHERE cb.id = 'cover-' || mp.owner_id)` },
  { name: 'featured_placements_removed', sql: "DELETE FROM media_placements WHERE owner_type = 'content_document' AND slot = 'featured'" },
  // --- FAQ items become Q&A records; every FAQ block lists the page's Q&A
  { name: 'faq_items_become_qa', sql: `INSERT INTO content_documents (id, organization_id, site_id, kind, row_role, locale, scope_path, title, summary, status, source, sort_order, metadata_json)
    SELECT 'qa-' || cb.id || '-' || j.key, d.organization_id, d.site_id, 'qa', 'root', 'en',
           CASE WHEN d.kind = 'page' THEN d.path
                WHEN s.theme_id = 'krabiclaw-theme-v1' THEN '/' || COALESCE(d.metadata_json ->> '$.collection', 'blog') || '/' || (${ARTICLE_CATEGORY_SLUG}) || '/' || d.slug
                WHEN s.vertical = 'service' THEN '/article/' || d.slug ELSE '/blog/' || d.slug END,
           j.value ->> '$.question', j.value ->> '$.answer', 'published', 'manual', j.key,
           json_object('is_owner_answer', 1, 'upvote_count', 0)
      FROM content_blocks cb
      JOIN content_documents d ON d.id = cb.document_id AND d.row_role = 'root'
      JOIN sites s ON s.id = d.site_id, json_each(cb.data_json, '$.items') j
     WHERE cb.type = 'faq' AND json_type(j.value, '$.question') = 'text' AND trim(j.value ->> '$.question') <> ''
       AND NOT EXISTS (SELECT 1 FROM content_documents q WHERE q.kind = 'qa' AND q.row_role = 'root' AND q.site_id = d.site_id
                         AND q.scope_path IS (CASE WHEN d.kind = 'page' THEN d.path
                                                   WHEN s.theme_id = 'krabiclaw-theme-v1' THEN '/' || COALESCE(d.metadata_json ->> '$.collection', 'blog') || '/' || (${ARTICLE_CATEGORY_SLUG}) || '/' || d.slug
                                                   WHEN s.vertical = 'service' THEN '/article/' || d.slug ELSE '/blog/' || d.slug END)
                         AND q.title = j.value ->> '$.question')` },
  { name: 'faq_blocks_read_page_qa', sql: `UPDATE content_blocks SET data_json = CASE
      WHEN json_type(data_json, '$.title') = 'text' AND trim(data_json ->> '$.title') <> '' THEN json_object('title', data_json ->> '$.title', 'source', 'page_qa')
      ELSE json_object('source', 'page_qa') END
    WHERE type = 'faq' AND (json_type(data_json, '$.items') IS NOT NULL OR COALESCE(data_json ->> '$.source', '') NOT IN ('page_qa', 'site_qa'))` },
  // --- a FAQ block names the set it lists. Until now a page_qa block on a page with
  // no questions of its own fell through to the site-wide set at render time; the
  // blocks that showed the site-wide set that way now say so.
  { name: 'faq_blocks_declare_site_qa', sql: `UPDATE content_blocks SET data_json = json_set(data_json, '$.source', 'site_qa')
    WHERE type = 'faq' AND data_json ->> '$.source' = 'page_qa'
      AND document_id IN (
        SELECT d.id FROM content_documents d
         WHERE d.kind = 'page' AND d.row_role = 'root' AND d.path IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM content_documents q WHERE q.kind = 'qa' AND q.row_role = 'root' AND q.site_id = d.site_id AND q.location_id IS NULL AND q.scope_path = d.path AND q.status = 'published')
           AND EXISTS (SELECT 1 FROM content_documents q WHERE q.kind = 'qa' AND q.row_role = 'root' AND q.site_id = d.site_id AND q.location_id IS NULL AND q.scope_path IS NULL AND q.status = 'published'))` },
  // --- a hero paragraph is `subtitle`: the name onboarding, the site template and the
  // CMS hero editor all write, and the only name Saya and Blawby now read. Blawby's
  // private second name for the same field silently dropped whatever the owner typed,
  // so the text moves onto the canonical key and the retired key is dropped.
  { name: 'hero_blocks_carry_subtitle', sql: `UPDATE content_blocks SET data_json = json_remove(
      CASE WHEN json_type(data_json, '$.subtitle') IS NULL THEN json_set(data_json, '$.subtitle', json_extract(data_json, '$.description')) ELSE data_json END,
      '$.description')
    WHERE type = 'hero' AND json_type(data_json, '$.description') IS NOT NULL` },
  // The seeder used to write the page's key as its document title, so system
  // pages carried 'about' / 'contact' / 'location' and rendered them as h1s
  // through a reader fallback. It writes the page's name now; these are the
  // rows it already made.
  { name: 'system_page_titles_are_names', sql: `UPDATE content_documents SET title = CASE title
      WHEN 'home' THEN 'Home' WHEN 'about' THEN 'About' WHEN 'contact' THEN 'Contact'
      WHEN 'location' THEN 'Location' WHEN 'services' THEN 'Services' WHEN 'pricing' THEN 'Pricing'
      WHEN 'donate' THEN 'Donate' WHEN 'schedule' THEN 'Schedule' WHEN 'privacy' THEN 'Privacy Policy'
      WHEN 'terms' THEN 'Terms of Service' WHEN 'third-party-notices' THEN 'Third-Party Notices'
      ELSE title END
    WHERE kind = 'page' AND title IN ('home','about','contact','location','services','pricing','donate','schedule','privacy','terms','third-party-notices')` },
  // A hero with no title of its own rendered the document title instead, so
  // removing that fallback would silently drop the heading these pages show
  // today. The heading becomes the block's own, which is the only place a
  // reader looks now. A document title long enough to be body copy is not a
  // heading and is left alone rather than pushed into an h1.
  { name: 'hero_blocks_carry_title', sql: `UPDATE content_blocks SET data_json = json_set(data_json, '$.title', (
      SELECT d.title FROM content_documents d WHERE d.id = content_blocks.document_id))
    WHERE type = 'hero'
      AND trim(coalesce(json_extract(data_json, '$.title'), '')) = ''
      AND EXISTS (SELECT 1 FROM content_documents d WHERE d.id = content_blocks.document_id
        AND trim(coalesce(d.title, '')) <> '' AND length(d.title) <= 120)` },
]

const LOCALIZED_OWNER_TABLES = {
  site: 'sites', business_location: 'business_locations', product: 'products', product_category: 'product_categories',
  offering: 'offerings', media_asset: 'media_assets',
}

/** Every query must return no rows on a valid target. */
export const TARGET_INVARIANT_QUERIES = {
  media_owner_scope: MEDIA_PLACEMENT_OWNER_AUDIT_QUERY,
  document_owner_scope: `WITH scope AS (${CONTENT_DOCUMENT_SCOPE_QUERY}) SELECT d.id FROM content_documents d WHERE (SELECT count(*) FROM scope s WHERE s.id = d.id) <> 1`,
  editorial_representation_scope: `SELECT d.id FROM content_documents d WHERE d.row_role = 'representation' AND NOT EXISTS (
    SELECT 1 FROM content_documents r WHERE r.id = d.root_id AND r.row_role = 'root' AND r.locale = 'en'
      AND r.kind = d.kind AND r.organization_id = d.organization_id AND r.site_id = d.site_id)`,
  english_source_locale: `SELECT s.id FROM sites s WHERE NOT EXISTS (SELECT 1 FROM site_locales l WHERE l.site_id = s.id AND l.organization_id = s.organization_id AND l.locale = 'en' AND l.is_source = 1)`,
  block_parent_scope: `SELECT b.id FROM content_blocks b WHERE b.parent_block_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_blocks p WHERE p.id = b.parent_block_id AND p.document_id = b.document_id)`,
  localized_resource_owner_scope: `SELECT r.id FROM resource_localizations r WHERE NOT (
    ${Object.entries(LOCALIZED_OWNER_TABLES).map(([type, table]) => `(r.resource_type = '${type}' AND EXISTS (SELECT 1 FROM ${table} o WHERE o.id = r.resource_id AND o.organization_id = r.organization_id AND ${type === 'site' ? 'o.id' : 'o.site_id'} = r.site_id))`).join(' OR ')})`,
  activity_request_scope: `SELECT e.id FROM activity_entries e WHERE e.scope_kind = 'request' AND NOT EXISTS (
    SELECT 1 FROM requests r WHERE r.id = e.request_id AND r.kind IN ('contact','reservation','experience_booking'))`,
  // The retired model must leave no trace.
  no_platform_doc: "SELECT id FROM content_documents WHERE kind = 'platform_doc'",
  no_platform_contact: "SELECT id FROM requests WHERE kind = 'platform_contact'",
  no_work_requests: "SELECT id FROM requests WHERE kind = 'work'",
  no_platform_activity_scope: "SELECT id FROM activity_entries WHERE scope_kind = 'platform'",
  no_platform_mcp_surface: "SELECT id FROM mcp_tool_call_events WHERE mcp_surface = 'platform'",
  no_document_featured_placements: "SELECT id FROM media_placements WHERE owner_type = 'content_document' AND slot = 'featured'",
  no_faq_items: "SELECT id FROM content_blocks WHERE type = 'faq' AND json_type(data_json, '$.items') IS NOT NULL",
  no_hero_description: "SELECT id FROM content_blocks WHERE type = 'hero' AND json_type(data_json, '$.description') IS NOT NULL",
  no_slug_cased_page_titles: "SELECT id FROM content_documents WHERE kind = 'page' AND title IN ('home','about','contact','location','services','pricing','donate','schedule','privacy','terms','third-party-notices')",
  no_docs_pages: "SELECT id FROM content_documents WHERE kind = 'page' AND path LIKE '/docs/%'",
  articles_carry_collection: "SELECT id FROM content_documents WHERE kind = 'article' AND row_role = 'root' AND (metadata_json ->> '$.collection') NOT IN ('blog', 'docs')",
  one_platform_site: "SELECT count(*) AS n FROM sites WHERE theme_id = 'krabiclaw-theme-v1' HAVING n <> 1",
  platform_apex_canonical: "SELECT s.id FROM sites s WHERE s.theme_id = 'krabiclaw-theme-v1' AND NOT EXISTS (SELECT 1 FROM site_domains d WHERE d.site_id = s.id AND d.domain = 'krabiclaw.com' AND d.role = 'canonical' AND d.status = 'active')",
}

export function auditTargetInvariants(target) {
  return Object.entries(TARGET_INVARIANT_QUERIES).map(([name, query]) => ({
    name, violations: target.prepare(query).all().reduce((total, row) => total + Number(row.orphaned_count ?? 1), 0), sql_sha256: hash(query),
  }))
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  return `'${String(value).replaceAll("'", "''")}'`
}

/** Child-first order: a table appears before every table it references. */
function childFirstOrder(db, tables) {
  const fks = tables.flatMap(table => db.prepare(`PRAGMA foreign_key_list(${qi(table)})`).all().map(row => ({ child: table, parent: row.table })))
  // requests -> reviews -> review_requests -> requests is the schema's cycle; requests leads.
  const order = tables.includes('requests') ? ['requests'] : []
  const pending = new Set(tables.filter(table => !order.includes(table)))
  while (pending.size) {
    const leaves = [...pending].filter(table => !fks.some(fk => fk.parent === table && fk.child !== table && pending.has(fk.child))).sort()
    assert(leaves.length > 0, `Unresolved foreign key cycle: ${[...pending].join(', ')}`)
    for (const table of leaves) { order.push(table); pending.delete(table) }
  }
  return order
}

export function writePayload(target, payloadPath, { withoutJwks = false } = {}) {
  const tables = tableNames(target).filter(table => !(withoutJwks && table === 'jwks'))
  const order = childFirstOrder(target, tables)
  const lines = ['PRAGMA foreign_keys = OFF;', 'PRAGMA defer_foreign_keys = ON;', ...order.map(table => `DELETE FROM ${qi(table)};`)]
  for (const table of [...order].reverse()) {
    const names = columns(target, table)
    for (const row of target.prepare(`SELECT * FROM ${qi(table)}`).all()) {
      lines.push(`INSERT INTO ${qi(table)} (${names.map(qi).join(', ')}) VALUES (${names.map(name => sqlLiteral(row[name])).join(', ')});`)
    }
  }
  lines.push('PRAGMA foreign_keys = ON;')
  writeFileSync(payloadPath, lines.join('\n') + '\n', { mode: 0o600 })
  // Replaying the payload onto a populated copy must reproduce the target exactly.
  const replay = new Database(':memory:')
  replay.exec(readFileSync(resolve(BASELINE), 'utf8'))
  replay.pragma('foreign_keys = ON')
  replay.exec(readFileSync(payloadPath, 'utf8'))
  replay.exec(readFileSync(payloadPath, 'utf8'))
  for (const table of tables) {
    const names = columns(target, table)
    assert(digest(target.prepare(`SELECT * FROM ${qi(table)}`).all(), names) === digest(replay.prepare(`SELECT * FROM ${qi(table)}`).all(), names), `Payload replay differs: ${table}`)
  }
  assert(replay.pragma('foreign_key_check').length === 0, 'Payload replay has foreign key violations')
  replay.close()
  return { tables: tables.length, statements: lines.length }
}

/**
 * @typedef {{ table: string, source_rows: number, target_rows: number }} TableTransfer
 * @typedef {{ baseline_sha256: string, tables: TableTransfer[], retired_tables?: string[], retired_columns?: Record<string, string[]>, transforms: Array<{ name: string, changes: number, sql_sha256: string }>,
 *   invariants: Array<{ name: string, violations: number, sql_sha256: string }>, payload?: { tables: number, statements: number } }} RebaselineManifest
 */

/**
 * @param {string} sourcePath
 * @param {string} targetPath
 * @param {{ payloadPath?: string | null, withoutJwks?: boolean }} [options]
 * @returns {RebaselineManifest}
 */
export function rebaseline(sourcePath, targetPath, { payloadPath = null, withoutJwks = false } = {}) {
  assert(!existsSync(targetPath), `Target already exists: ${targetPath}`)
  const baseline = readFileSync(resolve(BASELINE), 'utf8')
  const source = openDatabase(resolve(sourcePath))
  // Rows are copied and transformed in a staging copy of the baseline with CHECK
  // enforcement off: the source still holds the retired values the transforms
  // rewrite. The final target then re-inserts every row under full enforcement,
  // so nothing the transforms missed can survive into it.
  const stage = new Database(':memory:')
  const target = new Database(targetPath)
  /** @type {RebaselineManifest} */
  const manifest = { baseline_sha256: hash(baseline), tables: [], transforms: [], invariants: [] }
  try {
    stage.exec(baseline)
    stage.pragma('ignore_check_constraints = ON')
    stage.pragma('foreign_keys = ON')
    const names = tableNames(stage)
    const sourceTables = tableNames(source)
    const missing = names.filter(table => !sourceTables.includes(table))
    assert(missing.length === 0, `Source lacks baseline tables: ${missing.join(', ')}`)
    // Tables and columns the baseline no longer has are retired features; their
    // rows and values are dropped and the manifest names them.
    manifest.retired_tables = sourceTables.filter(table => !names.includes(table))
    manifest.retired_columns = {}
    const copy = (from, to, verifyColumnsAgainstBaseline) => to.transaction(() => {
      to.pragma('defer_foreign_keys = ON')
      for (const table of names) {
        const targetColumns = columns(to, table)
        if (verifyColumnsAgainstBaseline) {
          const sourceColumns = columns(from, table)
          const absent = targetColumns.filter(name => !sourceColumns.includes(name))
          assert(absent.length === 0, `${table}: source lacks baseline columns ${absent.join(', ')}`)
          const retired = sourceColumns.filter(name => !targetColumns.includes(name))
          if (retired.length) manifest.retired_columns[table] = retired
        }
        const rows = from.prepare(`SELECT * FROM ${qi(table)}`).all()
        const insert = to.prepare(`INSERT INTO ${qi(table)} (${targetColumns.map(qi).join(',')}) VALUES (${targetColumns.map(() => '?').join(',')})`)
        for (const row of rows) insert.run(...targetColumns.map(name => row[name]))
        assert(digest(rows, targetColumns) === digest(to.prepare(`SELECT * FROM ${qi(table)}`).all(), targetColumns), `${table}: copy differs`)
      }
    })()
    copy(source, stage, true)
    for (const table of names) manifest.tables.push({ table, source_rows: stage.prepare(`SELECT count(*) AS n FROM ${qi(table)}`).get().n })
    stage.transaction(() => {
      for (const transform of TRANSFORMS) {
        const result = stage.prepare(transform.sql).run()
        manifest.transforms.push({ name: transform.name, changes: result.changes, sql_sha256: hash(transform.sql) })
      }
    })()
    target.exec(baseline)
    target.pragma('foreign_keys = ON')
    copy(stage, target, false)
    for (const entry of manifest.tables) entry.target_rows = target.prepare(`SELECT count(*) AS n FROM ${qi(entry.table)}`).get().n
    assert(target.pragma('foreign_key_check').length === 0, 'Foreign key violations after transfer')
    assert(target.pragma('integrity_check', { simple: true }) === 'ok', 'Integrity check failed')
    manifest.invariants = auditTargetInvariants(target)
    const broken = manifest.invariants.filter(result => result.violations > 0)
    assert(broken.length === 0, `Invariant violations: ${broken.map(result => `${result.name}=${result.violations}`).join(', ')}`)
    if (payloadPath) manifest.payload = writePayload(target, payloadPath, { withoutJwks })
    writeFileSync(`${targetPath}.manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 })
    return manifest
  } finally {
    source.close()
    stage.close()
    target.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = name => { const index = args.indexOf(name); return index >= 0 ? args.splice(index, 1).length > 0 : false }
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args.splice(index, 2)[1] : null }
  const withoutJwks = flag('--without-jwks')
  const payloadPath = option('--payload')
  const [sourcePath, targetPath] = args
  if (!sourcePath || !targetPath) throw new Error('Usage: rebaseline-data.mjs <source.sql|source.sqlite> <target.sqlite> [--payload <payload.sql>] [--without-jwks]')
  const manifest = rebaseline(sourcePath, targetPath, { payloadPath, withoutJwks })
  const rows = manifest.tables.reduce((n, t) => n + t.target_rows, 0)
  console.log(`Rebaseline passed: ${manifest.tables.length} tables, ${rows} rows; transforms: ${manifest.transforms.map(t => `${t.name}=${t.changes}`).join(', ')}`)
}
