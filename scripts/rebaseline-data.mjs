#!/usr/bin/env node
// Offline transfer of a database export into the current generated baseline.
// Never imported by application runtime.
//
//   node scripts/rebaseline-data.mjs <source.sql|source.sqlite> <target.sqlite> [--payload <payload.sql>] [--without-jwks]
//
// The target is created from migrations/0000_baseline.sql, every table the
// source and the baseline share is copied column-for-column, the transforms
// below run against the copied rows, and the result is audited. With --payload
// the script also writes the data-only replacement that
// `wrangler d1 execute --file` applies to a database that already carries the
// baseline (its d1_migrations ledger is never touched).
//
// The catalog epoch (#919) is a table-level reshape, not a column edit. The
// source carries `offerings`, `product_categories` and a site- and
// location-scoped `products`; the baseline carries an organization-level
// Product reaching sites through publications, locations through
// product_locations, money through variants and prices, grouping through
// collections, description through metafields, and time through sessions,
// bookings and reservations. Those tables are derived here rather than copied.
// A source that already carries the baseline has no `offerings` table, the
// derivation reads nothing, and the plain copy transfers it.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { CONTENT_DOCUMENT_SCOPE_QUERY, MEDIA_PLACEMENT_OWNER_AUDIT_QUERY } from './audit-orphaned-media-placements.mjs'
import { PROMOTE_PRODUCT_COVERS_SQL, RENUMBER_PRODUCT_GALLERIES_SQL } from './lib/product-covers.mjs'
import { serializeMetafieldValue } from '../shared/metafields.ts'
import { occurrenceKey } from '../shared/bookings.ts'
import { isSupportedMediaPlacement } from '../shared/media-placement-contract.ts'
import { localDateTimeToInstant } from '../utils/timezone.ts'

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

/**
 * Ordered data transforms that still have work against the source.
 * Each is idempotent on its own result.
 */
export const TRANSFORMS = [
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
  site: 'sites', business_location: 'business_locations', product: 'products',
  collection: 'collections', media_asset: 'media_assets',
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
  // A Product belongs to the organization, so its localization is scoped by
  // organization alone; every other localized resource is scoped by site too.
  localized_resource_owner_scope: `SELECT r.id FROM resource_localizations r WHERE NOT (
    ${Object.entries(LOCALIZED_OWNER_TABLES).map(([type, table]) => `(r.resource_type = '${type}' AND EXISTS (SELECT 1 FROM ${table} o WHERE o.id = r.resource_id AND o.organization_id = r.organization_id${type === 'site' ? ' AND o.id = r.site_id' : type === 'product' ? '' : ' AND o.site_id = r.site_id'}))`).join(' OR ')})`,
  activity_request_scope: `SELECT e.id FROM activity_entries e WHERE e.scope_kind = 'request' AND NOT EXISTS (
    SELECT 1 FROM requests r WHERE r.id = e.request_id AND r.kind IN ('contact','reservation','booking'))`,
  // The retired model must leave no trace.
  no_hero_description: "SELECT id FROM content_blocks WHERE type = 'hero' AND json_type(data_json, '$.description') IS NOT NULL",
  no_slug_cased_page_titles: "SELECT id FROM content_documents WHERE kind = 'page' AND title IN ('home','about','contact','location','services','pricing','donate','schedule','privacy','terms','third-party-notices')",
  no_offering_grid_blocks: "SELECT id FROM content_blocks WHERE type = 'offering_grid'",
  // Every Product is buyable: at least one variant. SQL cannot express this as
  // a constraint without making inserts circular, so it is audited here.
  every_product_has_a_variant: 'SELECT p.id FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)',
  // A location-scoped price belongs to a product that location actually offers.
  price_location_scope: `SELECT p.id FROM prices p WHERE p.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_variants v JOIN product_locations pl ON pl.product_id = v.product_id AND pl.location_id = p.location_id
     WHERE v.id = p.product_variant_id)`,
  // A page grid names pages published by the same site.
  page_grid_targets_exist: `SELECT b.id FROM content_blocks b, json_each(b.data_json, '$.page_ids') j
    WHERE b.type = 'page_grid' AND NOT EXISTS (
      SELECT 1 FROM content_documents d JOIN content_documents owner ON owner.id = b.document_id
       WHERE d.id = j.value AND d.kind = 'page' AND d.row_role = 'root' AND d.site_id = owner.site_id)`,
  // A booking holds a seat at a real occurrence of the product it names.
  booking_session_scope: `SELECT b.id FROM bookings b WHERE NOT EXISTS (
    SELECT 1 FROM product_sessions s WHERE s.id = b.product_session_id AND s.product_id = b.product_id)`,
}

export function auditTargetInvariants(target) {
  const results = Object.entries(TARGET_INVARIANT_QUERIES).map(([name, query]) => ({
    name, violations: target.prepare(query).all().reduce((total, row) => total + Number(row.orphaned_count ?? 1), 0), sql_sha256: hash(query),
  }))
  // The owner/slot vocabulary is declared in TypeScript, not in SQL: a slot the
  // contract does not know renders nowhere, and no constraint would catch it.
  const placements = target.prepare('SELECT DISTINCT owner_type, slot FROM media_placements').all()
  const unsupported = placements.filter(row => !isSupportedMediaPlacement(row))
  results.push({ name: 'media_placement_slots_are_declared', violations: unsupported.length, unsupported: unsupported.map(row => `${row.owner_type}:${row.slot}`) })
  return results
}

// ---------------------------------------------------------------------------
// The catalog epoch (#919)
// ---------------------------------------------------------------------------

// Tables the catalog derivation owns outright. `products` and `prices` are
// reshaped; `media_placements` and `resource_localizations` name products and
// offerings in their rows. Every other table the baseline shares with the
// source is copied, including tables that merely gained a column.
const DERIVED_FROM_RETIRED_MODEL = new Set(['products', 'prices', 'media_placements', 'resource_localizations'])
const RESERVATION_DURATION_MINUTES = 120
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const EMPTY_JSON = new Set(['[]', '{}', 'null'])
const blank = value => value === null || value === undefined || String(value).trim() === '' || EMPTY_JSON.has(String(value).trim())

/**
 * The single non-empty value a merge group holds for one field: `null` when
 * nobody supplied it, `undefined` when two rows disagree. An absent value never
 * competes with a present one, so a row that says nothing does not block a
 * merge — but two rows that say different things do.
 */
function only(values) {
  const distinct = [...new Set(values.filter(value => !blank(value)).map(String))]
  return distinct.length === 1 ? distinct[0] : distinct.length === 0 ? null : undefined
}

/** Authored fields whose disagreement blocks a merge. */
const MERGE_FIELDS = ['name', 'description', 'order_url', 'seo_title', 'seo_description', 'canonical_url', 'robots', 'tags_json', 'details_json', 'experience_json']

/**
 * A pre-#919 Product is scoped to one location, so a dish served at two
 * locations is two rows carrying the same dish. The baseline's Product belongs
 * to the organization and reaches locations through product_locations, so those
 * rows are one Product offered twice — but only where they actually say the
 * same thing. Where two rows disagree on authored copy there is no single
 * source for the merged value, so both survive under location-qualified slugs
 * and their old paths are redirected. Nothing is picked.
 */
export function planProductIdentity(stage) {
  const rows = stage.prepare(`SELECT p.id, p.organization_id, p.site_id, p.location_id, p.slug, ${MERGE_FIELDS.map(field => `p.${field}`).join(', ')},
      (SELECT l.slug FROM old.business_locations l WHERE l.id = p.location_id) AS location_slug
    FROM old.products p ORDER BY p.id`).all()
  const localized = stage.prepare("SELECT resource_id, locale, values_json FROM old.resource_localizations WHERE resource_type = 'product'").all()
  const localizedById = new Map(localized.map(row => [`${row.resource_id}:${row.locale}`, row.values_json]))

  const groups = new Map()
  for (const row of rows) {
    const key = `${row.organization_id} ${row.slug}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const plan = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      plan.push({ old_id: group[0].id, new_id: group[0].id, new_slug: group[0].slug, merged_into: null, redirect_from: null, site_id: group[0].site_id, location_id: group[0].location_id })
      continue
    }
    const conflicts = MERGE_FIELDS.filter(field => only(group.map(member => member[field])) === undefined)
    const locales = [...new Set(localized.filter(row => group.some(member => member.id === row.resource_id)).map(row => row.locale))]
    for (const locale of locales) {
      const values = group.map(member => localizedById.get(`${member.id}:${locale}`)).filter(Boolean).map(value => JSON.parse(value))
      for (const field of new Set(values.flatMap(value => Object.keys(value)))) {
        const rendered = values.map(value => value[field] === undefined ? null : typeof value[field] === 'string' ? value[field] : JSON.stringify(value[field]))
        if (only(rendered) === undefined) conflicts.push(`${locale}.${field}`)
      }
    }
    if (conflicts.length === 0) {
      // The surviving id is the lowest of the group: an opaque identifier,
      // never a choice between two authored values.
      const survivor = group.map(member => member.id).sort()[0]
      for (const member of group) {
        plan.push({ old_id: member.id, new_id: survivor, new_slug: member.slug, merged_into: member.id === survivor ? null : survivor, redirect_from: null, site_id: member.site_id, location_id: member.location_id })
      }
      continue
    }
    for (const member of group) {
      assert(member.location_slug, `Product ${member.id} has no location slug to qualify the contested slug "${member.slug}" with`)
      plan.push({
        old_id: member.id, new_id: member.id, new_slug: `${member.slug}-${member.location_slug}`,
        merged_into: null, redirect_from: member.slug, site_id: member.site_id, location_id: member.location_id,
        conflicts: [...new Set(conflicts)].join(','),
      })
    }
  }
  return plan
}

/** Metafield definitions the retired columns become, by namespace and key. */
const EXPERIENCE_METAFIELDS = {
  tagline: { name: 'Tagline', value_type: 'single_line_text' },
  pricing_note: { name: 'Pricing note', value_type: 'single_line_text' },
  meeting_point: { name: 'Meeting point', value_type: 'multi_line_text' },
  cancellation_policy: { name: 'Cancellation policy', value_type: 'multi_line_text' },
  included_items: { name: 'What is included', value_type: 'list.single_line_text' },
  what_to_bring: { name: 'What to bring', value_type: 'list.single_line_text' },
}

function deriveCatalog(stage, now, record) {
  const plan = planProductIdentity(stage)
  stage.exec('CREATE TEMP TABLE product_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL, new_slug TEXT NOT NULL, merged_into TEXT, redirect_from TEXT, site_id TEXT NOT NULL, location_id TEXT NOT NULL)')
  const insertMap = stage.prepare('INSERT INTO temp.product_map (old_id, new_id, new_slug, merged_into, redirect_from, site_id, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const row of plan) insertMap.run(row.old_id, row.new_id, row.new_slug, row.merged_into, row.redirect_from, row.site_id, row.location_id)
  record('products_merged', plan.filter(row => row.merged_into).length)
  record('products_slug_qualified', plan.filter(row => row.redirect_from).length)

  // --- the Product itself, and the variant that makes it buyable
  record('products', stage.prepare(`INSERT INTO products (id, organization_id, name, slug, description, active, order_url, unit_label, marketing_features, tags, metadata, tax_code, source, created_at, updated_at, created_by, updated_by)
    SELECT m.new_id, max(p.organization_id), max(nullif(trim(p.name), '')), max(m.new_slug),
      coalesce(max(nullif(trim(p.description), '')), ''), max(p.available), max(nullif(trim(p.order_url), '')),
      (SELECT max(nullif(op.unit, 'item')) FROM old.prices op JOIN temp.product_map om ON om.old_id = op.product_id WHERE om.new_id = m.new_id),
      '[]', coalesce(max(nullif(p.tags_json, '[]')), '[]'), '{}', NULL,
      max(p.source), min(p.created_at), max(p.updated_at), max(p.created_by), max(p.updated_by)
    FROM old.products p JOIN temp.product_map m ON m.old_id = p.id GROUP BY m.new_id`).run().changes)
  record('product_variants', stage.prepare(`INSERT INTO product_variants (id, organization_id, product_id, name, sku, active, sort_order, created_at, updated_at, created_by, updated_by)
    SELECT p.id || '-default', p.organization_id, p.id, p.name, NULL, 1, 0, p.created_at, p.updated_at, p.created_by, p.updated_by FROM products p`).run().changes)

  // --- money. A location-scoped price stays location-scoped; a "was" price
  // that is not above the current price says nothing and is dropped. A zero
  // amount on a product priced in words was a placeholder for "no amount",
  // which is what the pricing note now says: zero here would read as free.
  record('prices_compare_at_dropped', stage.prepare(`SELECT count(*) AS n FROM old.prices WHERE compare_at_amount_minor IS NOT NULL AND compare_at_amount_minor <= amount_minor`).get().n)
  record('prices', stage.prepare(`INSERT INTO prices (id, organization_id, product_variant_id, location_id, active, currency, unit_amount, type, recurring_interval, recurring_interval_count, tax_behavior, compare_at_unit_amount, valid_from_at, valid_until_at, source, created_at, updated_at, created_by, updated_by)
    SELECT op.id, op.organization_id, m.new_id || '-default', op.location_id, 1, op.currency, op.amount_minor, 'one_time', NULL, NULL, op.tax_behavior,
      CASE WHEN op.compare_at_amount_minor > op.amount_minor THEN op.compare_at_amount_minor END,
      op.valid_from, op.valid_until, op.provenance, op.created_at, op.created_at, op.created_by, op.created_by
    FROM old.prices op JOIN temp.product_map m ON m.old_id = op.product_id
    WHERE NOT (op.amount_minor = 0 AND EXISTS (
      SELECT 1 FROM old.products p, json_each(p.details_json) j
       WHERE p.id = op.product_id AND j.value ->> '$.key' = 'price-note'
    ))`).run().changes)

  // --- the three independent states the old `is_visible` flag stood for
  record('product_publications', stage.prepare(`INSERT INTO product_publications (organization_id, product_id, site_id, published, created_at, updated_at, created_by, updated_by)
    SELECT max(p.organization_id), m.new_id, p.site_id, max(p.is_visible), min(p.created_at), max(p.updated_at), max(p.created_by), max(p.updated_by)
    FROM old.products p JOIN temp.product_map m ON m.old_id = p.id GROUP BY m.new_id, p.site_id`).run().changes)
  record('product_locations', stage.prepare(`INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_at, updated_at, created_by, updated_by)
    SELECT max(p.organization_id), m.new_id, p.location_id, max(p.available), max(p.is_visible), min(p.created_at), max(p.updated_at), max(p.created_by), max(p.updated_by)
    FROM old.products p JOIN temp.product_map m ON m.old_id = p.id GROUP BY m.new_id, p.location_id`).run().changes)

  // --- grouping
  record('collections', stage.prepare(`INSERT INTO collections (id, organization_id, site_id, location_id, name, slug, description, sort_order, created_at, updated_at, created_by, updated_by)
    SELECT id, organization_id, site_id, location_id, name, slug, NULL, sort_order, created_at, updated_at, created_by, updated_by FROM old.product_categories`).run().changes)
  record('collection_products', stage.prepare(`INSERT INTO collection_products (organization_id, collection_id, product_id, sort_order, created_at, updated_at, created_by, updated_by)
    SELECT max(p.organization_id), p.category_id, m.new_id, min(p.sort_order), min(p.created_at), max(p.updated_at), max(p.created_by), max(p.updated_by)
    FROM old.products p JOIN temp.product_map m ON m.old_id = p.id
    WHERE p.category_id IS NOT NULL GROUP BY p.category_id, m.new_id`).run().changes)

  deriveDraftPayloads(stage, record)
  deriveMetafields(stage, now, record)
  deriveBookingCapability(stage, now, record)
  deriveProductMedia(stage, record)
  deriveOfferingPages(stage, now, record)
  // After the placements exist: this renames the slots they are addressed by.
  deriveCanonicalContentBlocks(stage, record)
  deriveGuestRecords(stage, record)
  deriveLocalizations(stage, record)
  deriveSlugRedirects(stage, now, record)
}

/**
 * One shape for a content block.
 *
 * The old model let a feature grid hold its items under `features`, a team
 * under `people` beside them, and its images inside `data` as asset objects.
 * The block contract names exactly one list — `items` — and says media lives
 * in placements, so every reader had to know the private spellings and the
 * CMS could not save any of these blocks at all: its writer refuses an
 * `asset_id` anywhere in `data`.
 *
 * Here they become what they are: a feature grid with `items`, a `team_grid`
 * with the people, and placements at `items.<index>.image`. Nothing is
 * invented — every embedded asset already has the placement it names.
 */
function deriveCanonicalContentBlocks(stage, record) {
  const rows = stage.prepare(`SELECT b.id, b.document_id, b.type, b.position, b.data_json, b.created_at, b.updated_at, d.locale
    FROM content_blocks b JOIN content_documents d ON d.id = b.document_id ORDER BY b.document_id, b.position`).all()
  const updateData = stage.prepare('UPDATE content_blocks SET data_json = ? WHERE id = ?')
  const insertBlock = stage.prepare(`INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
    VALUES (?, ?, NULL, 'team_grid', ?, NULL, ?, ?, ?)`)
  const shiftPositions = stage.prepare('UPDATE content_blocks SET position = position + 1 WHERE document_id = ? AND position > ?')
  const movePlacement = stage.prepare(`UPDATE media_placements SET owner_id = ?, slot = ?
    WHERE owner_type = 'content_block' AND owner_id = ? AND slot = ?`)
  let renamedLists = 0
  let teamBlocks = 0
  let liftedAssets = 0

  // An asset object anywhere in `data` is a copy of a placement that already
  // exists. It is removed, not moved: nothing here creates a placement.
  const stripAssets = (value) => {
    if (Array.isArray(value)) return value.map(stripAssets)
    if (!value || typeof value !== 'object') return value
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === 'asset_id' || key === 'url' || key === 'public_url' || key === 'thumbnail_url' || key === 'image_url') { liftedAssets += 1; continue }
      if (item && typeof item === 'object' && !Array.isArray(item) && 'asset_id' in item) { liftedAssets += 1; continue }
      out[key] = stripAssets(item)
    }
    return out
  }

  for (const row of rows) {
    const data = JSON.parse(row.data_json)
    let changed = false

    if (Array.isArray(data.features)) {
      assert(row.locale === 'en', `Block ${row.id} carries a translated legacy feature list`)
      assert(!Array.isArray(data.items), `Block ${row.id} carries both items and features`)
      data.items = data.features
      delete data.features
      // The grid a Blawby page renders as its feature cards says which section
      // it is, the way every other block on those pages does.
      if (!data.section) data.section = 'features'
      for (let index = 0; index < data.items.length; index += 1) {
        movePlacement.run(row.id, `items.${index}.image`, row.id, `features.${index}.icon`)
      }
      renamedLists += 1
      changed = true
    }

    if (Array.isArray(data.people)) {
      assert(row.locale === 'en', `Block ${row.id} carries a translated legacy team list`)
      const people = data.people
      delete data.people
      const teamId = `${row.id}-team`
      shiftPositions.run(row.document_id, row.position)
      insertBlock.run(teamId, row.document_id, row.position + 1,
        JSON.stringify({ items: people.map(person => stripAssets(person)) }), row.created_at, row.updated_at)
      for (let index = 0; index < people.length; index += 1) {
        movePlacement.run(teamId, `items.${index}.image`, row.id, `people.${index}.image`)
      }
      teamBlocks += 1
      changed = true
    }

    const cleaned = stripAssets(data)
    if (changed || JSON.stringify(cleaned) !== row.data_json) updateData.run(JSON.stringify(cleaned), row.id)
  }

  record('content_block_lists_renamed', renamedLists)
  record('content_block_team_blocks', teamBlocks)
  record('content_block_embedded_assets_removed', liftedAssets)
}

/**
 * An onboarding draft holds the catalog its owner has typed so far, in the
 * shape the model had when they typed it. It is read back by the wizard, so it
 * moves to the new shape with everything else: a product names the collection
 * it sits in and carries the price its variant will, and the retired per-site
 * flags — visibility, featured, availability — have nothing to say here.
 */
function deriveDraftPayloads(stage, record) {
  // Experiences were a second catalog; a draft has no question to answer about
  // whether the site has one.
  record('onboarding_draft_experience_flag', stage.prepare(
    "UPDATE onboarding_drafts SET payload_json = json_remove(payload_json, '$.preview.hasExperiences') WHERE json_type(payload_json, '$.preview.hasExperiences') IS NOT NULL",
  ).run().changes)
  record('onboarding_draft_products', stage.prepare(`
    UPDATE onboarding_drafts SET payload_json = json_set(
      payload_json,
      '$.preview.products',
      (SELECT json_group_array(json_object(
        'id', p.value ->> '$.id',
        'location_id', p.value ->> '$.location_id',
        'collection', p.value ->> '$.category',
        'name', p.value ->> '$.name',
        'slug', p.value ->> '$.slug',
        'description', coalesce(p.value ->> '$.description', ''),
        'price', CASE WHEN json_type(p.value, '$.price') = 'object'
          THEN json_object('unit_amount', p.value -> '$.price' ->> '$.amount_minor', 'currency', p.value -> '$.price' ->> '$.currency')
          END,
        'order_url', p.value ->> '$.order_url',
        'sort_order', p.value ->> '$.sort_order',
        'tags', coalesce(p.value -> '$.tags', json('[]')),
        'source', coalesce(p.value ->> '$.source', 'import')
      ))
      FROM json_each(onboarding_drafts.payload_json, '$.preview.products') p))
    WHERE json_type(payload_json, '$.preview.products') = 'array'
      AND EXISTS (SELECT 1 FROM json_each(onboarding_drafts.payload_json, '$.preview.products') q
                   WHERE json_type(q.value, '$.category') IS NOT NULL)
  `).run().changes)
}

/**
 * The old `details_json` array and the experience blob carried descriptive
 * attributes as shapes only their own renderer understood. Each becomes a
 * definition the tenant owns and a typed value on the product.
 */
function deriveMetafields(stage, now, record) {
  const definitions = new Map()
  const defineFor = (organizationId, namespace, key, name, valueType) => {
    const id = `mf-${namespace}-${key}-${hash(`${organizationId}:${namespace}:${key}`).slice(0, 12)}`
    if (!definitions.has(id)) definitions.set(id, { id, organization_id: organizationId, namespace, key, name, description: null, value_type: valueType, validations: {}, localizable: true })
    return definitions.get(id)
  }
  const values = []

  for (const row of stage.prepare(`SELECT m.new_id AS product_id, p.organization_id, p.details_json, p.experience_json, p.created_by
      FROM old.products p JOIN temp.product_map m ON m.old_id = p.id
     WHERE p.details_json <> '[]' OR p.experience_json IS NOT NULL`).all()) {
    for (const detail of JSON.parse(row.details_json ?? '[]')) {
      if (!detail?.key || !Array.isArray(detail.values) || detail.values.length === 0) continue
      // A price stated in words is the canonical pricing note, not a detail
      // row: the page shows it where the amount would be.
      if (String(detail.key) === 'price-note') {
        const definition = defineFor(row.organization_id, 'pricing', 'note', 'Pricing note', 'single_line_text')
        values.push({ ...row, definition, value: String(detail.values[0]) })
        continue
      }
      const definition = defineFor(row.organization_id, 'details', String(detail.key), String(detail.label ?? detail.key), 'list.single_line_text')
      values.push({ ...row, definition, value: detail.values.map(String) })
    }
    const experience = row.experience_json ? JSON.parse(row.experience_json) : null
    for (const [key, spec] of Object.entries(EXPERIENCE_METAFIELDS)) {
      const raw = experience?.[key]
      if (raw === undefined || raw === null || (Array.isArray(raw) ? raw.length === 0 : String(raw).trim() === '')) continue
      const definition = defineFor(row.organization_id, 'experience', key, spec.name, spec.value_type)
      values.push({ ...row, definition, value: Array.isArray(raw) ? raw.map(String) : String(raw) })
    }
  }

  const insertDefinition = stage.prepare(`INSERT INTO metafield_definitions (id, organization_id, namespace, key, name, description, value_type, validations, localizable, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, NULL, ?, '{}', 1, ?, ?, ?, ?)`)
  for (const definition of definitions.values()) {
    insertDefinition.run(definition.id, definition.organization_id, definition.namespace, definition.key, definition.name, definition.value_type, now, now, 'rebaseline', 'rebaseline')
  }
  const insertValue = stage.prepare(`INSERT INTO product_metafields (organization_id, product_id, definition_id, value, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (product_id, definition_id) DO NOTHING`)
  // Several old products merge into one, so they offer the same attribute more
  // than once. The manifest is this transfer's evidence, so it counts rows
  // written rather than attempts made.
  let written = 0
  for (const entry of values) {
    written += insertValue.run(entry.organization_id, entry.product_id, entry.definition.id,
      serializeMetafieldValue(entry.definition, entry.value), now, now, entry.created_by, entry.created_by).changes
  }
  record('metafield_definitions', definitions.size)
  record('product_metafields', written)
}

/**
 * Bookability is the existence of a config row, not a product type. The weekly
 * slot map becomes availability rules a scheduler can read, one per weekday and
 * start time.
 */
function deriveBookingCapability(stage, now, record) {
  const rows = stage.prepare(`SELECT m.new_id AS product_id, p.organization_id, p.location_id, p.experience_json, p.created_by,
      (SELECT l.timezone FROM old.business_locations l WHERE l.id = p.location_id) AS timezone
    FROM old.products p JOIN temp.product_map m ON m.old_id = p.id WHERE p.experience_json IS NOT NULL`).all()
  const insertConfig = stage.prepare(`INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (product_id) DO NOTHING`)
  const insertRule = stage.prepare(`INSERT INTO product_availability_rules (id, organization_id, product_id, location_id, timezone, weekday, start_time, interval_weeks, effective_from_date, effective_until_date, duration_minutes, capacity, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`)
  let rules = 0
  for (const row of rows) {
    const experience = JSON.parse(row.experience_json)
    const duration = Number.isInteger(experience.duration_minutes) ? experience.duration_minutes : null
    const capacity = Number.isInteger(experience.max_capacity) ? experience.max_capacity : null
    insertConfig.run(row.product_id, row.organization_id, duration, capacity, now, now, row.created_by, row.created_by)
    const slots = experience.recurring_slots ?? {}
    for (const [day, times] of Object.entries(slots)) {
      const weekday = WEEKDAYS.indexOf(day.toLowerCase())
      assert(weekday >= 0, `Unknown weekday "${day}" on product ${row.product_id}`)
      for (const time of Array.isArray(times) ? times : []) {
        assert(row.timezone, `Product ${row.product_id} schedules slots at a location with no timezone`)
        // A rule belongs to one product AT one location. Old products were
        // per-location and several map onto one new product, so an id without
        // the location collides the moment two branches run the same slot.
        insertRule.run(`rule-${row.product_id}-${row.location_id}-${weekday}-${String(time).replace(':', '')}`, row.organization_id, row.product_id, row.location_id, row.timezone, weekday, String(time), now, now, row.created_by, row.created_by)
        rules += 1
      }
    }
  }
  record('product_booking_configs', rows.length)
  record('product_availability_rules', rules)
}

/**
 * Two location rows for one dish carried the same photograph and two generated
 * social cards. The photograph transfers once; the card is a render of the
 * product, so the merged Product keeps its own and the rest are regenerated
 * rather than chosen between.
 */
function deriveProductMedia(stage, record) {
  // Placements the catalog does not own transfer unchanged; a product's move
  // with it, and an offering's move with its page.
  record('media_placements', stage.prepare(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
    SELECT id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at
      FROM old.media_placements WHERE owner_type NOT IN ('product', 'offering')`).run().changes)
  record('product_media_placements', stage.prepare(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
    SELECT id, organization_id, site_id, 'product', owner_id, slot, asset_id,
      row_number() OVER (PARTITION BY site_id, owner_id, slot ORDER BY sort_order, asset_id) - 1,
      status, created_at, updated_at
    FROM (
      SELECT min(mp.id) AS id, max(mp.organization_id) AS organization_id, mp.site_id AS site_id, m.new_id AS owner_id,
             mp.slot AS slot, mp.asset_id AS asset_id, min(mp.sort_order) AS sort_order,
             max(mp.status) AS status, min(mp.created_at) AS created_at, max(mp.updated_at) AS updated_at
        FROM old.media_placements mp JOIN temp.product_map m ON m.old_id = mp.owner_id
       WHERE mp.owner_type = 'product' AND (mp.slot <> 'social_card' OR mp.owner_id = m.new_id)
       GROUP BY mp.site_id, m.new_id, mp.slot, mp.asset_id)`).run().changes)
  record('product_social_cards_regenerated', stage.prepare(`SELECT count(*) AS n FROM old.media_placements mp JOIN temp.product_map m ON m.old_id = mp.owner_id
    WHERE mp.owner_type = 'product' AND mp.slot = 'social_card' AND mp.owner_id <> m.new_id`).get().n)
  const promoted = stage.prepare(PROMOTE_PRODUCT_COVERS_SQL).run().changes
  if (promoted > 0) stage.prepare(RENUMBER_PRODUCT_GALLERIES_SQL).run()
  record('product_covers_promoted', promoted)
}



/**
 * An Offering was a second content model for a page: prose, a feature list and
 * a question set, rendered by a route of its own. It becomes what it always
 * was — a page with blocks — at the same path, and the grids that listed
 * "every offering on this site" now name the pages they show.
 */
function deriveOfferingPages(stage, now, record) {
  const offerings = stage.prepare('SELECT * FROM old.offerings ORDER BY sort_order, id').all()
  if (offerings.length === 0) return
  const insertDocument = stage.prepare(`INSERT INTO content_documents (id, organization_id, site_id, kind, row_role, locale, location_id, product_id, scope_path, title, slug, path, summary, status, visibility, sort_order, source, created_by, updated_by, seo_title, seo_description, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'root', 'en', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertBlock = stage.prepare('INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?)')
  const insertPlacement = stage.prepare('INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const sourcePlacements = stage.prepare("SELECT * FROM old.media_placements WHERE owner_type = 'offering' ORDER BY owner_id, slot, sort_order").all()
  const placementsFor = (ownerId, slot) => sourcePlacements.filter(row => row.owner_id === ownerId && row.slot === slot)
  let placements = 0
  const movePlacement = (row, ownerType, ownerId, slot, sortOrder) => {
    insertPlacement.run(row.id, row.organization_id, row.site_id, ownerType, ownerId, slot, row.asset_id, sortOrder, row.status, row.created_at, row.updated_at)
    placements += 1
  }
  let blocks = 0
  let questions = 0

  for (const offering of offerings) {
    const path = `/services/${offering.slug}`
    const documentId = `page-${offering.id}`
    insertDocument.run(documentId, offering.organization_id, offering.site_id, 'page', offering.location_id, null,
      offering.name, offering.slug, path, offering.summary, null, null, offering.sort_order, offering.source,
      offering.updated_by, offering.updated_by, offering.seo_title, offering.seo_description,
      JSON.stringify({ page_type: 'custom' }), offering.created_at, offering.updated_at)

    let position = 0
    const add = (type, data) => {
      const id = `${documentId}-${type}-${position}`
      insertBlock.run(id, documentId, type, position, JSON.stringify(data), offering.created_at, offering.updated_at)
      position += 1
      blocks += 1
      return id
    }
    // The page states its own heading: a reader takes the h1 from the hero
    // block, never from the document title behind it.
    add('hero', { title: offering.name, ...(blank(offering.summary) ? {} : { subtitle: offering.summary }) })
    // The banner an offering carried is the page's leading image block, the
    // same shape every other page states a lead image in.
    const hero = placementsFor(offering.id, 'hero')[0]
    if (hero) movePlacement(hero, 'content_block', add('image', { caption: '' }), 'media', 0)
    if (!blank(offering.body)) add('markdown', { markdown: offering.body })
    // Feature order is the array's own: the icon placements are addressed by
    // index, so re-sorting here would point each icon at another feature.
    const features = JSON.parse(offering.features ?? '[]')
    if (features.length > 0) {
      // One list, one slot: `items` with its image at `items.<index>.image`,
      // the same shape the block contract declares and the editor writes.
      const blockId = add('feature_grid', {
        section: 'features',
        items: features.map(feature => ({ title: String(feature.title ?? ''), description: String(feature.description ?? '') })),
      })
      features.forEach((_feature, index) => {
        const icon = placementsFor(offering.id, `features.${index}.image`)[0]
        if (icon) movePlacement(icon, 'content_block', blockId, `items.${index}.image`, 0)
      })
    }
    const faqs = JSON.parse(offering.faqs ?? '[]').filter(entry => !blank(entry?.question))
    faqs.forEach((entry, index) => {
      insertDocument.run(`qa-${offering.id}-${index}`, offering.organization_id, offering.site_id, 'qa', offering.location_id, path,
        entry.question, null, null, entry.answer ?? null, 'published', null, index, 'import',
        offering.updated_by, offering.updated_by, null, null,
        JSON.stringify({ is_owner_answer: 1, upvote_count: 0 }), offering.created_at, offering.updated_at)
      questions += 1
    })
    if (faqs.length > 0) add('faq', { source: 'page_qa' })
    if (!blank(offering.cta_label) && !blank(offering.cta_url)) add('contact_cta', { title: offering.cta_label, label: offering.cta_label, url: offering.cta_url })

    // The card image a listing showed is the page's cover, which is the one
    // image a page reference carries. The gallery and the generated card keep
    // their own slots.
    const thumbnail = placementsFor(offering.id, 'thumbnail')[0]
    if (thumbnail) movePlacement(thumbnail, 'content_document', documentId, 'cover', 0)
    placementsFor(offering.id, 'gallery').forEach((row, index) => movePlacement(row, 'content_document', documentId, 'gallery', index))
    const card = placementsFor(offering.id, 'social_card')[0]
    if (card) movePlacement(card, 'content_document', documentId, 'social_card', 0)
  }
  record('offering_media_placements', placements)
  record('offering_media_placements_unmapped', sourcePlacements.length - placements)

  // An offering grid said "list everything this site offers". A page grid names
  // its pages, so the implicit set becomes the explicit one it stood for.
  const grids = stage.prepare("SELECT b.id, b.data_json, d.site_id FROM content_blocks b JOIN content_documents d ON d.id = b.document_id WHERE b.type = 'offering_grid'").all()
  const updateGrid = stage.prepare('UPDATE content_blocks SET type = ?, data_json = ? WHERE id = ?')
  const bySite = new Map()
  for (const offering of offerings) bySite.set(offering.site_id, [...(bySite.get(offering.site_id) ?? []), `page-${offering.id}`])
  let converted = 0
  let authored = 0
  for (const grid of grids) {
    const data = JSON.parse(grid.data_json)
    // A grid that listed the site's offerings names the pages they became. One
    // that carried its own cards is authored page content, and keeps them.
    if (data.source === 'site_offerings') {
      delete data.source
      delete data.items
      data.page_ids = bySite.get(grid.site_id) ?? []
      updateGrid.run('page_grid', JSON.stringify(data), grid.id)
      converted += 1
      continue
    }
    updateGrid.run('feature_grid', JSON.stringify(data), grid.id)
    authored += 1
  }
  record('offering_pages', offerings.length)
  record('offering_page_blocks', blocks)
  record('offering_page_questions', questions)
  record('page_grids', converted)
  record('authored_grids', authored)
}

/**
 * The booking tuple on `requests` was four nullable columns that only some
 * kinds used. A reservation is a table held at a location; a booking is a seat
 * at an occurrence of a product. Each becomes its own record, and the request
 * stays the guest conversation it always was.
 */
function deriveGuestRecords(stage, record) {
  // An experience booking is a booking: the second kind existed only because
  // experiences were a second catalog.
  record('booking_requests_renamed', stage.prepare("UPDATE requests SET kind = 'booking' WHERE kind = 'experience_booking'").run().changes)
  const rows = stage.prepare(`SELECT r.*, (SELECT l.timezone FROM old.business_locations l WHERE l.id = r.location_id) AS timezone,
      (SELECT m.new_id FROM temp.product_map m WHERE m.old_id = r.product_id) AS mapped_product_id
    FROM old.requests r WHERE r.booking_date IS NOT NULL ORDER BY r.id`).all()
  const insertReservation = stage.prepare(`INSERT INTO reservations (id, organization_id, site_id, location_id, customer_id, request_id, timezone, starts_at, ends_at, party_size, status, cancelled_at, completed_at, cancellation_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
  const insertSession = stage.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, location_id, availability_rule_id, source_occurrence_key, timezone, starts_at, ends_at, capacity, status, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, 'rebaseline', 'rebaseline') ON CONFLICT (id) DO NOTHING`)
  const insertBooking = stage.prepare(`INSERT INTO bookings (id, organization_id, site_id, product_id, product_session_id, product_variant_id, customer_id, request_id, party_size, status, hold_expires_at, cancelled_at, completed_at, cancellation_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)`)
  let reservations = 0
  let bookings = 0

  for (const row of rows) {
    assert(row.timezone, `Request ${row.id} books a location with no timezone`)
    assert(row.time_slot, `Request ${row.id} carries a date with no time`)
    const partySize = Number(row.party_size) > 0 ? Number(row.party_size) : 1
    const startsAt = localDateTimeToInstant(row.booking_date, row.time_slot, row.timezone, 'compatible').toISOString()
    const cancelledAt = row.status === 'cancelled' ? (row.resolved_at ?? row.updated_at) : null
    const completedAt = row.status === 'completed' ? (row.resolved_at ?? row.updated_at) : null

    if (row.kind === 'reservation') {
      insertReservation.run(`reservation-${row.id}`, row.organization_id, row.site_id, row.location_id, row.customer_id, row.id,
        row.timezone, startsAt, new Date(Date.parse(startsAt) + RESERVATION_DURATION_MINUTES * 60_000).toISOString(),
        partySize, row.status, cancelledAt, completedAt, row.created_at, row.updated_at)
      reservations += 1
      continue
    }
    assert(row.mapped_product_id, `Request ${row.id} books a product that no longer exists`)
    const config = stage.prepare('SELECT duration_minutes, default_capacity FROM product_booking_configs WHERE product_id = ?').get(row.mapped_product_id)
    assert(config, `Request ${row.id} books product ${row.mapped_product_id}, which takes no bookings`)
    // The location is part of the rule's identity, so it is part of the lookup:
    // matching on product and time alone picked whichever branch's rule came
    // back first.
    const rule = stage.prepare(`SELECT id FROM product_availability_rules WHERE product_id = ? AND location_id IS ? AND start_time = ?
      AND weekday = CAST(strftime('%w', ?) AS INTEGER)`).get(row.mapped_product_id, row.location_id, row.time_slot, row.booking_date)
    const duration = config.duration_minutes ?? RESERVATION_DURATION_MINUTES
    const sessionId = `session-${row.mapped_product_id}-${row.booking_date}-${row.time_slot.replace(':', '')}`
    insertSession.run(sessionId, row.organization_id, row.mapped_product_id, row.location_id, rule?.id ?? null,
      rule ? occurrenceKey(rule.id, row.booking_date, row.time_slot) : null, row.timezone, startsAt,
      new Date(Date.parse(startsAt) + duration * 60_000).toISOString(), config.default_capacity, row.created_at, row.updated_at)
    insertBooking.run(`booking-${row.id}`, row.organization_id, row.site_id, row.mapped_product_id, sessionId,
      `${row.mapped_product_id}-default`, row.customer_id, row.id, partySize, row.status, cancelledAt, completedAt, row.created_at, row.updated_at)
    bookings += 1
  }

  // A location's reservation policy was a JSON blob on the location row.
  record('location_reservation_configs', stage.prepare(`INSERT INTO location_reservation_configs (location_id, organization_id, slot_capacity, advance_notice_minutes, minimum_guest_age, deposit_required, deposit_trigger_party_size, free_cancellation_until_minutes, reschedule_allowed, reschedule_cutoff_minutes, accessibility_contact_required, additional_notes_html, created_at, updated_at, created_by, updated_by)
    SELECT l.id, l.organization_id,
      json_extract(l.booking_json, '$.reservation.policy.slot_capacity'),
      json_extract(l.booking_json, '$.reservation.policy.advance_notice_minutes'),
      json_extract(l.booking_json, '$.reservation.policy.minimum_guest_age'),
      coalesce(json_extract(l.booking_json, '$.reservation.policy.deposit_required'), 0),
      json_extract(l.booking_json, '$.reservation.policy.deposit_trigger_party_size'),
      json_extract(l.booking_json, '$.reservation.policy.free_cancellation_until_minutes'),
      coalesce(json_extract(l.booking_json, '$.reservation.policy.reschedule_allowed'), 1),
      json_extract(l.booking_json, '$.reservation.policy.reschedule_cutoff_minutes'),
      coalesce(json_extract(l.booking_json, '$.reservation.policy.accessibility_contact_required'), 0),
      json_extract(l.booking_json, '$.reservation.policy.additional_notes_html'),
      coalesce(json_extract(l.booking_json, '$.reservation.policy.created_at'), l.created_at),
      coalesce(json_extract(l.booking_json, '$.reservation.policy.updated_at'), l.updated_at),
      'rebaseline', 'rebaseline'
    FROM old.business_locations l WHERE json_type(l.booking_json, '$.reservation.policy') = 'object'`).run().changes)
  record('reservations', reservations)
  record('bookings', bookings)
}

/**
 * A localized Product answers under the baseline's field names: the tag list is
 * `tags`, and the detail array is the metafield map its definitions describe.
 * A localized category localizes the collection it became.
 */
function deriveLocalizations(stage, record) {
  const definitions = new Map(stage.prepare("SELECT id, organization_id, namespace, key, value_type FROM metafield_definitions WHERE namespace = 'details'")
    .all().map(row => [`${row.organization_id}:${row.key}`, row]))
  const rows = stage.prepare(`SELECT r.*, m.new_id AS product_id FROM old.resource_localizations r
    LEFT JOIN temp.product_map m ON m.old_id = r.resource_id AND r.resource_type = 'product'`).all()
  const insert = stage.prepare(`INSERT INTO resource_localizations (id, organization_id, site_id, resource_type, resource_id, locale, values_json, route_path, created_at, created_by_user_id, updated_at, updated_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (organization_id, site_id, resource_type, resource_id, locale) DO NOTHING`)
  let dropped = 0
  let inserted = 0
  for (const row of rows) {
    const resourceType = row.resource_type === 'product_category' ? 'collection' : row.resource_type
    const resourceId = row.resource_type === 'product' ? row.product_id : row.resource_id
    if (!resourceId) { dropped += 1; continue }
    let values = JSON.parse(row.values_json)
    if (resourceType === 'product') {
      const { tags_json: tags, details_json: details, seo_title: seoTitle, seo_description: seoDescription, experience, ...rest } = values
      values = rest
      if (tags !== undefined) values.tags = typeof tags === 'string' ? JSON.parse(tags) : tags
      const metafields = {}
      for (const detail of (typeof details === 'string' ? JSON.parse(details) : details) ?? []) {
        const definition = definitions.get(`${row.organization_id}:${detail?.key}`)
        if (!definition || !Array.isArray(detail.values) || detail.values.length === 0) continue
        metafields[`${definition.namespace}.${definition.key}`] = detail.values.map(String)
      }
      if (Object.keys(metafields).length > 0) values.metafields = metafields
      if (seoTitle !== undefined || seoDescription !== undefined || experience !== undefined) dropped += 0
    }
    if (Object.keys(values).length === 0) { dropped += 1; continue }
    // A Product's localized route is derived from the location it is offered
    // at — one Product, one row, every location it reaches.
    const routePath = resourceType === 'product' ? null : row.route_path
    inserted += insert.run(row.id, row.organization_id, row.site_id, resourceType, resourceId, row.locale, JSON.stringify(values),
      routePath, row.created_at, row.created_by_user_id, row.updated_at, row.updated_by_user_id).changes
  }
  record('resource_localizations', inserted)
  // A merged Product's twins carried the same translation — the merge rule
  // proved it — so the surviving row is the same text, not a choice.
  record('resource_localizations_merged', rows.length - inserted - dropped)
  record('resource_localizations_dropped', dropped)
}

/** A Product whose slug had to be qualified keeps its old path reachable. */
function deriveSlugRedirects(stage, now, record) {
  const rows = stage.prepare(`SELECT DISTINCT m.redirect_from, m.new_slug, m.site_id, m.location_id, p.organization_id,
      (SELECT l.slug FROM old.business_locations l WHERE l.id = m.location_id) AS location_slug,
      (SELECT s.vertical FROM old.sites s WHERE s.id = m.site_id) AS vertical
    FROM temp.product_map m JOIN products p ON p.id = m.new_id WHERE m.redirect_from IS NOT NULL`).all()
  const insert = stage.prepare(`INSERT INTO site_redirects (id, organization_id, site_id, locale, owner_type, owner_id, from_path, to_path, status_code, behavior, reason, source, created_at, updated_at)
    VALUES (?, ?, ?, 'en', NULL, NULL, ?, ?, 301, 'redirect', ?, 'rebaseline', ?, ?)`)
  for (const row of rows) {
    const segment = row.vertical === 'restaurant' ? 'menu' : 'products'
    const from = `/locations/${row.location_slug}/${segment}/${row.redirect_from}`
    insert.run(`redirect-${hash(from).slice(0, 16)}`, row.organization_id, row.site_id, from,
      `/locations/${row.location_slug}/${segment}/${row.new_slug}`,
      'Product slug qualified by location: two location rows disagreed on authored copy', now, now)
  }
  record('site_redirects', rows.length)
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
 * @typedef {{ baseline_sha256: string, tables: TableTransfer[], retired_tables?: string[], retired_columns?: Record<string, string[]>,
 *   derived?: Record<string, number>, transforms: Array<{ name: string, changes: number, sql_sha256: string }>,
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
  const sourceFile = resolve(`${targetPath}.source.sqlite`)
  assert(!existsSync(sourceFile), `Source scratch file already exists: ${sourceFile}`)
  // The derivation reads the retired tables through ATTACH, so the source has
  // to be a file even when it arrived as a dump.
  source.exec(`VACUUM INTO ${sqlLiteral(sourceFile)}`)
  // Rows are copied and transformed in a staging copy of the baseline with CHECK
  // enforcement off: the source still holds the retired values the transforms
  // rewrite. The final target then re-inserts every row under full enforcement,
  // so nothing the transforms missed can survive into it.
  const stage = new Database(':memory:')
  const target = new Database(targetPath)
  const now = new Date().toISOString()
  /** @type {RebaselineManifest} */
  const manifest = { baseline_sha256: hash(baseline), tables: [], derived: {}, transforms: [], invariants: [] }
  try {
    stage.exec(baseline)
    stage.pragma('ignore_check_constraints = ON')
    stage.pragma('foreign_keys = OFF')
    stage.exec(`ATTACH ${sqlLiteral(sourceFile)} AS old`)
    const names = tableNames(stage)
    const sourceTables = tableNames(source)
    const reshapes = sourceTables.includes('offerings')
    // Tables and columns the baseline no longer has are retired features; their
    // rows are derived or dropped, and the manifest names them.
    manifest.retired_tables = sourceTables.filter(table => !names.includes(table))
    manifest.retired_columns = {}
    manifest.added_columns = {}
    const derived = []
    for (const table of names) {
      if (!sourceTables.includes(table) || (reshapes && DERIVED_FROM_RETIRED_MODEL.has(table))) { derived.push(table); continue }
      const targetColumns = columns(stage, table)
      const sourceColumns = columns(source, table)
      const retired = sourceColumns.filter(name => !targetColumns.includes(name))
      if (retired.length) manifest.retired_columns[table] = retired
      // A column the baseline added takes its own default. One that is NOT NULL
      // with no default has no value to take, and the transfer says so rather
      // than inventing one.
      const added = stage.prepare(`PRAGMA table_info(${qi(table)})`).all().filter(column => !sourceColumns.includes(column.name))
      const unfillable = added.filter(column => column.notnull === 1 && column.dflt_value === null)
      assert(unfillable.length === 0, `${table}: baseline requires ${unfillable.map(column => column.name).join(', ')}, which the source cannot supply`)
      if (added.length) manifest.added_columns[table] = added.map(column => column.name)
      const shared = targetColumns.filter(name => sourceColumns.includes(name))
      stage.prepare(`INSERT INTO main.${qi(table)} (${shared.map(qi).join(',')}) SELECT ${shared.map(qi).join(',')} FROM old.${qi(table)}`).run()
    }
    manifest.derived_tables = derived
    for (const table of names) manifest.tables.push({ table, source_rows: stage.prepare(`SELECT count(*) AS n FROM main.${qi(table)}`).get().n })
    if (reshapes) deriveCatalog(stage, now, (name, count) => { manifest.derived[name] = count })
    for (const transform of TRANSFORMS) {
      const result = stage.prepare(transform.sql).run()
      manifest.transforms.push({ name: transform.name, changes: result.changes, sql_sha256: hash(transform.sql) })
    }
    stage.exec('DETACH old')
    target.exec(baseline)
    // CHECK constraints stay on: the target must reject anything the derivation
    // missed. Foreign keys are verified in one pass afterwards, which names
    // every violating row instead of failing the commit with no detail.
    target.pragma('foreign_keys = OFF')
    const copy = target.transaction(() => {
      for (const table of names) {
        const targetColumns = columns(target, table)
        const rows = stage.prepare(`SELECT * FROM ${qi(table)}`).all()
        const insert = target.prepare(`INSERT INTO ${qi(table)} (${targetColumns.map(qi).join(',')}) VALUES (${targetColumns.map(() => '?').join(',')})`)
        for (const row of rows) insert.run(...targetColumns.map(name => row[name]))
        assert(digest(rows, targetColumns) === digest(target.prepare(`SELECT * FROM ${qi(table)}`).all(), targetColumns), `${table}: copy differs`)
      }
    })
    copy()
    for (const entry of manifest.tables) entry.target_rows = target.prepare(`SELECT count(*) AS n FROM ${qi(entry.table)}`).get().n
    const violations = target.pragma('foreign_key_check')
    assert(violations.length === 0, `Foreign key violations after transfer (${violations.length}): ${JSON.stringify(violations.slice(0, 8))}`)
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
    // The scratch copy is the whole source database, customer rows included.
    // It exists only so ATTACH has a file to read.
    rmSync(sourceFile, { force: true })
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
  const rows = manifest.tables.reduce((total, entry) => total + entry.target_rows, 0)
  console.log(`Rebaseline passed: ${manifest.tables.length} tables, ${rows} rows`)
  console.log(`Derived: ${Object.entries(manifest.derived).map(([name, count]) => `${name}=${count}`).join(', ')}`)
  console.log(`Transforms: ${manifest.transforms.map(transform => `${transform.name}=${transform.changes}`).join(', ')}`)
}
