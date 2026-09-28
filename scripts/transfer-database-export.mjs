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
import { formatCalendarDate, formatTime, formatTimestamp } from '../utils/timezone.ts'
import { normalizePostSlug } from '../utils/post-slugs.ts'

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
  // Social posts are read by the social_posts block from the canonical feed;
  // a grid that copied them, or a block holding its own copy, is stale data.
  social_posts_are_read_not_copied: `SELECT id FROM content_blocks WHERE (type = 'feature_grid' AND data_json ->> '$.source' = 'organization_updates')
    OR (type = 'social_posts' AND json_type(data_json, '$.items') IS NOT NULL)`,
  // Provider media belongs to an imported publication of its own tenant; the
  // foreign key proves the tenant, this proves the origin.
  imported_media_comes_from_imports: `SELECT a.id FROM media_assets a JOIN post_publications p ON p.organization_id = a.organization_id AND p.id = a.origin_publication_id
    WHERE p.origin <> 'import'`,
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
// Schema epoch #1115: social publishing and the content lifecycle
// ---------------------------------------------------------------------------

/**
 * What this epoch retires on purpose. A source table or column outside this
 * list that the baseline does not carry fails the transfer.
 *
 * `scheduled_for` goes with application-owned publication scheduling: every
 * scheduled article and post becomes a draft below, and the time it was due is
 * kept in the report, not in a runtime field.
 */
export const EPOCH_RETIRED = {
  tables: [],
  columns: {
    content_documents: ['scheduled_for'],
  },
}

/**
 * Tables this epoch adds. The source has none of them; the epoch fills them
 * from what the source recorded elsewhere, or they start empty.
 */
export const EPOCH_ADDED_TABLES = ['post_publications']

/**
 * The verified provider identity of each historical channel entry, keyed
 * `<document id>:<channel>`: `{ provider_app_id, provider_subject_id,
 * provider_target_id, provider_permalink? }`.
 *
 * `metadata_json.channels` recorded a provider post id and nothing about which
 * Meta app, which authorizing person or which Page or professional account it
 * belonged to, and the account connected now is not evidence it authored an old
 * row. So every entry that becomes a `post_publications` row needs its identity
 * established from the provider and written here, in the same release, before
 * the cutover; an entry with none fails the preflight by row ID. Production
 * held no channel entries when this epoch was written.
 */
export const EPOCH_PUBLICATION_IDENTITIES = {}

/**
 * The labels the post detail drew beside an event and an offer, in each locale
 * the site carried when this epoch was written. They are copied here rather
 * than read from the runtime catalogs because the runtime no longer renders
 * structured events or offers, and so no longer carries these strings.
 */
const FACT_LABELS = {
  en: { event: 'Event Details:', offer: 'Special Offer:', code: 'Code:' },
  th: { event: 'รายละเอียดกิจกรรม:', offer: 'โปรโมชั่นพิเศษ:', code: 'รหัส:' },
  ja: { event: 'イベント詳細:', offer: '特別オファー:', code: 'コード:' },
}

/** A label in a locale, as the renderer that showed these facts had it. None is generated. */
function localeMessage(locale, key) {
  const value = FACT_LABELS[locale]?.[key]
  if (!value) throw new Error(`No ${locale} label for ${key}; a caption is never written in a language the site did not already carry`)
  return value
}

const POST_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * The event line the post detail rendered (formerly `postEventDescription` in
 * shared/posts.ts, which leaves the runtime with the structured event). It is
 * reproduced here unchanged so the words a visitor read are the words the
 * caption keeps.
 */
function eventDescription(event, locale) {
  const schedule = event.schedule
  const range = `${formatCalendarDate(schedule.start_date, locale)} ${formatTime(schedule.start_time, locale)} – ${formatCalendarDate(schedule.end_date, locale)} ${formatTime(schedule.end_time, locale)}`
  const rule = event.recurrence_info
  if (!rule) return range
  const weekdayName = day => formatCalendarDate(`2026-09-${String(6 + POST_WEEKDAYS.indexOf(day)).padStart(2, '0')}`, locale, { weekday: 'long' })
  const startDay = POST_WEEKDAYS[new Date(`${schedule.start_date}T00:00:00Z`).getUTCDay()]
  const thai = locale.startsWith('th')
  const cadence = rule.kind === 'daily' ? (thai ? 'ทุกวัน' : 'Daily')
    : rule.kind === 'weekly' ? (rule.days_of_week.length ? rule.days_of_week : [startDay]).map(weekdayName).join(', ')
      : 'day_of_month' in rule ? `${thai ? 'ทุกเดือน วันที่' : 'Monthly on day'} ${rule.day_of_month}`
        : `${thai ? 'ทุกเดือน' : 'Monthly'}, ${rule.day_of_week_occurrence} ${weekdayName(startDay)}`
  return `${range} · ${cadence}${rule.series_end_time ? ` · ${thai ? 'ถึง' : 'Until'} ${formatTimestamp(rule.series_end_time, locale, 'UTC')} UTC` : ''}`
}

/**
 * The structured facts a short post carried beside its words, written out as
 * words: the event with its dates, times and recurrence, the offer's code,
 * redemption link and terms, and the alert. Deterministic, in the post's own
 * locale, with the labels the post detail already showed. Nothing is
 * paraphrased and nothing absent is supplied.
 */
function literalPostFacts({ event, offer, alert_type: alertType }, locale) {
  const sections = []
  if (event) sections.push(`${localeMessage(locale, 'event')} ${event.title.trim()}\n${eventDescription(event, locale)}`)
  if (offer && ['coupon_code', 'redeem_online_url', 'terms_conditions'].some(key => typeof offer[key] === 'string' && offer[key].trim())) {
    const lines = [localeMessage(locale, 'offer')]
    if (offer.coupon_code?.trim()) lines.push(`${localeMessage(locale, 'code')} ${offer.coupon_code.trim()}`)
    if (offer.redeem_online_url?.trim()) lines.push(offer.redeem_online_url.trim())
    if (offer.terms_conditions?.trim()) lines.push(offer.terms_conditions.trim())
    sections.push(lines.join('\n'))
  }
  // An alert was a label and nothing else; `covid_19` was its only value.
  if (alertType) sections.push(alertType === 'covid_19' ? 'COVID-19' : String(alertType))
  return sections.join('\n\n')
}

/** The button label the post detail drew for an action type (`formatCta`). */
const actionLabel = actionType => String(actionType).replaceAll('_', ' ').toLowerCase().replace(/^\w/, character => character.toUpperCase())

const deterministicId = (...parts) => {
  const digest = hash(parts.join('\u0000'))
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`
}

const canonicalInstant = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/**
 * Every epoch rule that needs judgement runs here, on the staged copy, and every
 * row it cannot map is collected and refused at once with its ID. What it maps
 * is reported, so the transfer's output is the before/after inventory.
 */
function transformSocialPublishingEpoch(stage, source, record, { publicationIdentities = EPOCH_PUBLICATION_IDENTITIES } = {}) {
  const report = {
    scheduled_to_draft: [], lifecycle_refusals: [], social_post_facts: [], calls_to_action: [], publications: [],
    dropped_channel_entries: [], imported_media: [], repaired_slugs: [], first_published_at: 0, social_blocks: [],
  }
  const problems = []
  const refuse = (title, rows) => { if (rows.length) problems.push(`${title} (${rows.length}):\n${rows.map(row => `  ${JSON.stringify(row)}`).join('\n')}`) }
  const sourceHasSchedule = columns(source, 'content_documents').includes('scheduled_for')

  // 1. Nothing publishes on a clock any more. A scheduled article or post keeps
  //    its content, id, slug, author, media, translations and visibility and
  //    becomes a draft; when it was due is reported, not re-created anywhere.
  if (sourceHasSchedule) {
    report.scheduled_to_draft = stage.prepare(`SELECT id, organization_id, kind, scheduled_for FROM old.content_documents
      WHERE row_role = 'root' AND kind IN ('article', 'social_post') AND status = 'scheduled' ORDER BY organization_id, id`).all()
    stage.prepare(`UPDATE main.content_documents SET status = 'draft', published_at = NULL
      WHERE row_role = 'root' AND kind IN ('article', 'social_post') AND status = 'scheduled'`).run()
  }
  // A published row without the time it was published is not a publication
  // this transfer can date; it is named rather than given a date.
  report.lifecycle_refusals = stage.prepare(`SELECT id, organization_id, kind, status FROM main.content_documents
    WHERE row_role = 'root' AND kind IN ('article', 'social_post') AND (
      status NOT IN ('draft', 'published') OR (status = 'published' AND published_at IS NULL))
    ORDER BY id`).all()
  refuse('Articles and posts whose lifecycle cannot be carried (not draft or published, or published with no published_at)', report.lifecycle_refusals)
  // A published post that never recorded its first publication did first go
  // out when it was published.
  report.first_published_at = stage.prepare(`UPDATE main.content_documents SET first_published_at = published_at
    WHERE kind = 'social_post' AND row_role = 'root' AND status = 'published' AND first_published_at IS NULL AND published_at IS NOT NULL`).run().changes

  const posts = stage.prepare(`SELECT d.id, d.organization_id, d.location_id, d.title, d.slug, d.summary, d.created_by, d.metadata_json, bl.phone AS location_phone
    FROM main.content_documents d LEFT JOIN main.business_locations bl ON bl.id = d.location_id AND bl.organization_id = d.organization_id
    WHERE d.kind = 'social_post' AND d.row_role = 'root' ORDER BY d.organization_id, d.id`).all()
  const representations = stage.prepare(`SELECT id, root_id, locale, summary, metadata_json FROM main.content_documents
    WHERE kind = 'social_post' AND row_role = 'representation' ORDER BY root_id, locale`).all()
  const updateDocument = stage.prepare('UPDATE main.content_documents SET summary = ?, metadata_json = ? WHERE id = ?')
  const insertPublication = stage.prepare(`INSERT INTO main.post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id,
    provider_target_id, origin, state, provider_post_id, provider_permalink, provider_handles_json, payload_hash, attempt_id, error_code, error_message,
    published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, NULL, ?, ?, ?, ?, ?)`)
  const unmappedIdentities = []
  const ambiguousProvenance = []
  const unresolvablePhones = []
  const invalidTimes = []
  const untranslated = []
  const now = new Date().toISOString()

  for (const post of posts) {
    const metadata = JSON.parse(post.metadata_json)
    const facts = { event: metadata.event ?? null, offer: metadata.offer ?? null, alert_type: metadata.alert_type ?? null }
    const hasFacts = Boolean(facts.event || facts.alert_type || (facts.offer && Object.keys(facts.offer).length))

    // 3. The event, offer, recurrence and alert become the post's own words,
    //    appended after the original body, which stays verbatim.
    let summary = post.summary
    if (hasFacts) {
      const appended = literalPostFacts(facts, 'en')
      if (appended) summary = summary?.trim() ? `${summary}\n\n${appended}` : appended
      report.social_post_facts.push({ id: post.id, locale: 'en', before: { post_type: metadata.post_type ?? null, ...facts }, appended })
    }
    // 4. A call to action keeps its destination and the label a visitor saw.
    //    A call resolves to the phone of the location the post actually names.
    let callToAction = null
    const action = metadata.call_to_action
    if (action && typeof action === 'object') {
      if (action.action_type === 'call') {
        if (!post.location_id || !post.location_phone?.trim()) unresolvablePhones.push({ id: post.id, organization_id: post.organization_id, location_id: post.location_id })
        else callToAction = { label: actionLabel('call'), url: `tel:${post.location_phone.trim().replace(/\s+/g, '')}` }
      } else if (typeof action.url === 'string' && /^https?:\/\//i.test(action.url.trim())) {
        callToAction = { label: actionLabel(action.action_type), url: action.url.trim() }
      } else {
        unresolvablePhones.push({ id: post.id, organization_id: post.organization_id, call_to_action: action })
      }
      if (callToAction) report.calls_to_action.push({ id: post.id, before: action, after: callToAction })
    }
    updateDocument.run(summary, JSON.stringify(callToAction ? { call_to_action: callToAction } : {}), post.id)

    // Translations say the same facts in their own locale, from their own
    // translated title and terms. A translation that never carried them was
    // not shown, and is refused rather than completed with English.
    for (const representation of representations.filter(row => row.root_id === post.id)) {
      const translated = JSON.parse(representation.metadata_json)
      let translatedSummary = representation.summary
      if (hasFacts) {
        const localized = {
          event: facts.event ? { ...facts.event, ...(translated.event ?? {}) } : null,
          offer: facts.offer ? { ...facts.offer, ...(translated.offer ?? {}) } : null,
          alert_type: facts.alert_type,
        }
        if ((facts.event && !translated.event?.title?.trim()) || (facts.offer?.terms_conditions?.trim() && !translated.offer?.terms_conditions?.trim())) {
          untranslated.push({ id: representation.id, root_id: post.id, locale: representation.locale })
          continue
        }
        const appended = literalPostFacts(localized, representation.locale)
        translatedSummary = translatedSummary?.trim() ? `${translatedSummary}\n\n${appended}` : appended
        report.social_post_facts.push({ id: representation.id, locale: representation.locale, before: { event: translated.event ?? null, offer: translated.offer ?? null }, appended })
      }
      updateDocument.run(translatedSummary, '{}', representation.id)
    }

    // 5-7. Channel entries. A publication is kept only with provider evidence
    //      and a verified identity; `skipped` never was one. A pending or failed
    //      entry is unknown: the old catch recorded a timeout as a failure.
    const importPrefix = { facebook: 'fb-post-', instagram: 'ig-post-' }
    for (const [channel, entry] of Object.entries(metadata.channels ?? {})) {
      if (!entry || typeof entry !== 'object') continue
      if (entry.status === 'skipped') {
        report.dropped_channel_entries.push({ id: post.id, channel, status: 'skipped', error: entry.error_message ?? null })
        continue
      }
      const imported = post.created_by === `${channel}-sync` && post.id === `${importPrefix[channel]}${entry.provider_post_id}`
      const importNamed = post.created_by === `${channel}-sync` || post.id.startsWith(importPrefix[channel])
      if (importNamed && !imported) {
        ambiguousProvenance.push({ id: post.id, channel, created_by: post.created_by, provider_post_id: entry.provider_post_id ?? null })
        continue
      }
      const identity = publicationIdentities[`${post.id}:${channel}`]
      if (!identity || !['provider_app_id', 'provider_subject_id', 'provider_target_id'].every(key => typeof identity[key] === 'string' && identity[key].trim())) {
        unmappedIdentities.push({ id: post.id, organization_id: post.organization_id, channel, status: entry.status, provider_post_id: entry.provider_post_id ?? null })
        continue
      }
      const state = entry.status === 'published' ? 'published' : 'unknown'
      const publishedAt = state === 'published' ? canonicalInstant(entry.published_at) : null
      if (state === 'published' && (!entry.provider_post_id || !publishedAt)) {
        invalidTimes.push({ id: post.id, channel, provider_post_id: entry.provider_post_id ?? null, published_at: entry.published_at ?? null })
        continue
      }
      const publicationId = deterministicId('post_publication', post.organization_id, post.id, channel)
      const createdAt = canonicalInstant(entry.created_at) ?? now
      const error = state === 'unknown'
        ? { code: entry.status === 'pending' ? 'transfer_pending_unresolved' : 'transfer_failure_unconfirmed',
          message: entry.status === 'pending'
            ? 'This publication was still pending when the schema was replaced; the provider outcome was never recorded.'
            : `The earlier attempt recorded "${entry.error_message ?? 'failed'}" without proof the provider refused it.` }
        : { code: null, message: null }
      insertPublication.run(publicationId, post.organization_id, post.id, channel, identity.provider_app_id, identity.provider_subject_id,
        identity.provider_target_id, imported ? 'import' : 'publish', state, entry.provider_post_id ?? null, identity.provider_permalink ?? null,
        // A historical outbound publication recorded no fingerprint of what it
        // sent. This marker never equals a real one, so it is never mistaken for
        // proof the local copy still matches.
        imported ? null : `unrecorded:${hash(JSON.stringify(entry))}`,
        error.code, error.message, publishedAt, createdAt, createdAt)
      report.publications.push({ id: publicationId, post_id: post.id, channel, origin: imported ? 'import' : 'publish', state,
        provider_post_id: entry.provider_post_id ?? null, prior_status: entry.status, prior_error: entry.error_message ?? null })
      // Only media the importer itself created is provider media: the asset it
      // named after the provider post, stored as external, placed on this post.
      if (imported) {
        const assetId = `${channel === 'facebook' ? 'fb' : 'ig'}-asset-${entry.provider_post_id}`
        const changes = stage.prepare(`UPDATE main.media_assets SET origin_publication_id = ? WHERE id = ? AND organization_id = ? AND source = 'external'
          AND EXISTS (SELECT 1 FROM main.media_placements p WHERE p.asset_id = media_assets.id AND p.owner_type = 'content_document' AND p.owner_id = ?)`)
          .run(publicationId, assetId, post.organization_id, post.id).changes
        if (changes) report.imported_media.push({ asset_id: assetId, publication_id: publicationId })
      }
    }
  }
  refuse('Social posts whose call to action has no resolvable destination (a call needs its location\'s phone)', unresolvablePhones)
  refuse('Social post translations that never carried their event or offer copy', untranslated)
  refuse('Social posts whose import provenance is ambiguous', ambiguousProvenance)
  refuse('Channel entries with no verified provider identity in EPOCH_PUBLICATION_IDENTITIES', unmappedIdentities)
  refuse('Published channel entries without a provider post id or a valid publication time', invalidTimes)

  // 8. Every post has its route from creation. An imported row that never got
  //    one takes the canonical allocation, and uniqueness is the tenant's.
  const taken = new Set(stage.prepare("SELECT organization_id || ':' || slug AS key FROM main.content_documents WHERE kind = 'social_post' AND row_role IN ('root', 'representation') AND locale = 'en' AND slug IS NOT NULL").all().map(row => row.key))
  const setSlug = stage.prepare('UPDATE main.content_documents SET slug = ? WHERE id = ?')
  for (const post of stage.prepare("SELECT id, organization_id, title, summary FROM main.content_documents WHERE kind = 'social_post' AND row_role = 'root' AND slug IS NULL ORDER BY organization_id, id").all()) {
    const base = normalizePostSlug(post.title ?? post.summary?.slice(0, 80) ?? '') || `update-${post.id}`
    let slug = base
    for (let attempt = 2; taken.has(`${post.organization_id}:${slug}`); attempt += 1) slug = `${base}-${attempt}`
    taken.add(`${post.organization_id}:${slug}`)
    setSlug.run(slug, post.id)
    report.repaired_slugs.push({ id: post.id, slug })
  }

  // 9. The social feature grid becomes the social_posts block: same identity,
  //    position, headings and button; the rows it held are read, not stored.
  //    A grid with no limit showed up to twelve and keeps showing twelve.
  const invalidBlocks = []
  const updateBlock = stage.prepare('UPDATE main.content_blocks SET type = ?, data_json = ? WHERE id = ?')
  for (const block of stage.prepare("SELECT id, document_id, data_json FROM main.content_blocks WHERE type = 'feature_grid' AND data_json ->> '$.source' = 'organization_updates' ORDER BY document_id, position").all()) {
    const data = JSON.parse(block.data_json)
    const limit = data.limit === undefined || data.limit === null ? 12 : data.limit
    const hasLabel = typeof data.cta_label === 'string' && data.cta_label.trim() !== ''
    const hasUrl = typeof data.cta_url === 'string' && data.cta_url.trim() !== ''
    if (!Number.isInteger(limit) || limit < 1 || limit > 12 || hasLabel !== hasUrl) {
      invalidBlocks.push({ id: block.id, document_id: block.document_id, limit: data.limit ?? null, cta_label: data.cta_label ?? null, cta_url: data.cta_url ?? null })
      continue
    }
    const converted = {
      ...(typeof data.title === 'string' && data.title.trim() ? { title: data.title } : {}),
      ...(typeof data.description === 'string' && data.description.trim() ? { description: data.description } : {}),
      limit,
      ...(hasLabel ? { call_to_action: { label: data.cta_label, url: data.cta_url } } : {}),
    }
    updateBlock.run('social_posts', JSON.stringify(converted), block.id)
    report.social_blocks.push({ id: block.id, document_id: block.document_id, before: data, after: converted })
  }
  refuse('Social feature grids whose limit or button cannot be carried', invalidBlocks)

  assert(problems.length === 0, `Social publishing preflight failed; nothing was written.\n${problems.join('\n')}`)
  record('scheduled_content_to_draft', report.scheduled_to_draft.length)
  record('social_post_facts_to_words', report.social_post_facts.length)
  record('calls_to_action_converted', report.calls_to_action.length)
  record('post_publications', report.publications.length)
  record('channel_entries_dropped', report.dropped_channel_entries.length)
  record('imported_media_provenance', report.imported_media.length)
  record('social_post_slugs_repaired', report.repaired_slugs.length)
  record('social_post_first_published_at', report.first_published_at)
  record('social_posts_blocks', report.social_blocks.length)
  return report
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
  const leftBehind = {}
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
        // A delta carries creations only. What it leaves behind is every row
        // the earlier target held whose values have changed since, or which is
        // gone from the source. Those are named, table by table, for whoever
        // repoints the binding to read first; nothing is updated for them.
        const current = new Map(target.prepare(`SELECT * FROM ${qi(table)}`).all().map(row => [JSON.stringify(key.map(name => row[name])), JSON.stringify(names.map(name => row[name]))]))
        const changed = []
        const deleted = []
        for (const row of earlier.prepare(`SELECT * FROM ${qi(table)}`).all()) {
          const id = JSON.stringify(key.map(name => row[name]))
          if (!current.has(id)) deleted.push(id)
          else if (current.get(id) !== JSON.stringify(names.map(name => row[name]))) changed.push(id)
        }
        if (changed.length || deleted.length) leftBehind[table] = { changed, deleted }
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
    return { tables: tables.length, statements: lines.length, ...(earlier ? { delta, left_behind: leftBehind } : {}) }
  } finally {
    earlier?.close()
  }
}

/** Every schema object, as SQLite reports it; what a destination must carry for the payload to apply. */
export const SCHEMA_OBJECTS_QUERY = "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT IN ('d1_migrations', '__drizzle_migrations') ORDER BY type, name"

/**
 * @typedef {{ table: string, source_rows: number, target_rows: number }} TableTransfer
 * @typedef {{ baseline_sha256: string, tables: TableTransfer[], retired_tables: Array<{ table: string, source_rows: number }>, retired_columns: Record<string, string[]>,
 *   added_columns: Record<string, string[]>, epoch: ReturnType<typeof transformSocialPublishingEpoch> | null,
 *   derived: Record<string, number>, transforms: Array<{ name: string, changes: number, sql_sha256: string }>,
 *   invariants: Array<{ name: string, violations: number, sql_sha256: string }>, payload?: { tables: number, statements: number, delta?: Record<string, number>, left_behind?: Record<string, { changed: string[], deleted: string[] }> },
 *   schema?: Array<{ type: string, name: string, sql: string }> }} TransferManifest
 */

/**
 * @param {string} sourcePath
 * @param {string} targetPath
 * @param {{ payloadPath?: string | null, withoutJwks?: boolean, deltaFrom?: string | null, publicationIdentities?: Record<string, { provider_app_id: string, provider_subject_id: string, provider_target_id: string, provider_permalink?: string | null }> }} [options]
 * @returns {TransferManifest}
 */
export function transferDatabaseExport(sourcePath, targetPath, { payloadPath = null, withoutJwks = false, deltaFrom = null, publicationIdentities = EPOCH_PUBLICATION_IDENTITIES } = {}) {
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
    epoch: null,
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
    const absent = names.filter(table => !sourceTables.includes(table) && !(withoutJwks && table === 'jwks') && !EPOCH_ADDED_TABLES.includes(table))
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
    for (const table of names.filter(table => !sourceTables.includes(table) && EPOCH_ADDED_TABLES.includes(table))) manifest.tables.push({ table, source_rows: 0 })
    manifest.epoch = transformSocialPublishingEpoch(stage, source, (name, changes) => { manifest.derived[name] = changes }, { publicationIdentities })
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
  const epoch = manifest.epoch
  for (const row of epoch?.scheduled_to_draft ?? []) console.log(`Scheduled ${row.kind} is now a draft: ${row.id} (${row.organization_id}) was due ${row.scheduled_for ?? 'at no recorded time'}`)
  for (const row of epoch?.social_post_facts ?? []) console.log(`Post facts written into its words: ${row.id} [${row.locale}] ${JSON.stringify(row.before)} -> appended ${JSON.stringify(row.appended)}`)
  for (const row of epoch?.calls_to_action ?? []) console.log(`Call to action: ${row.id} ${JSON.stringify(row.before)} -> ${JSON.stringify(row.after)}`)
  for (const row of epoch?.publications ?? []) console.log(`Publication: ${row.post_id} ${row.channel} ${row.origin} ${row.prior_status} -> ${row.state}${row.prior_error ? ` (prior error: ${row.prior_error})` : ''}`)
  for (const row of epoch?.dropped_channel_entries ?? []) console.log(`Not a publication, dropped: ${row.id} ${row.channel} ${row.status}${row.error ? ` (${row.error})` : ''}`)
  for (const row of epoch?.repaired_slugs ?? []) console.log(`Post route allocated: ${row.id} -> /posts/${row.slug}`)
  for (const row of epoch?.social_blocks ?? []) console.log(`Block ${row.id} (document ${row.document_id}) is now social_posts ${JSON.stringify(row.after)}`)
  console.log(`Derived: ${Object.entries(manifest.derived).map(([name, changes]) => `${name}=${changes}`).join(', ') || 'nothing'}`)
  console.log(`Transforms: ${manifest.transforms.filter(transform => transform.changes > 0).map(transform => `${transform.name}=${transform.changes}`).join(', ') || 'no changes'}`)
  for (const [table, rows] of Object.entries(manifest.payload?.left_behind ?? {})) {
    if (rows.changed.length) console.log(`Not carried, changed since the initial export: ${table} ${rows.changed.length}: ${rows.changed.join(' ')}`)
    if (rows.deleted.length) console.log(`Not carried, deleted since the initial export: ${table} ${rows.deleted.length}: ${rows.deleted.join(' ')}`)
  }
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
