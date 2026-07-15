#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareD1SeedFile } from './utils/d1-seed-file.mjs'
import { normalizeNonprofitStatus } from './utils/nonprofit-status.mjs'

const isStdout = process.argv.includes('--stdout')
const isRemote = process.argv.includes('--remote')
const isStaging = process.argv.includes('--staging')
const isPreview = process.argv.includes('--preview')
const manifestArgIndex = process.argv.indexOf('--manifest')
const explicitManifestPath = manifestArgIndex >= 0 ? process.argv[manifestArgIndex + 1] : null
if ([isRemote, isStaging, isPreview].filter(Boolean).length > 1) {
  console.error('Only one of --remote, --staging, or --preview may be provided.')
  process.exit(1)
}

// --remote with no --env targets wrangler's default (top-level) d1_databases entry, which is
// production (krabiclaw-db). This script inserts a fixture user (USER_ID/example.test email)
// directly via raw SQL - it must never run against production. A bare `--remote` previously did
// exactly that and left a placeholder "owner" in prod (org-ncls-blawby) that shadowed the real
// owner in every owner-lookup query until it was manually cleaned up. Staging and preview are
// explicit non-production fixture targets; production seeding isn't supported by this script.
if (isRemote) {
  console.error('--remote alone targets production. Use --staging or --preview instead.')
  process.exit(1)
}

const envFlag = isStaging ? '--env staging' : isPreview ? '--env preview' : '--local'
const remoteFlag = isStaging || isPreview ? '--remote' : ''

const clientImportDir = join(process.cwd(), 'client-imports', 'north-carolina-legal-services')
const clientManifestPath = join(clientImportDir, 'client-manifest.json')
const legacyManifestPath = join(clientImportDir, 'blawby-import.json')
const manifestPath = explicitManifestPath || (existsSync(clientManifestPath) ? clientManifestPath : legacyManifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const ORG_ID = 'org-ncls-blawby'
const USER_ID = 'user-ncls-blawby'
const MEMBER_ID = 'member-ncls-blawby'
const SITE_ID = 'site-ncls-blawby'
const LOCATION_ID = 'loc-ncls-blawby-main'
const SLUG = 'ncls'

function escapeSql(value) {
  return String(value)
    .replace(/[ \t]+(?=\r?$)/gm, whitespace => whitespace.length >= 2 ? '<br>' : '')
    .replace(/'/g, "''")
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escapeSql(value)}'`
}

function sqlJson(value) {
  return sqlValue(JSON.stringify(value ?? null))
}

function values(rows) {
  return rows.join(',\n')
}

const site = manifest.site
const now = 'CURRENT_TIMESTAMP'

const offeringRows = values((manifest.offerings ?? []).map((offering) => `(
  ${sqlValue(offering.id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, NULL,
  ${sqlValue(offering.name)}, ${sqlValue(offering.slug)}, ${sqlValue(offering.label)},
  ${sqlValue(offering.summary)}, ${sqlValue(offering.short_description)}, ${sqlValue(offering.body)},
  ${sqlJson(offering.features ?? [])}, ${sqlJson(offering.faqs ?? [])},
  ${sqlValue(offering.cta_label)}, ${sqlValue(offering.cta_url)},
  ${sqlValue(offering.thumbnail_asset_id)}, ${sqlValue(offering.hero_image_asset_id)}, ${sqlJson(offering.media_asset_ids ?? [])}, ${sqlValue(offering.schema_type || 'LegalService')},
  ${sqlValue(offering.seo_title)}, ${sqlValue(offering.seo_description)}, ${sqlValue(offering.canonical_path || `/services/${offering.slug}`)},
  ${sqlValue(offering.status || 'published')}, ${Number(offering.sort_order ?? 0)}, ${offering.featured ? 1 : 0},
  'react-adapter', ${sqlValue(manifest.source)}, ${now}, ${now}
)`))

const tenantPageRows = values((manifest.tenantPages ?? []).map((page) => `(
  ${sqlValue(page.id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(page.path)}, ${sqlValue(page.title)}, ${sqlValue(page.path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'))},
  ${sqlValue(page.page_type || 'static')}, ${sqlValue(page.summary)}, ${sqlValue(page.body)},
  ${sqlJson(page.components ?? [])}, ${sqlValue(page.cta_label)}, ${sqlValue(page.cta_url)},
  ${sqlValue(page.seo_title)}, ${sqlValue(page.seo_description)}, ${sqlValue(page.canonical_url)}, ${sqlValue(page.robots)},
  ${sqlValue(page.status || 'published')}, ${Number(page.sort_order ?? 0)}, 'react-adapter', ${sqlValue(manifest.source)}, ${now}, ${now}
)`))

const navRows = values((manifest.navigation ?? []).map((item) => `(
  ${sqlValue(item.id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(item.area || 'header')}, ${sqlValue(item.label)}, ${sqlValue(item.url)},
  ${sqlValue(item.item_type || 'internal')}, ${Number(item.sort_order ?? 0)},
  ${sqlValue(item.status || 'active')}, ${sqlJson(item.metadata ?? {})}, ${now}, ${now}
)`))

const redirectRows = values((manifest.redirects ?? []).map((redirect, index) => `(
  ${sqlValue(redirect.id || `redirect_ncls_${index}`)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(redirect.from_path)}, ${sqlValue(redirect.to_path)}, ${Number(redirect.status_code ?? 301)},
  ${sqlValue(redirect.behavior || 'redirect')}, ${sqlValue(redirect.reason)}, ${sqlValue(redirect.source || 'react-adapter')},
  ${now}, ${now}
)`))

const mediaRows = values((manifest.mediaInventory?.files ?? [])
  .filter((asset) => asset.asset_id && asset.public_url)
  .map((asset) => {
    const mimeType = asset.mime_type || 'application/octet-stream'
    const kind = mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' ? 'image' : 'file'
    const provider = asset.storage_provider || (asset.public_url?.includes('media.krabiclaw.com') ? 'cloudflare_r2' : asset.public_url?.includes('images.krabiclaw.com') ? 'cloudflare_images' : 'external_url')
    const category = asset.role === 'brand_logo' ? 'logo' : 'other'
    return `(
  ${sqlValue(asset.asset_id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, NULL,
  ${sqlValue(kind)},
  ${sqlValue(provider)},
  'uploaded', NULL, ${sqlValue(asset.r2_key)}, NULL,
  ${sqlValue(asset.public_url)}, NULL, ${sqlValue(mimeType)},
  ${sqlValue(asset.file_name || asset.source_name || asset.source_path || asset.asset_id)},
  ${sqlValue(asset.file_size ?? asset.size_bytes)}, ${sqlValue(asset.width)}, ${sqlValue(asset.height)}, NULL, ${sqlValue(asset.role || asset.file_name || 'Legal file')},
  ${sqlValue(category)}, 'active', NULL, ${now}, ${now}, NULL
)`
  }))

const blogRows = values((manifest.articles ?? []).map((article, index) => `(
  ${sqlValue(`blog_ncls_${article.slug}`)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(article.title)}, ${sqlValue(article.slug)}, ${sqlValue(article.body || article.excerpt || '')},
  ${sqlValue(article.excerpt)}, ${sqlValue(article.category || 'Legal Services')}, ${sqlJson(article.tags ?? [])}, 'published',
  ${sqlValue(USER_ID)}, ${sqlValue(article.featured_image_asset_id)},
  ${sqlValue(article.published_at || new Date(Date.UTC(2026, 0, 1, 12) + index * 86400000).toISOString())},
  ${sqlValue(article.published_at || new Date(Date.UTC(2026, 0, 1, 12) + index * 86400000).toISOString())}, ${sqlValue(article.updated_at || article.published_at || new Date(Date.UTC(2026, 0, 1, 12) + index * 86400000).toISOString())}, ${sqlValue(article.seo_description)}, ${sqlValue(article.seo_keywords)},
  ${sqlValue(article.canonical_url || `/article/${article.slug}`)}, NULL
)`))

const qaRows = values((manifest.siteQa ?? []).map((qa) => `(
  ${sqlValue(qa.id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, NULL, ${sqlValue(qa.page_path)}, NULL,
  ${sqlValue(qa.question)}, NULL, NULL, ${sqlValue(qa.answer)}, ${sqlValue(site.brand_name)}, NULL,
  1, 0, ${sqlValue(qa.source || 'import')}, ${sqlValue(qa.status || 'published')}, ${Number(qa.sort_order ?? 0)}, ${now}, ${now}
)`))

const reviewRows = values((manifest.reviews ?? []).map((review) => `(
  ${sqlValue(review.id)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, NULL,
  NULL, NULL, NULL, NULL, NULL, NULL,
  ${sqlValue(review.author_name)}, ${sqlValue(review.reviewer_photo_url)}, ${Number(review.rating ?? 5)},
  ${sqlValue(review.title)}, ${sqlValue(review.content)}, NULL, NULL, NULL, NULL, 0,
  ${sqlValue(review.status || 'approved')}, 'owner_entered', ${sqlValue(USER_ID)},
  ${sqlValue(review.collection_method || 'migration')}, ${sqlValue(review.original_review_date)},
  ${sqlValue(review.original_reference)}, 1, NULL, NULL, ${now}, ${now}
)`))

const compliance = manifest.compliance ?? {}
const nonprofitStatus = normalizeNonprofitStatus(compliance.nonprofit_status ?? null)
if (!nonprofitStatus.valid) {
  console.error(`[seed:ncls-blawby] compliance.nonprofit_status "${compliance.nonprofit_status}" is not a recognized schema.org nonprofit enumeration value. Fix the source manifest instead of seeding an invalid value.`)
  process.exit(1)
}
const consultation = manifest.consultation ?? {}
const mediaInsertSql = mediaRows ? `INSERT INTO media_assets (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url,
  mime_type, file_name, file_size, width, height, duration, alt_text,
  category, status, created_by_user_id, created_at, updated_at, delete_pending_at
) VALUES
${mediaRows};` : '-- No approved media/file rows in manifest.'

const sql = `-- NCLS Blawby local seed
-- Generated from ${manifestPath}
-- Preview at: http://ncls.localhost:3000

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active');

DELETE FROM sites WHERE id = ${sqlValue(SITE_ID)} OR subdomain = ${sqlValue(SLUG)};
DELETE FROM organization WHERE id = ${sqlValue(ORG_ID)};
DELETE FROM site_domains WHERE domain IN ('ncls.localhost', 'ncls.krabiclaw.com', 'northcarolinalegalservices.org');
DELETE FROM user WHERE id = ${sqlValue(USER_ID)};

INSERT INTO user (id, name, email, emailVerified, image, role, createdAt, updatedAt)
VALUES (${sqlValue(USER_ID)}, 'Rich Gittings', 'ncls-blawby@example.test', 1, ${sqlValue(site.author_image_url)}, 'admin', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(ORG_ID)}, ${sqlValue(site.brand_name)}, 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlValue(MEMBER_ID)}, ${sqlValue(ORG_ID)}, ${sqlValue(USER_ID)}, 'owner', unixepoch());

INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain, public_url,
  brand_name, brand_description, contact_email, contact_phone,
  source_locale, default_currency, status, plan, onboarding_status,
  url_structure, vertical, content_source, media_source, settings, created_at, updated_at
) VALUES (
  ${sqlValue(SITE_ID)}, ${sqlValue(ORG_ID)}, 'blawby-theme-v1', 'blawby',
  ${sqlValue(SLUG)}, ${sqlValue(SLUG)}, 'https://ncls.krabiclaw.com',
  ${sqlValue(site.brand_name)}, ${sqlValue(site.brand_description)},
  ${sqlValue(site.email)}, ${sqlValue(site.phone)},
  'en', 'USD', 'active', 'managed', 'active',
  'brand_pages', 'service', 'client_supplied', 'client_photos',
  ${sqlJson({ favicon_url: site.favicon_url || null })}, ${now}, ${now}
);

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status, activated_at, created_at, updated_at)
VALUES
  ('domain-ncls-localhost', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'ncls.localhost', 'subdomain', 'secondary', 'active', 'valid', ${now}, ${now}, ${now}),
  ('domain-ncls-prod-subdomain', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'ncls.krabiclaw.com', 'subdomain', 'canonical', 'active', 'valid', ${now}, ${now}, ${now});

INSERT INTO business_locations (
  id, organization_id, site_id, slug, title, city, address, phone, email,
  website_url, maps_url, categories, is_primary, status, description, timezone,
  created_at, updated_at
) VALUES (
  ${sqlValue(LOCATION_ID)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'main',
  ${sqlValue(site.brand_name)}, ${sqlValue(site.service_area?.locality || 'North Carolina')},
  NULL, ${sqlValue(site.phone)}, ${sqlValue(site.email)}, ${sqlValue(`https://${site.domain}`)}, NULL,
  ${sqlJson(['LegalService', 'ProfessionalService'])}, 1, 'active',
  ${sqlValue(site.brand_description)}, 'America/New_York', ${now}, ${now}
);

UPDATE sites SET primary_location_id = ${sqlValue(LOCATION_ID)} WHERE id = ${sqlValue(SITE_ID)};

INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES ('locale-ncls-en', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'en', 'English', 1, 'published', 1);

${mediaInsertSql}

UPDATE sites SET logo_asset_id = ${sqlValue(site.logo_asset_id)} WHERE id = ${sqlValue(SITE_ID)};

INSERT INTO offerings (
  id, organization_id, site_id, location_id, name, slug, label, summary,
  short_description, body, features, faqs, cta_label, cta_url,
  thumbnail_asset_id, hero_image_asset_id, media_asset_ids, schema_type,
  seo_title, seo_description, canonical_path, status, sort_order, featured,
  source, source_ref, created_at, updated_at
) VALUES
${offeringRows};

INSERT INTO tenant_pages (
  id, organization_id, site_id, path, title, slug, page_type, summary, body,
  components_json, cta_label, cta_url, seo_title, seo_description, canonical_url,
  robots, status, sort_order, source, source_ref, created_at, updated_at
) VALUES
${tenantPageRows};

INSERT INTO tenant_compliance (
  id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
  registration_number, service_area, service_area_type, disclaimer, footer_disclaimer, document_asset_ids,
  founder_name, founding_date, same_as, contact_points, address_visibility,
  metadata_json, created_at, updated_at
) VALUES (
  ${sqlValue(compliance.id || 'compliance_ncls')}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(compliance.entity_name)}, ${sqlValue(compliance.dba_name)}, ${sqlValue(compliance.entity_type)},
  ${sqlValue(nonprofitStatus.value)}, ${sqlValue(compliance.registration_number)}, ${sqlValue(compliance.service_area)},
  ${sqlValue(compliance.service_area_type)}, ${sqlValue(compliance.disclaimer)}, ${sqlValue(compliance.footer_disclaimer)},
  ${sqlJson(compliance.document_asset_ids ?? [])},
  ${sqlValue(compliance.founder_name)}, ${sqlValue(compliance.founding_date)},
  ${sqlJson(compliance.same_as ?? [])}, ${sqlJson(compliance.contact_points ?? [])},
  ${sqlValue(compliance.address_visibility === 'visible' ? 'visible' : 'hidden')},
  ${sqlJson(compliance.metadata ?? {})}, ${now}, ${now}
);

INSERT INTO site_consultation_settings (
  id, organization_id, site_id, mode, cta_label, external_url, schedule_path,
  confirmation_path, tracking_enabled, metadata_json, created_at, updated_at
) VALUES (
  ${sqlValue(consultation.id || 'consultation_ncls')}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(consultation.mode || 'external_url')}, ${sqlValue(consultation.cta_label || 'Schedule a consultation')},
  ${sqlValue(consultation.external_url)}, ${sqlValue(consultation.schedule_path || '/schedule')},
  ${sqlValue(consultation.confirmation_path || '/contact/confirmed')},
  ${consultation.tracking_enabled === false ? 0 : 1},
  ${sqlJson({
    ...(consultation.metadata ?? {}),
    source: manifest.source,
    analyticsBridge: manifest.analyticsBridge ?? null,
    legacy_source_calendly_url_ignored: consultation.legacy_source_calendly_url_ignored ?? null,
  })}, ${now}, ${now}
);

INSERT INTO site_theme_tokens (id, organization_id, site_id, template_slug, tokens_json, status, created_at, updated_at)
VALUES ('theme-ncls-blawby', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'blawby', ${sqlJson(manifest.themeTokens ?? {})}, 'active', ${now}, ${now});

INSERT INTO tenant_navigation_items (
  id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json, created_at, updated_at
) VALUES
${navRows};

${redirectRows ? `INSERT INTO tenant_redirects (
  id, organization_id, site_id, from_path, to_path, status_code, behavior,
  reason, source, created_at, updated_at
) VALUES
${redirectRows};` : '-- No tenant redirects in manifest.'}

${qaRows ? `INSERT INTO location_qa (
  id, organization_id, site_id, location_id, page_path, google_question_id, question,
  question_author, question_date, answer, answer_author, answer_date,
  is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at
) VALUES
${qaRows};` : '-- No site Q&A rows in manifest.'}

${reviewRows ? `INSERT INTO reviews (
  id, organization_id, site_id, location_id, customer_id, booking_id, booking_type,
  review_request_id, user_id, menu_item_slug, author_name, reviewer_photo_url, rating,
  title, content, google_review_id, owner_reply, owner_reply_at, photo_urls, helpful_count,
  status, source, entered_by_user_id, collection_method, original_review_date,
  original_reference, publication_authorized, ip_hash, user_agent, created_at, updated_at
) VALUES
${reviewRows};` : '-- No owner-entered review rows in manifest.'}

INSERT INTO blog_posts (
  id, organization_id, site_id, title, slug, body, excerpt, category, tags_json, status,
  author_id, featured_image_asset_id, published_at, created_at, updated_at,
  seo_description, seo_keywords, canonical_url, robots
) VALUES
${blogRows};
`

if (isStdout) {
  process.stdout.write(sql)
  process.exit(0)
}

if (isRemote) {
  console.error('NCLS Blawby fixture seed cannot target production. Use --staging or --preview.')
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-ncls-blawby-'))
const sqlPath = join(dir, 'ncls-blawby.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  const preparedSeed = await prepareD1SeedFile(sqlPath)
  if (preparedSeed.splitCount) {
    console.log(`[seed:ncls-blawby] Split ${preparedSeed.splitCount} oversized INSERT statement chunk(s) for D1 execution.`)
  }
  try {
    const cmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --file "${preparedSeed.path}"`.trim()
    console.log(`[seed:ncls-blawby] Applying: ${cmd}`)
    execSync(cmd, { stdio: 'inherit' })
  } finally {
    await preparedSeed.cleanup()
  }
  console.log('[seed:ncls-blawby] Done. Preview at http://ncls.localhost:3000')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
