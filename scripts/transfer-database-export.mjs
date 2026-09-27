#!/usr/bin/env node
// Offline transfer of a database export into the current generated baseline.
// Never imported by application runtime.
//
//   node scripts/transfer-database-export.mjs <source.sql|source.sqlite> <target.sqlite>
//     [--payload <payload.sql>] [--without-jwks] [--delta-from <earlier-target.sqlite>]
//
// The target is built from migrations/0000_baseline.sql. Every table the source
// and the baseline share is copied column-for-column, the schema epoch below
// maps what the baseline no longer has, the pending data transforms run, and
// the result is audited under full CHECK and foreign-key enforcement. A source
// table or column the baseline does not have fails the transfer unless the
// epoch retires it by name, so nothing is dropped without saying so.
//
// With --payload the script also writes the data-only replacement that
// `wrangler d1 execute --file` applies to a database built from the same
// baseline. With --delta-from that payload instead inserts only the rows whose
// primary key the earlier transfer's target did not hold: the rows created in
// the source after the initial export, copied onto the live replacement.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { CONTENT_DOCUMENT_SCOPE_QUERY, MEDIA_PLACEMENT_OWNER_AUDIT_QUERY } from './audit-orphaned-media-placements.mjs'
import { isSupportedMediaPlacement } from '../shared/media-placement-contract.ts'
import { organizationRoles } from '../utils/organization-access.ts'

/** The roles the access matrix declares. Anything else evaluates to no permissions. */
const DECLARED_ORGANIZATION_ROLES = new Set(Object.keys(organizationRoles))

const MIGRATIONS_DIRECTORY = 'migrations'
const hash = value => createHash('sha256').update(value).digest('hex')
const qi = value => `"${value.replaceAll('"', '""')}"`
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function migrationChainSql() {
  const migrations = readdirSync(resolve(MIGRATIONS_DIRECTORY))
    .filter(name => /^\d{4}_.+\.sql$/u.test(name))
    .sort()
  assert(migrations[0] === '0000_baseline.sql', 'Migration chain must start with migrations/0000_baseline.sql')
  return migrations.map(name => readFileSync(resolve(MIGRATIONS_DIRECTORY, name), 'utf8')).join('\n')
}

export function openDatabase(path) {
  if (!path.endsWith('.sql')) return new Database(path, { readonly: true, fileMustExist: true })
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  db.exec(readFileSync(path, 'utf8'))
  return db
}

const tableNames = db => db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT IN ('d1_migrations', '__drizzle_migrations') ORDER BY name").all().map(row => row.name)
const columns = (db, table) => db.prepare(`PRAGMA table_info(${qi(table)})`).all().map(row => row.name)
const digest = (rows, names) => hash(rows.map(row => JSON.stringify(names.map(name => row[name]))).sort().join('\n'))

/**
 * Ordered data transforms that still have work against the source.
 * Each is idempotent on its own result.
 */
export const TRANSFORMS = [
  // `public` said the same thing `status = 'published'` already said. What the
  // column actually decides is whether the document appears in its index, so it
  // says that: an unlisted article is just as public, it is simply not listed.
  { name: 'article_visibility_is_listed_or_unlisted', sql: `UPDATE content_documents SET visibility = 'listed'
    WHERE visibility = 'public'` },
  // Google verifies a property through Search Console now, which the
  // integration carries. The meta tag this held was a second place to say the
  // same thing, and nothing read it once the OAuth connection existed.
  { name: 'google_site_verification_removed', sql: `UPDATE organization
    SET settings_json = json_remove(settings_json, '$.config.google_site_verification')
    WHERE json_type(settings_json, '$.config.google_site_verification') IS NOT NULL` },
  // A booking or reservation is confirmed or cancelled, and done is the clock:
  // confirmed with an end that has passed. `pending` waited on a host approval
  // nobody gives — reservations already wrote `confirmed` outright while
  // experiences waited, leaving rows pending with dates months in the past — and
  // `completed` was a click for something the calendar already knows. Neither
  // was ever cancelled, so both read as the state they were really in.
  { name: 'bookings_are_confirmed_or_cancelled', sql: `UPDATE bookings SET status = 'confirmed'
    WHERE status IN ('pending', 'completed')` },
  { name: 'reservations_are_confirmed_or_cancelled', sql: `UPDATE reservations SET status = 'confirmed'
    WHERE status IN ('pending', 'completed')` },
  { name: 'sessions_are_scheduled_or_cancelled', sql: `UPDATE product_sessions SET status = 'scheduled'
    WHERE status NOT IN ('scheduled', 'cancelled')` },
  // `business_locations.address` is `google.type.PostalAddress` — what the Places
  // API answers with and what the CHECK now requires. Older exports carry two
  // earlier shapes: `{addressLines}` alone, and that plus `locality`,
  // `administrativeArea`, `postalCode` and a `country` key where the standard
  // says `regionCode`. `city` and `neighborhood` were separate columns; the
  // address names those parts itself now, and the source is still attached as
  // `old`, so they fold in here before they are gone.
  //
  // A row whose source names no country keeps its old value and the target's
  // CHECK rejects it by name: re-reading `postalAddress` for its
  // `google_place_id` is the fix, and inventing a country is not.
  { name: 'addresses_are_postal_addresses', sql: `UPDATE business_locations SET address = json_patch(
      json_remove(address, '$.country', '$.streetAddress'),
      json_object('regionCode', address ->> '$.country'))
    WHERE json_type(address, '$.country') IS 'text' AND json_type(address, '$.regionCode') IS NULL` },
  // A translated address was one free line beside a translated `city`. It is
  // the same structured address as the canonical one now, so the line becomes
  // the street and the city becomes the town. Splitting Thai address text into
  // its parts is a translator's job, not a transform's, so nothing is invented
  // and no word is dropped.
  { name: 'localized_addresses_are_postal_addresses', sql: `UPDATE resource_localizations SET values_json = json_patch(
      json_remove(values_json, '$.address', '$.city', '$.neighborhood'),
      json_object('address', json_object(
        'addressLines', json_array(values_json ->> '$.address'),
        'locality', values_json ->> '$.city',
        'sublocality', values_json ->> '$.neighborhood')))
    WHERE resource_type = 'business_location' AND json_type(values_json, '$.address') IS 'text'` },
  // A location translated without its address kept only the retired keys.
  { name: 'localized_locations_drop_city_and_neighbourhood', sql: `UPDATE resource_localizations SET values_json = json_remove(values_json, '$.city', '$.neighborhood')
    WHERE resource_type = 'business_location'
      AND (json_type(values_json, '$.city') IS NOT NULL OR json_type(values_json, '$.neighborhood') IS NOT NULL)` },
  // `brand_name` became `organization.name`, and the translation of it has to
  // follow the column. Renaming the resource type alone left every organization
  // localization keyed `brand_name`, which the registry no longer declares, so
  // the localization validator refused the whole row and every localized route
  // answered 422 — the entire Thai site, for a tenant that pays for the
  // language. The resource_type rename runs in either order, so both spellings
  // are matched.
  // A block's place is its index, and the site-content migration wrote that
  // index in the alphabetical order of the field names — so `story.title`
  // sorted after `story.body` and `story.image` and a page ended on the heading
  // that should have opened its own section. The authored order is not
  // recoverable (`site_content` is gone), but a title above its body and an
  // image after it is not a judgement call. Sections keep the order they are
  // in; only the roles within one are put right, and each block stays inside
  // the set of positions its own document already used, so a migrated block
  // interleaved with native ones is not lifted out of place.
  { name: 'migrated_site_content_roles_follow_their_section', sql: `WITH p AS (
  SELECT b.id, b.document_id, b.position, b.type, COALESCE(b.data_json ->> '$.field','') AS field,
         CASE WHEN instr(COALESCE(b.data_json ->> '$.field',''),'.')>0 THEN substr(COALESCE(b.data_json ->> '$.field',''),1,instr(COALESCE(b.data_json ->> '$.field',''),'.')-1) ELSE COALESCE(b.data_json ->> '$.field','') END AS section,
         CASE WHEN instr(COALESCE(b.data_json ->> '$.field',''),'.')>0 THEN substr(COALESCE(b.data_json ->> '$.field',''),instr(COALESCE(b.data_json ->> '$.field',''),'.')+1) ELSE '' END AS role
  FROM content_blocks b WHERE b.id LIKE 'migrated-site-content-block:%' AND b.data_json ->> '$.field' IS NOT NULL
), r AS (
  SELECT p.*, CASE role WHEN 'title' THEN 0 WHEN 'kicker' THEN 1 WHEN 'subtitle' THEN 2 WHEN 'body' THEN 3 WHEN 'image' THEN 4 ELSE 0 END AS rr,
         MIN(position) OVER (PARTITION BY document_id, section) AS spos
  FROM p
), ranked AS (
  SELECT id, document_id, position, type, field,
         ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY spos, rr, position) AS want
  FROM r
), slots AS (
  SELECT document_id, position AS slot,
         ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY position) AS idx
  FROM r
)
, map AS (
  SELECT ranked.id AS id, slots.slot AS new_position
  FROM ranked JOIN slots ON slots.document_id = ranked.document_id AND slots.idx = ranked.want
)
UPDATE content_blocks SET position = (SELECT new_position FROM map WHERE map.id = content_blocks.id)
WHERE id IN (SELECT id FROM map) AND position <> (SELECT new_position FROM map WHERE map.id = content_blocks.id)` },
  // The organization's WhatsApp number decided who heard about a booking, beside
  // the Better Auth membership that already said so. Notifications resolve from
  // the member to their own verified phone now, so the key is retired with the
  // column its location-level twin lived in. Nothing reads it; left behind it is
  // a setting a tenant could still see in an export and believe in.
  { name: 'organization_whatsapp_phone_is_retired', sql: `UPDATE organization
      SET settings_json = json_remove(settings_json, '$.config.whatsapp_phone')
    WHERE json_type(settings_json, '$.config.whatsapp_phone') IS NOT NULL` },
  { name: 'localized_brand_name_is_organization_name', sql: `UPDATE resource_localizations
      SET values_json = json_remove(json_set(values_json, '$.name', values_json ->> '$.brand_name'), '$.brand_name')
    WHERE resource_type IN ('site', 'organization')
      AND json_type(values_json, '$.brand_name') IS NOT NULL` },
  { name: 'addresses_absorb_city_and_neighbourhood', requires: { table: 'business_locations', columns: ['city', 'neighborhood'] }, sql: `UPDATE business_locations SET address = (
      SELECT json_patch(business_locations.address, json_object(
        'locality', COALESCE(business_locations.address ->> '$.locality', nullif(trim(coalesce(o.city, '')), '')),
        'sublocality', COALESCE(business_locations.address ->> '$.sublocality', nullif(trim(coalesce(o.neighborhood, '')), ''))))
      FROM old.business_locations o WHERE o.id = business_locations.id)
    WHERE address IS NOT NULL` },
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
  // --- the tenant is the organization, so the names a row carries say so. The
  // CHECKs these values meet are enforced when the stage is copied into the
  // target, after these run.
  { name: 'analytics_day_summaries_are_organization_days', sql: `UPDATE analytics_summaries SET kind = 'organization_day' WHERE kind = 'site_day'` },
  { name: 'broadcast_category_is_organization_and_billing', sql: `UPDATE broadcasts SET category = 'organization_and_billing' WHERE category = 'site_and_billing'` },
  { name: 'notification_preference_category_is_organization_and_billing', sql: `UPDATE user_notification_preferences SET category = 'organization_and_billing' WHERE category = 'site_and_billing'` },
  { name: 'content_block_sources_name_the_organization', sql: `UPDATE content_blocks
      SET data_json = json_set(data_json, '$.source', 'organization_' || substr(data_json ->> '$.source', 6))
    WHERE data_json ->> '$.source' LIKE 'site\\_%' ESCAPE '\\'` },
  // A notification kept a site's visibility scope nothing reads, and a deep link
  // into the retired /sites/<site>/ dashboard level. The organization is the
  // dashboard's only level above a location, so the site segment goes.
  { name: 'notification_links_skip_the_retired_site_level', sql: `UPDATE activity_entries
      SET payload_json = json_remove(
        CASE WHEN instr(payload_json ->> '$.deep_link', '/sites/') > 0
          THEN json_set(payload_json, '$.deep_link',
            substr(payload_json ->> '$.deep_link', 1, instr(payload_json ->> '$.deep_link', '/sites/') - 1)
            || CASE WHEN instr(substr(payload_json ->> '$.deep_link', instr(payload_json ->> '$.deep_link', '/sites/') + 7), '/') > 0
              THEN substr(substr(payload_json ->> '$.deep_link', instr(payload_json ->> '$.deep_link', '/sites/') + 7),
                          instr(substr(payload_json ->> '$.deep_link', instr(payload_json ->> '$.deep_link', '/sites/') + 7), '/'))
              ELSE '' END)
          ELSE payload_json END,
        '$.visibility_scope')
    WHERE json_type(payload_json, '$.visibility_scope') IS NOT NULL
       OR instr(payload_json ->> '$.deep_link', '/sites/') > 0` },
  // An organization's media lives under organizations/<organization id>/. The
  // objects are copied in R2 before the cutover; media_objects_are_served below
  // fails the transfer by name if one was not.
  // Deleting an asset once left its placements behind (fixed: deletion now
  // removes them in the same batch). A placement of a deleted asset renders a
  // broken image, so the leftovers go with the asset they named.
  { name: 'placements_of_deleted_assets_are_removed', sql: `DELETE FROM media_placements
    WHERE asset_id IN (SELECT id FROM media_assets WHERE status = 'deleted')` },
  { name: 'media_keys_live_under_their_organization', sql: `UPDATE media_assets
      SET r2_key = 'organizations/' || substr(r2_key, 7),
          public_url = replace(public_url, '/sites/' || organization_id || '/', '/organizations/' || organization_id || '/')
    WHERE r2_key LIKE 'sites/' || organization_id || '/%'` },
  { name: 'embedded_media_urls_live_under_their_organization', sql: `UPDATE content_blocks
      SET data_json = (SELECT replace(content_blocks.data_json, '/sites/' || d.organization_id || '/', '/organizations/' || d.organization_id || '/')
        FROM content_documents d WHERE d.id = content_blocks.document_id)
    WHERE EXISTS (SELECT 1 FROM content_documents d WHERE d.id = content_blocks.document_id
      AND instr(content_blocks.data_json, '/sites/' || d.organization_id || '/') > 0)` },
  { name: 'settings_media_urls_live_under_their_organization', sql: `UPDATE organization
      SET settings_json = replace(settings_json, '/sites/' || id || '/', '/organizations/' || id || '/')
    WHERE instr(settings_json, '/sites/' || id || '/') > 0` },
  { name: 'redirect_media_urls_live_under_their_organization', sql: `UPDATE organization_redirects
      SET to_path = replace(to_path, '/sites/' || organization_id || '/', '/organizations/' || organization_id || '/')
    WHERE instr(to_path, '/sites/' || organization_id || '/') > 0` },
]

const LOCALIZED_OWNER_TABLES = {
  organization: 'organization', business_location: 'business_locations', product: 'products',
  collection: 'collections', media_asset: 'media_assets',
}

/** Every query must return no rows on a valid target. */
export const TARGET_INVARIANT_QUERIES = {
  // Every media object is addressed by the organization that owns it; a key left
  // anywhere else is a row the rename did not reach.
  // A placement renders its asset; one left pointing at a deleted asset is a
  // broken image on a live page.
  placements_show_live_assets: `SELECT p.id FROM media_placements p JOIN media_assets a ON a.id = p.asset_id
    WHERE p.status = 'active' AND a.status = 'deleted'`,
  media_keys_live_under_their_organization: `SELECT id FROM media_assets
    WHERE r2_key IS NOT NULL AND r2_key NOT LIKE 'organizations/' || organization_id || '/%'`,
  retired_site_names_are_gone: `SELECT id FROM analytics_summaries WHERE kind = 'site_day'
    UNION ALL SELECT id FROM content_blocks WHERE data_json ->> '$.source' LIKE 'site\\_%' ESCAPE '\\'
    UNION ALL SELECT id FROM activity_entries WHERE json_type(payload_json, '$.visibility_scope') IS NOT NULL OR instr(payload_json ->> '$.deep_link', '/sites/') > 0`,
  media_owner_scope: MEDIA_PLACEMENT_OWNER_AUDIT_QUERY,
  document_owner_scope: `WITH scope AS (${CONTENT_DOCUMENT_SCOPE_QUERY}) SELECT d.id FROM content_documents d WHERE (SELECT count(*) FROM scope s WHERE s.id = d.id) <> 1`,
  editorial_representation_scope: `SELECT d.id FROM content_documents d WHERE d.row_role = 'representation' AND NOT EXISTS (
    SELECT 1 FROM content_documents r WHERE r.id = d.root_id AND r.row_role = 'root' AND r.locale = 'en'
      AND r.kind = d.kind AND r.organization_id = d.organization_id)`,
  english_source_locale: `SELECT o.id FROM organization o WHERE NOT EXISTS (SELECT 1 FROM organization_locales l WHERE l.organization_id = o.id AND l.locale = 'en' AND l.is_source = 1)`,
  block_parent_scope: `SELECT b.id FROM content_blocks b WHERE b.parent_block_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_blocks p WHERE p.id = b.parent_block_id AND p.document_id = b.document_id)`,
  // Every localized resource is scoped by its organization. This used to add a
  // site to that scope for all but Product, which was the same organization
  // said twice.
  localized_resource_owner_scope: `SELECT r.id FROM resource_localizations r WHERE NOT (
    ${Object.entries(LOCALIZED_OWNER_TABLES).map(([type, table]) => `(r.resource_type = '${type}' AND EXISTS (SELECT 1 FROM ${table} o WHERE o.id = r.resource_id AND ${type === 'organization' ? 'o.id' : 'o.organization_id'} = r.organization_id))`).join(' OR ')})`,
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
  // A page grid names pages published by the same organization.
  page_grid_targets_exist: `SELECT b.id FROM content_blocks b, json_each(b.data_json, '$.page_ids') j
    WHERE b.type = 'page_grid' AND NOT EXISTS (
      SELECT 1 FROM content_documents d JOIN content_documents owner ON owner.id = b.document_id
       WHERE d.id = j.value AND d.kind = 'page' AND d.row_role = 'root' AND d.organization_id = owner.organization_id)`,
  // A booking holds a seat at a real occurrence of the product it names.
  booking_session_scope: `SELECT b.id FROM bookings b WHERE NOT EXISTS (
    SELECT 1 FROM product_sessions s WHERE s.id = b.product_session_id AND s.product_id = b.product_id)`,
  // `visibility` says whether a document is listed in its index, and those are
  // the only two answers. The CHECK covers root articles and social posts; this
  // covers every row, so a value stranded on a kind the CHECK does not reach is
  // still caught.
  document_visibility_is_listed_or_unlisted: `SELECT id FROM content_documents
    WHERE visibility IS NOT NULL AND visibility NOT IN ('listed', 'unlisted')`,
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
  // Roles are declared in TypeScript (utils/organization-access.ts), not in SQL.
  // A role the matrix does not know evaluates to no permissions at all, so a row
  // carrying a retired one is a person who quietly cannot reach their own tenant.
  //
  // This fails rather than rewriting the row. Mapping a retired role onto a
  // surviving one is a privilege decision: `member` granted nothing and
  // `editor` was scoped to a single location, so rewriting either to `admin`
  // hands out settings, billing and member management that nobody approved —
  // and an audit that accepts the resulting `admin` cannot see it happened.
  // Whoever runs the transfer resolves the row first.
  //
  // Only live authorization counts. A member row authorizes; an invitation
  // authorizes while it is pending. An accepted or revoked one is a record of
  // what happened and grants nothing.
  const roles = target.prepare(`
    SELECT DISTINCT role FROM member WHERE role IS NOT NULL
    UNION SELECT DISTINCT role FROM invitation WHERE role IS NOT NULL AND status = 'pending'
  `).all().map(row => String(row.role))
  const undeclared = roles.filter(role => !DECLARED_ORGANIZATION_ROLES.has(role))
  results.push({ name: 'organization_roles_are_declared', violations: undeclared.length, undeclared })
  // The R2 keys are the ones this transfer rewrites, and the objects were
  // copied to organizations/<id>/ in R2, outside this file. So every active
  // R2 row's public URL is fetched: one that does not answer 200 is an image
  // the rewrite would break, and the transfer names it. A deleted asset's
  // object is gone on purpose.
  const media = target.prepare("SELECT id, public_url FROM media_assets WHERE status = 'active' AND provider = 'cloudflare_r2' AND public_url IS NOT NULL").all()
  const unserved = media.filter(row => {
    const probe = spawnSync('curl', ['-s', '-o', '/dev/null', '-I', '-w', '%{http_code}', '--max-time', '20', String(row.public_url)], { encoding: 'utf8' })
    if (probe.error) throw probe.error
    return probe.stdout.trim() !== '200'
  })
  results.push({ name: 'media_objects_are_served', violations: unserved.length, unserved: unserved.map(row => `${row.id} ${row.public_url}`) })
  return results
}

// ---------------------------------------------------------------------------
// Schema epoch #1083
// ---------------------------------------------------------------------------

/**
 * What this epoch retires on purpose. A source table or column outside this
 * list that the baseline does not carry fails the transfer: it is data the copy
 * would otherwise drop without anyone deciding to.
 *
 * `broadcast_deliveries` rows are provider-delivery bookkeeping Resend owns
 * now (#1077); the SEO override columns are derived from title, summary and
 * path (#1080); a pending scheduled deletion is discarded with the scheduling
 * model (#913). None of them is copied anywhere.
 */
export const EPOCH_RETIRED = {
  tables: ['customers', 'broadcast_deliveries'],
  columns: {
    requests: ['customer_id'],
    reservations: ['customer_id'],
    bookings: ['customer_id'],
    review_requests: ['customer_id', 'anonymous_user_id'],
    reviews: ['customer_id'],
    content_documents: ['seo_title', 'seo_description', 'canonical_url'],
    user: ['deletionScheduledAt'],
    organization: ['deletionScheduledAt'],
  },
}

/** The domain rows that named a person through `customers`. */
const CUSTOMER_REFERENCES = ['requests', 'reservations', 'bookings', 'review_requests', 'reviews']

/**
 * `customers` was a second identity beside Better Auth's `user`. Each row
 * becomes the Better Auth user it names — or, when it names none, one
 * anonymous user keyed by the customer's own id — and every domain row that
 * pointed at the customer points at that user.
 *
 * Every inconsistency is collected and the transfer fails with all of them at
 * once: a transfer that stops at the first one is re-run once per bad row.
 * Nothing here picks between two values.
 */
function deriveUserIdentity(stage, sourceTables, record) {
  if (!sourceTables.includes('customers')) return
  const problems = []
  const refuse = (title, rows) => { if (rows.length) problems.push(`${title} (${rows.length}):\n${rows.map(row => `  ${JSON.stringify(row)}`).join('\n')}`) }

  for (const table of CUSTOMER_REFERENCES) {
    // A reference to no customer would map to no one, silently.
    refuse(`${table} rows naming a customer that does not exist`, stage.prepare(`SELECT t.id, t.customer_id FROM old.${qi(table)} t
      WHERE t.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM old.customers c WHERE c.id = t.customer_id)`).all())
    // A customer is one organization's; a row of another organization naming it is a tenant leak.
    refuse(`${table} rows naming another organization's customer`, stage.prepare(`SELECT t.id, t.organization_id, t.customer_id, c.organization_id AS customer_organization_id
      FROM old.${qi(table)} t JOIN old.customers c ON c.id = t.customer_id WHERE c.organization_id IS NOT t.organization_id`).all())
  }
  refuse('Customers linked to a user that does not exist', stage.prepare(`SELECT c.id, c.user_id FROM old.customers c
    WHERE c.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM main.user u WHERE u.id = c.user_id)`).all())
  refuse('Unlinked customers whose id already belongs to an unrelated Better Auth user', stage.prepare(`SELECT c.id, u.email FROM old.customers c
    JOIN main.user u ON u.id = c.id WHERE c.user_id IS NULL`).all())
  refuse('Unlinked customers whose migrated email already belongs to a Better Auth user', stage.prepare(`SELECT c.id, u.id AS user_id FROM old.customers c
    JOIN main.user u ON u.email = 'anon-migrated-' || c.id || '@customers.krabiclaw.local' WHERE c.user_id IS NULL`).all())
  // A customer no organization-scoped row refers to has nowhere to go: there is
  // no profile table to keep it in, and dropping it is not this transfer's call.
  refuse('Customers no domain row of their own organization refers to', stage.prepare(`SELECT c.id, c.organization_id, c.source, c.created_at, c.updated_at
    FROM old.customers c WHERE NOT (${CUSTOMER_REFERENCES.map(table => `EXISTS (SELECT 1 FROM old.${qi(table)} t WHERE t.customer_id = c.id AND t.organization_id = c.organization_id)`).join(' OR ')})
    ORDER BY c.organization_id, c.id`).all())

  stage.exec(`CREATE TEMP TABLE customer_user AS SELECT id AS customer_id, coalesce(user_id, id) AS user_id FROM old.customers`)

  // One Stripe Customer per person. Two different ones for the same person, or
  // one shared by two people, is a billing identity nobody can pick for them.
  const stripe = `SELECT u.id AS user_id, 'user.stripeCustomerId' AS source, u.id AS row_id, u.stripeCustomerId AS stripe_customer_id FROM main.user u WHERE u.stripeCustomerId IS NOT NULL
    UNION SELECT m.user_id, 'customers.stripe_customer_id', c.id, c.stripe_customer_id FROM old.customers c JOIN temp.customer_user m ON m.customer_id = c.id WHERE c.stripe_customer_id IS NOT NULL`
  refuse('People with more than one Stripe customer', stage.prepare(`SELECT * FROM (${stripe}) WHERE user_id IN (
    SELECT user_id FROM (${stripe}) GROUP BY user_id HAVING count(DISTINCT stripe_customer_id) > 1) ORDER BY user_id, source, row_id`).all())
  refuse('Stripe customers shared by more than one person', stage.prepare(`SELECT * FROM (${stripe}) WHERE stripe_customer_id IN (
    SELECT stripe_customer_id FROM (${stripe}) GROUP BY stripe_customer_id HAVING count(DISTINCT user_id) > 1) ORDER BY stripe_customer_id, user_id`).all())

  // review_requests and reviews already carried a user id beside the customer.
  // Where the two name different people there is no single identity to keep.
  refuse('Review requests whose customer and user disagree', stage.prepare(`SELECT r.id, r.customer_id, m.user_id AS customer_user_id, r.user_id, r.anonymous_user_id
    FROM old.review_requests r JOIN temp.customer_user m ON m.customer_id = r.customer_id
    WHERE (r.user_id IS NOT NULL AND r.user_id <> m.user_id) OR (r.anonymous_user_id IS NOT NULL AND r.anonymous_user_id <> m.user_id)`).all())
  refuse('Reviews whose customer and user disagree', stage.prepare(`SELECT r.id, r.customer_id, m.user_id AS customer_user_id, r.user_id
    FROM old.reviews r JOIN temp.customer_user m ON m.customer_id = r.customer_id WHERE r.user_id IS NOT NULL AND r.user_id <> m.user_id`).all())

  assert(problems.length === 0, `Customer identity preflight failed; nothing was written.\n${problems.join('\n')}`)

  record('customers_linked_to_existing_users', stage.prepare('SELECT count(*) AS n FROM old.customers WHERE user_id IS NOT NULL').get().n)
  // Better Auth's anonymous shape, with no `account` row: nobody signs in as a
  // migrated guest, and linking a real sign-in later goes through onLinkAccount.
  record('customers_become_anonymous_users', stage.prepare(`INSERT INTO main.user (id, name, email, emailVerified, image, phoneNumber, phoneNumberVerified, role, isAnonymous, stripeCustomerId, createdAt, updatedAt)
    SELECT c.id, coalesce(nullif(trim(c.name), ''), 'Guest'), 'anon-migrated-' || c.id || '@customers.krabiclaw.local', 0, NULL, NULL, 0, 'user', 1, NULL,
      unixepoch(c.created_at), unixepoch(c.updated_at)
    FROM old.customers c WHERE c.user_id IS NULL`).run().changes)
  record('stripe_customers_moved_to_users', stage.prepare(`UPDATE main.user SET stripeCustomerId = (
      SELECT c.stripe_customer_id FROM old.customers c JOIN temp.customer_user m ON m.customer_id = c.id
       WHERE m.user_id = main.user.id AND c.stripe_customer_id IS NOT NULL LIMIT 1)
    WHERE stripeCustomerId IS NULL AND id IN (
      SELECT m.user_id FROM old.customers c JOIN temp.customer_user m ON m.customer_id = c.id WHERE c.stripe_customer_id IS NOT NULL)`).run().changes)
  // An opt-out is the person's, across every tenant, and it wins over any
  // preference already stored.
  record('review_request_opt_outs', stage.prepare(`INSERT INTO main.user_notification_preferences (user_id, category, email_enabled, whatsapp_enabled, updated_at)
    SELECT m.user_id, 'review_requests', 0, 0, max(c.review_request_opted_out_at)
      FROM old.customers c JOIN temp.customer_user m ON m.customer_id = c.id
     WHERE c.review_request_opted_out_at IS NOT NULL GROUP BY m.user_id
    ON CONFLICT (user_id, category) DO UPDATE SET email_enabled = 0, whatsapp_enabled = 0, updated_at = excluded.updated_at`).run().changes)
  for (const table of CUSTOMER_REFERENCES) {
    record(`${table}_name_their_user`, stage.prepare(`UPDATE main.${qi(table)} SET user_id = (
        SELECT m.user_id FROM old.${qi(table)} o JOIN temp.customer_user m ON m.customer_id = o.customer_id WHERE o.id = main.${qi(table)}.id)
      WHERE id IN (SELECT id FROM old.${qi(table)} WHERE customer_id IS NOT NULL)`).run().changes)
  }
  stage.exec('DROP TABLE temp.customer_user')
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

/** Primary-key columns in key order; a table without one cannot be copied as a delta. */
function primaryKey(db, table) {
  return db.prepare(`PRAGMA table_info(${qi(table)})`).all().filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name)
}

/**
 * The full replacement, or with `deltaFrom` only the rows the earlier target
 * did not hold. A delta never deletes or updates: it is applied to a live
 * replacement database that has taken its own writes since, and a row it
 * cannot insert fails the import visibly rather than overwriting one.
 */
export function writePayload(target, payloadPath, schemaSql, { withoutJwks = false, deltaFrom = null } = {}) {
  const tables = tableNames(target).filter(table => !(withoutJwks && table === 'jwks'))
  const order = childFirstOrder(target, tables)
  const earlier = deltaFrom ? new Database(deltaFrom, { readonly: true, fileMustExist: true }) : null
  const delta = {}
  try {
    const lines = ['PRAGMA foreign_keys = OFF;', 'PRAGMA defer_foreign_keys = ON;', ...(earlier ? [] : order.map(table => `DELETE FROM ${qi(table)};`))]
    for (const table of [...order].reverse()) {
      const names = columns(target, table)
      let rows = target.prepare(`SELECT * FROM ${qi(table)}`).all()
      if (earlier) {
        const key = primaryKey(target, table)
        assert(key.length > 0, `${table} has no primary key, so its new rows cannot be told apart`)
        const held = new Set(earlier.prepare(`SELECT ${key.map(qi).join(', ')} FROM ${qi(table)}`).raw().all().map(values => JSON.stringify(values)))
        rows = rows.filter(row => !held.has(JSON.stringify(key.map(name => row[name]))))
        delta[table] = rows.length
      }
      for (const row of rows) {
        lines.push(`INSERT INTO ${qi(table)} (${names.map(qi).join(', ')}) VALUES (${names.map(name => sqlLiteral(row[name])).join(', ')});`)
      }
    }
    lines.push('PRAGMA foreign_keys = ON;')
    writeFileSync(payloadPath, lines.join('\n') + '\n', { mode: 0o600 })

    const replay = new Database(':memory:')
    try {
      replay.exec(schemaSql)
      replay.pragma('foreign_keys = ON')
      if (earlier) {
        // The delta lands on what the earlier target held and must complete it:
        // every row of this target is then present, and nothing dangles.
        replay.pragma('foreign_keys = OFF')
        for (const table of tables) {
          const names = columns(earlier, table)
          const insert = replay.prepare(`INSERT INTO ${qi(table)} (${names.map(qi).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
          for (const row of earlier.prepare(`SELECT * FROM ${qi(table)}`).all()) insert.run(...names.map(name => row[name]))
        }
        replay.pragma('foreign_keys = ON')
        replay.exec(readFileSync(payloadPath, 'utf8'))
        for (const table of tables) {
          const key = primaryKey(target, table)
          const present = new Set(replay.prepare(`SELECT ${key.map(qi).join(', ')} FROM ${qi(table)}`).raw().all().map(values => JSON.stringify(values)))
          const missing = target.prepare(`SELECT ${key.map(qi).join(', ')} FROM ${qi(table)}`).raw().all().filter(values => !present.has(JSON.stringify(values)))
          assert(missing.length === 0, `Delta replay is missing ${missing.length} ${table} rows`)
        }
      } else {
        // Replaying the payload onto a populated copy must reproduce the target exactly.
        replay.exec(readFileSync(payloadPath, 'utf8'))
        replay.exec(readFileSync(payloadPath, 'utf8'))
        for (const table of tables) {
          const names = columns(target, table)
          assert(digest(target.prepare(`SELECT * FROM ${qi(table)}`).all(), names) === digest(replay.prepare(`SELECT * FROM ${qi(table)}`).all(), names), `Payload replay differs: ${table}`)
        }
      }
      assert(replay.pragma('foreign_key_check').length === 0, 'Payload replay has foreign key violations')
    } finally {
      replay.close()
    }
    return { tables: tables.length, statements: lines.length, ...(earlier ? { delta } : {}) }
  } finally {
    earlier?.close()
  }
}

/** Every schema object, as SQLite reports it; what a destination must carry for the payload to apply. */
export const SCHEMA_OBJECTS_QUERY = "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT IN ('d1_migrations', '__drizzle_migrations') ORDER BY type, name"

/**
 * @typedef {{ table: string, source_rows: number, target_rows: number }} TableTransfer
 * @typedef {{ baseline_sha256: string, tables: TableTransfer[], retired_tables: Array<{ table: string, source_rows: number }>, retired_columns: Record<string, string[]>,
 *   added_columns: Record<string, string[]>, derived: Record<string, number>, transforms: Array<{ name: string, changes: number, sql_sha256: string }>,
 *   invariants: Array<{ name: string, violations: number, sql_sha256: string }>, payload?: { tables: number, statements: number, delta?: Record<string, number> },
 *   schema?: Array<{ type: string, name: string, sql: string }> }} TransferManifest
 */

/**
 * @param {string} sourcePath
 * @param {string} targetPath
 * @param {{ payloadPath?: string | null, withoutJwks?: boolean, deltaFrom?: string | null }} [options]
 * @returns {TransferManifest}
 */
export function transferDatabaseExport(sourcePath, targetPath, { payloadPath = null, withoutJwks = false, deltaFrom = null } = {}) {
  assert(!existsSync(targetPath), `Target already exists: ${targetPath}`)
  assert(!deltaFrom || payloadPath, 'A delta is a payload; pass --payload with --delta-from')
  const schemaSql = migrationChainSql()
  const source = openDatabase(resolve(sourcePath))
  const sourceFile = resolve(`${targetPath}.source.sqlite`)
  assert(!existsSync(sourceFile), `Source scratch file already exists: ${sourceFile}`)
  // The epoch reads retired tables and columns through ATTACH, so the source
  // has to be a file even when it arrived as a dump.
  source.exec(`VACUUM INTO ${sqlLiteral(sourceFile)}`)
  // Rows are copied and transformed in a staging copy of the baseline with CHECK
  // enforcement off: the source still holds the retired values the transforms
  // rewrite. The final target then re-inserts every row under full enforcement,
  // so nothing the transforms missed can survive into it.
  const stage = new Database(':memory:')
  const target = new Database(targetPath)
  /** @type {TransferManifest} */
  const manifest = {
    baseline_sha256: hash(readFileSync(resolve(MIGRATIONS_DIRECTORY, '0000_baseline.sql'), 'utf8')),
    tables: [],
    retired_tables: [],
    retired_columns: {},
    added_columns: {},
    derived: {},
    transforms: [],
    invariants: [],
  }
  try {
    stage.exec(schemaSql)
    stage.pragma('ignore_check_constraints = ON')
    stage.pragma('foreign_keys = OFF')
    stage.exec(`ATTACH ${sqlLiteral(sourceFile)} AS old`)
    const names = tableNames(stage)
    const sourceTables = tableNames(source)
    const count = (db, table) => db.prepare(`SELECT count(*) AS n FROM ${qi(table)}`).get().n

    const retiredTables = sourceTables.filter(table => !names.includes(table))
    const undeclaredTables = retiredTables.filter(table => !EPOCH_RETIRED.tables.includes(table))
    assert(undeclaredTables.length === 0, `Source tables the baseline does not carry and no epoch retires: ${undeclaredTables.join(', ')}`)
    manifest.retired_tables = retiredTables.map(table => ({ table, source_rows: count(source, table) }))
    // The snapshot pull leaves jwks behind on purpose; any other absent table
    // would arrive empty and look like a tenant with no data.
    const absent = names.filter(table => !sourceTables.includes(table) && !(withoutJwks && table === 'jwks'))
    assert(absent.length === 0, `Source is missing baseline tables: ${absent.join(', ')}`)

    for (const table of names.filter(table => sourceTables.includes(table))) {
      const targetColumns = columns(stage, table)
      const sourceColumns = columns(source, table)
      const retired = sourceColumns.filter(name => !targetColumns.includes(name))
      const undeclared = retired.filter(name => !(EPOCH_RETIRED.columns[table] ?? []).includes(name))
      assert(undeclared.length === 0, `${table}: source columns the baseline does not carry and no epoch retires: ${undeclared.join(', ')}`)
      if (retired.length) manifest.retired_columns[table] = retired
      // A column the baseline added starts NULL or at its declared default. One
      // that is NOT NULL with no default has no value to take, and the transfer
      // says so rather than inventing one.
      const added = stage.prepare(`PRAGMA table_info(${qi(table)})`).all().filter(column => !sourceColumns.includes(column.name))
      const unfillable = added.filter(column => column.notnull === 1 && column.dflt_value === null)
      assert(unfillable.length === 0, `${table}: baseline requires ${unfillable.map(column => column.name).join(', ')}, which the source cannot supply`)
      if (added.length) manifest.added_columns[table] = added.map(column => column.name)
      const shared = targetColumns.filter(name => sourceColumns.includes(name))
      stage.prepare(`INSERT INTO main.${qi(table)} (${shared.map(qi).join(',')}) SELECT ${shared.map(qi).join(',')} FROM old.${qi(table)}`).run()
      manifest.tables.push({ table, source_rows: count(source, table) })
    }
    deriveUserIdentity(stage, sourceTables, (name, changes) => { manifest.derived[name] = changes })
    for (const transform of TRANSFORMS) {
      // A transform that folds a retiring column reads it from the attached
      // source. A source that never had it has nothing to fold, and the
      // manifest says the transform was skipped.
      if (transform.requires && !transform.requires.columns.every(name => columns(source, transform.requires.table).includes(name))) {
        manifest.transforms.push({ name: transform.name, changes: 0, skipped: 'source has no such column', sql_sha256: hash(transform.sql) })
        continue
      }
      const result = stage.prepare(transform.sql).run()
      manifest.transforms.push({ name: transform.name, changes: result.changes, sql_sha256: hash(transform.sql) })
    }
    stage.exec('DETACH old')
    target.exec(schemaSql)
    // CHECK constraints stay on: the target must reject anything the epoch
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
    for (const entry of manifest.tables) entry.target_rows = count(target, entry.table)
    const violations = target.pragma('foreign_key_check')
    assert(violations.length === 0, `Foreign key violations after transfer (${violations.length}): ${JSON.stringify(violations.slice(0, 8))}`)
    assert(target.pragma('integrity_check', { simple: true }) === 'ok', 'Integrity check failed')
    // The target is the baseline, object for object: nothing the copy did may
    // have created, altered or lost a table, index, view or trigger.
    const baseline = new Database(':memory:')
    baseline.exec(schemaSql)
    const expected = baseline.prepare(SCHEMA_OBJECTS_QUERY).all()
    baseline.close()
    manifest.schema = target.prepare(SCHEMA_OBJECTS_QUERY).all()
    assert(JSON.stringify(manifest.schema) === JSON.stringify(expected), 'Target schema differs from the baseline')
    manifest.invariants = auditTargetInvariants(target)
    const broken = manifest.invariants.filter(result => result.violations > 0)
    assert(broken.length === 0, `Invariant violations: ${broken.map(result => `${result.name}=${result.violations}`).join(', ')}`)
    if (payloadPath) manifest.payload = writePayload(target, payloadPath, schemaSql, { withoutJwks, deltaFrom })
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

/** The row-count comparison a cutover reads before it repoints anything. */
export function printTransferReport(manifest) {
  const width = Math.max(...manifest.tables.map(entry => entry.table.length), ...manifest.retired_tables.map(entry => entry.table.length))
  console.log(`${'table'.padEnd(width)}  source  target`)
  for (const entry of manifest.tables) {
    console.log(`${entry.table.padEnd(width)}  ${String(entry.source_rows).padStart(6)}  ${String(entry.target_rows).padStart(6)}${entry.source_rows === entry.target_rows ? '' : '  (changed by the epoch or a transform)'}`)
  }
  for (const entry of manifest.retired_tables) console.log(`${entry.table.padEnd(width)}  ${String(entry.source_rows).padStart(6)}  retired`)
  for (const [table, names] of Object.entries(manifest.retired_columns)) console.log(`Retired ${table}: ${names.join(', ')}`)
  for (const [table, names] of Object.entries(manifest.added_columns)) console.log(`Added ${table}: ${names.join(', ')}`)
  console.log(`Derived: ${Object.entries(manifest.derived).map(([name, changes]) => `${name}=${changes}`).join(', ') || 'nothing'}`)
  console.log(`Transforms: ${manifest.transforms.filter(transform => transform.changes > 0).map(transform => `${transform.name}=${transform.changes}`).join(', ') || 'no changes'}`)
  if (manifest.payload?.delta) console.log(`Delta: ${Object.entries(manifest.payload.delta).filter(([, rows]) => rows > 0).map(([table, rows]) => `${table}=${rows}`).join(', ') || 'no new rows'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = name => { const index = args.indexOf(name); return index >= 0 ? args.splice(index, 1).length > 0 : false }
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args.splice(index, 2)[1] : null }
  const withoutJwks = flag('--without-jwks')
  const payloadPath = option('--payload')
  const deltaFrom = option('--delta-from')
  const [sourcePath, targetPath] = args
  if (!sourcePath || !targetPath) throw new Error('Usage: transfer-database-export.mjs <source.sql|source.sqlite> <target.sqlite> [--payload <payload.sql>] [--without-jwks] [--delta-from <earlier-target.sqlite>]')
  printTransferReport(transferDatabaseExport(sourcePath, targetPath, { payloadPath, withoutJwks, deltaFrom }))
  console.log('Transfer passed.')
}
