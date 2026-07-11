#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const isStdout = process.argv.includes('--stdout')
const isRemote = process.argv.includes('--remote')
const isStaging = process.argv.includes('--staging')
const isPreview = process.argv.includes('--preview')
const envFlag = isStaging ? '--env staging' : isPreview ? '--env preview' : isRemote ? '' : '--local'
const remoteFlag = isRemote || isStaging || isPreview ? '--remote' : ''

if ([isRemote, isStaging, isPreview].filter(Boolean).length > 1) {
  console.error('Only one of --remote, --staging, or --preview may be provided.')
  process.exit(1)
}

const clientImportDir = join(process.cwd(), 'client-imports', 'north-carolina-legal-services')
const clientManifestPath = join(clientImportDir, 'client-manifest.json')
const legacyManifestPath = join(clientImportDir, 'blawby-import.json')
const manifestPath = existsSync(clientManifestPath) ? clientManifestPath : legacyManifestPath
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const ORG_ID = 'org-ncls-blawby'
const USER_ID = 'user-ncls-blawby'
const MEMBER_ID = 'member-ncls-blawby'
const SITE_ID = 'site-ncls-blawby'
const LOCATION_ID = 'loc-ncls-blawby-main'
const SLUG = 'ncls'

function escapeSql(value) {
  return String(value).replace(/'/g, "''")
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
  NULL, NULL, ${sqlJson([])}, ${sqlValue(offering.schema_type || 'LegalService')},
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
  NULL, NULL, NULL, NULL, ${sqlValue(asset.role || asset.file_name || 'Legal file')},
  ${sqlValue(category)}, 'active', NULL, ${now}, ${now}, NULL
)`
  }))

const blogRows = values((manifest.articles ?? []).map((article, index) => `(
  ${sqlValue(`blog_ncls_${article.slug}`)}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(article.title)}, ${sqlValue(article.slug)}, ${sqlValue(article.body || article.excerpt || '')},
  ${sqlValue(article.excerpt)}, ${sqlValue(article.category || 'Legal Services')}, 'published',
  ${sqlValue(USER_ID)}, NULL,
  ${sqlValue(new Date(Date.UTC(2026, 0, 1, 12) + index * 86400000).toISOString())},
  ${now}, ${now}, ${sqlValue(article.seo_description)}, ${sqlValue(article.seo_keywords)},
  ${sqlValue(article.canonical_url || `/article/${article.slug}`)}, NULL
)`))

const compliance = manifest.compliance ?? {}
const consultation = manifest.consultation ?? {}

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

INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlValue(USER_ID)}, 'NCLS Blawby Owner', 'ncls-blawby@example.test', 1, 'admin', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(ORG_ID)}, ${sqlValue(site.brand_name)}, 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlValue(MEMBER_ID)}, ${sqlValue(ORG_ID)}, ${sqlValue(USER_ID)}, 'owner', unixepoch());

INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain, public_url,
  brand_name, brand_description, contact_email, contact_phone,
  source_locale, default_currency, status, plan, onboarding_status,
  url_structure, vertical, content_source, media_source, created_at, updated_at
) VALUES (
  ${sqlValue(SITE_ID)}, ${sqlValue(ORG_ID)}, 'blawby-theme-v1', 'blawby',
  ${sqlValue(SLUG)}, ${sqlValue(SLUG)}, 'http://ncls.localhost:3000',
  ${sqlValue(site.brand_name)}, ${sqlValue(site.brand_description)},
  ${sqlValue(site.email)}, ${sqlValue(site.phone)},
  'en', 'USD', 'active', 'managed', 'active',
  'brand_pages', 'service', 'client_supplied', 'client_photos', ${now}, ${now}
);

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status, activated_at, created_at, updated_at)
VALUES
  ('domain-ncls-localhost', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'ncls.localhost', 'subdomain', 'canonical', 'active', 'valid', ${now}, ${now}, ${now}),
  ('domain-ncls-prod-subdomain', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'ncls.krabiclaw.com', 'subdomain', 'secondary', 'active', 'valid', ${now}, ${now}, ${now});

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

${offeringRows ? `INSERT INTO offerings (
  id, organization_id, site_id, location_id, name, slug, label, summary,
  short_description, body, features, faqs, cta_label, cta_url,
  thumbnail_asset_id, hero_image_asset_id, media_asset_ids, schema_type,
  seo_title, seo_description, canonical_path, status, sort_order, featured,
  source, source_ref, created_at, updated_at
) VALUES
${offeringRows};` : '-- No offering rows in manifest.'}

${tenantPageRows ? `INSERT INTO tenant_pages (
  id, organization_id, site_id, path, title, slug, page_type, summary, body,
  components_json, cta_label, cta_url, seo_title, seo_description, canonical_url,
  robots, status, sort_order, source, source_ref, created_at, updated_at
) VALUES
${tenantPageRows};` : '-- No tenant page rows in manifest.'}

INSERT INTO tenant_compliance (
  id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
  registration_number, service_area, disclaimer, footer_disclaimer, document_asset_ids,
  metadata_json, created_at, updated_at
) VALUES (
  ${sqlValue(compliance.id || 'compliance_ncls')}, ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)},
  ${sqlValue(compliance.entity_name)}, ${sqlValue(compliance.dba_name)}, ${sqlValue(compliance.entity_type)},
  ${sqlValue(compliance.nonprofit_status)}, ${sqlValue(compliance.registration_number)}, ${sqlValue(compliance.service_area)},
  ${sqlValue(compliance.disclaimer)}, ${sqlValue(compliance.footer_disclaimer)},
  ${sqlJson(compliance.document_asset_ids ?? [])}, ${sqlJson(compliance.metadata ?? {})}, ${now}, ${now}
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
  ${sqlJson({ source: manifest.source, analyticsBridge: manifest.analyticsBridge ?? null })}, ${now}, ${now}
);

INSERT INTO site_theme_tokens (id, organization_id, site_id, template_slug, tokens_json, status, created_at, updated_at)
VALUES ('theme-ncls-blawby', ${sqlValue(ORG_ID)}, ${sqlValue(SITE_ID)}, 'blawby', ${sqlJson(manifest.themeTokens ?? {})}, 'active', ${now}, ${now});

${navRows ? `INSERT INTO tenant_navigation_items (
  id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json, created_at, updated_at
) VALUES
${navRows};` : '-- No navigation rows in manifest.'}

${mediaRows ? `INSERT INTO media_assets (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url,
  mime_type, file_name, file_size, width, height, duration, alt_text,
  category, status, created_by_user_id, created_at, updated_at, delete_pending_at
) VALUES
${mediaRows};` : '-- No approved media/file rows in manifest.'}

${blogRows ? `INSERT INTO blog_posts (
  id, organization_id, site_id, title, slug, body, excerpt, category, status,
  author_id, featured_image_asset_id, published_at, created_at, updated_at,
  seo_description, seo_keywords, canonical_url, robots
) VALUES
${blogRows};` : '-- No blog post rows in manifest.'}
`

if (isStdout) {
  process.stdout.write(sql)
  process.exit(0)
}

if (isRemote || isStaging) {
  console.error('NCLS Blawby seed is limited to local and preview evidence. Production/staging cutover is out of scope.')
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-ncls-blawby-'))
const sqlPath = join(dir, 'ncls-blawby.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  const cmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --file "${sqlPath}"`.trim()
  console.log(`[seed:ncls-blawby] Applying: ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
  console.log('[seed:ncls-blawby] Done. Preview at http://ncls.localhost:3000')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
