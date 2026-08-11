#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORGANIZATION_ID = 'org-ncls-blawby'
const USER_ID = 'user-ncls-blawby'
const SITE_ID = 'site-ncls-blawby'
const LOCATION_ID = 'loc-ncls-blawby-main'
const SEEDED_AT = '2026-08-11T00:00:00.000Z'

interface FixtureBlock {
  type: 'hero' | 'markdown' | 'offering_grid' | 'contact_cta'
  data: Record<string, unknown>
}

interface FixturePage {
  key: string
  path: string
  title: string
  summary: string
  pageType: 'system' | 'recipe'
  recipe: string
  blocks: FixtureBlock[]
}

const pages: FixturePage[] = [
  {
    key: 'home',
    path: '/',
    title: "Access to Justice for All. North Carolina's affordable legal services.",
    summary: 'Affordable legal services for people, families, and small businesses across North Carolina.',
    pageType: 'system',
    recipe: 'home',
    blocks: [
      {
        type: 'hero',
        data: {
          section: 'hero',
          title: "Access to Justice for All.\nNorth Carolina's affordable\nlegal services.",
          description: 'Practical legal help with transparent pricing and a clear path forward.',
          cta_label: 'Request a Legal Consultation',
          cta_url: '/contact',
        },
      },
      {
        type: 'offering_grid',
        data: {
          section: 'services',
          title: 'Our',
          accent: 'Services',
          description: 'Focused legal guidance for common needs.',
          source: 'site_offerings',
          offering_ids: ['offering-ncls-consultation'],
        },
      },
      {
        type: 'contact_cta',
        data: {
          section: 'consultation',
          title: 'Talk with our team',
          description: 'Tell us what you need and we will help identify the next step.',
          label: 'Request a consultation',
          url: '/contact',
        },
      },
    ],
  },
  {
    key: 'about',
    path: '/about',
    title: 'About Us',
    summary: 'Accessible legal guidance for North Carolina communities.',
    pageType: 'system',
    recipe: 'about',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'About Us', description: 'Legal support built around clarity, access, and practical outcomes.' } },
      { type: 'markdown', data: { markdown: 'We help North Carolina clients understand their options and move forward with confidence.' } },
    ],
  },
  {
    key: 'contact',
    path: '/contact',
    title: 'Contact Us',
    summary: 'Contact North Carolina Legal Services.',
    pageType: 'system',
    recipe: 'contact',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Contact Us', description: 'Start with a short description of the legal help you need.' } },
      { type: 'contact_cta', data: { section: 'contact', title: 'Get in touch', description: 'Send a message and our team will follow up.', label: 'Request help', url: '/contact' } },
    ],
  },
  {
    key: 'pricing',
    path: '/pricing',
    title: 'Pricing',
    summary: 'Simple, transparent, and affordable legal pricing.',
    pageType: 'recipe',
    recipe: 'pricing',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Pricing', description: 'Simple, transparent, and affordable legal pricing.' } },
      { type: 'markdown', data: { markdown: 'Pricing is explained before work begins so clients can make an informed decision.' } },
    ],
  },
  {
    key: 'services',
    path: '/services',
    title: 'Our Services',
    summary: 'Legal services for individuals, families, and small businesses.',
    pageType: 'recipe',
    recipe: 'services',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Our Services', description: 'Focused legal guidance for common needs.' } },
      { type: 'offering_grid', data: { section: 'services', title: 'Legal Services', source: 'site_offerings', offering_ids: ['offering-ncls-consultation'] } },
    ],
  },
]

function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replace(/'/g, "''")}'`
}

function sqlJson(value: unknown): string {
  return sqlValue(JSON.stringify(value))
}

function renderPage(page: FixturePage): string {
  const pageId = `page-ncls-ci-${page.key}`
  const variantId = `variant-ncls-ci-${page.key}-en`
  const documentId = `document-ncls-ci-${page.key}-en`
  const revisionId = `revision-ncls-ci-${page.key}-en`
  const blocks = page.blocks.map((block, position) => ({
    id: `block-ncls-ci-${page.key}-${position}`,
    parent_block_id: null,
    type: block.type,
    position,
    level: null,
    data: block.data,
    updated_at: SEEDED_AT,
  }))
  const metadata = {
    locale: 'en',
    path: page.path,
    title: page.title,
    summary: page.summary,
    seoTitle: `${page.title} | North Carolina Legal Services`,
    seoDescription: page.summary,
    canonicalUrl: null,
    robots: 'noindex,follow',
    pageType: page.pageType,
    recipe: page.recipe,
  }
  const snapshot = { schemaVersion: 1, metadata, blocks }
  const body = blocks
    .filter(block => block.type === 'markdown')
    .map(block => String(block.data.markdown ?? ''))
    .join('\n\n')
  const blockRows = blocks.map(block => `INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
VALUES
  (${sqlValue(block.id)}, ${sqlValue(documentId)}, NULL, ${sqlValue(block.type)}, ${block.position}, NULL, ${sqlJson(block.data)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});`).join('\n')

  return `INSERT INTO tenant_pages
  (id, organization_id, site_id, path, title, slug, page_type, recipe, summary, seo_title,
   seo_description, robots, status, sort_order, source, created_at, updated_at, updated_by)
VALUES
  (${sqlValue(pageId)}, ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, ${sqlValue(page.path)},
   ${sqlValue(page.title)}, ${sqlValue(page.key)}, ${sqlValue(page.pageType)}, ${sqlValue(page.recipe)},
   ${sqlValue(page.summary)}, ${sqlValue(metadata.seoTitle)}, ${sqlValue(page.summary)}, 'noindex,follow',
   'published', 0, 'ci_fixture', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO content_documents
  (id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at)
VALUES
  (${sqlValue(documentId)}, 'tenant_page', ${sqlValue(variantId)}, NULL, NULL, ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO tenant_page_variants
  (id, organization_id, site_id, page_id, locale, draft_document_id, published_revision_id,
   ever_published, published_path, draft_path, title, summary, seo_title, seo_description,
   canonical_url, robots, status, created_at, updated_at, updated_by)
VALUES
  (${sqlValue(variantId)}, ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, ${sqlValue(pageId)}, 'en',
   ${sqlValue(documentId)}, NULL, 1, ${sqlValue(page.path)}, ${sqlValue(page.path)}, ${sqlValue(page.title)},
   ${sqlValue(page.summary)}, ${sqlValue(metadata.seoTitle)}, ${sqlValue(page.summary)}, NULL, 'noindex,follow',
   'published', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

${blockRows}

INSERT INTO content_revisions
  (id, document_id, snapshot_json, body_markdown, created_by, label, created_at, published_at)
VALUES
  (${sqlValue(revisionId)}, ${sqlValue(documentId)}, ${sqlJson(snapshot)}, ${sqlValue(body)},
   ${sqlValue(USER_ID)}, 'Blawby CI fixture', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

UPDATE content_documents
   SET draft_revision_id = ${sqlValue(revisionId)}, published_revision_id = ${sqlValue(revisionId)}
 WHERE id = ${sqlValue(documentId)};

UPDATE tenant_page_variants
   SET published_revision_id = ${sqlValue(revisionId)}
 WHERE id = ${sqlValue(variantId)};`
}

export function renderBlawbyCiFixtureSql(): string {
  return `-- Deterministic Blawby fixture for preview release checks.
PRAGMA foreign_keys = ON;

DELETE FROM content_blocks
 WHERE document_id IN (
   SELECT id FROM content_documents
    WHERE (owner_type = 'tenant_page' AND (
             owner_id IN (SELECT id FROM tenant_page_variants WHERE site_id = ${sqlValue(SITE_ID)})
             OR owner_id LIKE 'variant-ncls-ci-%'
             OR owner_id LIKE '%site-ncls-blawby%'
          ))
       OR (owner_type = 'tenant_blog' AND owner_id LIKE 'blog_ncls_%')
 );
DELETE FROM content_revisions
 WHERE document_id IN (
   SELECT id FROM content_documents
    WHERE (owner_type = 'tenant_page' AND (
             owner_id IN (SELECT id FROM tenant_page_variants WHERE site_id = ${sqlValue(SITE_ID)})
             OR owner_id LIKE 'variant-ncls-ci-%'
             OR owner_id LIKE '%site-ncls-blawby%'
          ))
       OR (owner_type = 'tenant_blog' AND owner_id LIKE 'blog_ncls_%')
 );
DELETE FROM content_documents
 WHERE (owner_type = 'tenant_page' AND (
          owner_id IN (SELECT id FROM tenant_page_variants WHERE site_id = ${sqlValue(SITE_ID)})
          OR owner_id LIKE 'variant-ncls-ci-%'
          OR owner_id LIKE '%site-ncls-blawby%'
       ))
    OR (owner_type = 'tenant_blog' AND owner_id LIKE 'blog_ncls_%');
DELETE FROM tenant_page_variants WHERE site_id = ${sqlValue(SITE_ID)} OR id LIKE 'variant-ncls-ci-%';
DELETE FROM tenant_pages WHERE site_id = ${sqlValue(SITE_ID)} OR id LIKE 'page-ncls-ci-%';
DELETE FROM tenant_navigation_items WHERE site_id = ${sqlValue(SITE_ID)} OR id LIKE 'nav-ncls-ci-%';
DELETE FROM offerings WHERE site_id = ${sqlValue(SITE_ID)} OR id = 'offering-ncls-consultation';
DELETE FROM site_theme_tokens WHERE site_id = ${sqlValue(SITE_ID)} OR id = 'theme-ncls-ci';
DELETE FROM site_consultation_settings WHERE site_id = ${sqlValue(SITE_ID)} OR id = 'consultation-ncls-ci';
DELETE FROM tenant_compliance WHERE site_id = ${sqlValue(SITE_ID)} OR id = 'compliance-ncls-ci';
DELETE FROM site_domains WHERE site_id = ${sqlValue(SITE_ID)} OR id LIKE 'domain-ncls-ci-%';
DELETE FROM site_locales WHERE site_id = ${sqlValue(SITE_ID)} OR id = 'locale-ncls-ci-en';
UPDATE sites SET primary_location_id = NULL WHERE id = ${sqlValue(SITE_ID)} OR subdomain = 'ncls';
DELETE FROM business_locations WHERE site_id = ${sqlValue(SITE_ID)} OR id = ${sqlValue(LOCATION_ID)};
DELETE FROM member WHERE organizationId = ${sqlValue(ORGANIZATION_ID)} OR id = 'member-ncls-blawby';
DELETE FROM sites WHERE id = ${sqlValue(SITE_ID)} OR subdomain = 'ncls';
DELETE FROM organization WHERE id = ${sqlValue(ORGANIZATION_ID)} OR slug = 'north-carolina-legal-services';
DELETE FROM user WHERE id = ${sqlValue(USER_ID)} OR email = 'ncls-blawby@example.test';

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active');

INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlValue(USER_ID)}, 'NCLS CI Owner', 'ncls-blawby@example.test', 1, 'user', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(ORGANIZATION_ID)}, 'North Carolina Legal Services', 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-ncls-blawby', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(USER_ID)}, 'owner', unixepoch());

INSERT INTO sites
  (id, organization_id, theme_id, theme, slug, subdomain, public_url, brand_name, brand_description,
   contact_email, contact_phone, source_locale, default_currency, status, plan, onboarding_status,
   vertical, content_source, media_source, settings, created_at, updated_at, updated_by)
VALUES
  (${sqlValue(SITE_ID)}, ${sqlValue(ORGANIZATION_ID)}, 'blawby-theme-v1', 'blawby', 'ncls', 'ncls',
   'https://ncls.krabiclaw.com', 'North Carolina Legal Services',
   'Affordable legal services for people, families, and small businesses across North Carolina.',
   'contact@northcarolinalegalservices.org', '+1-919-555-0100', 'en', 'USD', 'active', 'managed',
   'active', 'service', 'client_supplied', 'client_photos', '{}', ${sqlValue(SEEDED_AT)},
   ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO business_locations
  (id, organization_id, site_id, slug, title, city, phone, email, categories, is_primary,
   status, description, timezone, created_at, updated_at)
VALUES
  (${sqlValue(LOCATION_ID)}, ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'main',
   'North Carolina Legal Services', 'North Carolina', '+1-919-555-0100',
   'contact@northcarolinalegalservices.org', '["LegalService","ProfessionalService"]', 1,
   'active', 'Affordable legal services across North Carolina.', 'America/New_York',
   ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

UPDATE sites SET primary_location_id = ${sqlValue(LOCATION_ID)} WHERE id = ${sqlValue(SITE_ID)};

INSERT INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled, created_at, updated_at)
VALUES
  ('locale-ncls-ci-en', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'en', 'English', 1,
   'published', 1, ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO site_domains
  (id, organization_id, site_id, domain, type, role, status, dns_status, created_at, updated_at)
VALUES
  ('domain-ncls-ci-local', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'ncls.localhost',
   'subdomain', 'secondary', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}),
  ('domain-ncls-ci-public', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'ncls.krabiclaw.com',
   'subdomain', 'canonical', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO tenant_compliance
  (id, organization_id, site_id, entity_name, entity_type, service_area, service_area_type,
   disclaimer, footer_disclaimer, address_visibility, metadata_json, created_at, updated_at, updated_by)
VALUES
  ('compliance-ncls-ci', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)},
   'North Carolina Legal Services', 'LegalService', 'North Carolina', 'State',
   'Information on this site is not legal advice.', 'Submitting a request does not create an attorney-client relationship.',
   'hidden', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO site_consultation_settings
  (id, organization_id, site_id, mode, cta_label, external_url, schedule_path,
   confirmation_path, tracking_enabled, metadata_json, created_at, updated_at, updated_by)
VALUES
  ('consultation-ncls-ci', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'external_url',
   'Request a Legal Consultation', 'https://example.test/ncls-consultation', '/schedule',
   '/contact/confirmed', 1, '{"contact_form_enabled":true}', ${sqlValue(SEEDED_AT)},
   ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO site_theme_tokens
  (id, organization_id, site_id, template_slug, tokens_json, status, created_at, updated_at, updated_by)
VALUES
  ('theme-ncls-ci', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'blawby',
   '{"bg":"#fbfaf7","surface":"#ffffff","primary":"#25356c","accent":"#c19855","ink":"#162033"}',
   'active', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO tenant_navigation_items
  (id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json,
   created_at, updated_at, updated_by)
VALUES
  ('nav-ncls-ci-home', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'header', 'Home', '/', 'internal', 0, 'active', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)}),
  ('nav-ncls-ci-services', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'header', 'Services', '/services', 'internal', 1, 'active', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)}),
  ('nav-ncls-ci-pricing', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'header', 'Pricing', '/pricing', 'internal', 2, 'active', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)}),
  ('nav-ncls-ci-about', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'header', 'About', '/about', 'internal', 3, 'active', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)}),
  ('nav-ncls-ci-contact', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'header', 'Contact', '/contact', 'internal', 4, 'active', '{}', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

INSERT INTO offerings
  (id, organization_id, site_id, name, slug, label, summary, short_description, body,
   features, faqs, cta_label, cta_url, media_asset_ids, schema_type, seo_title, seo_description,
   canonical_path, status, sort_order, featured, source, source_ref, created_at, updated_at, updated_by)
VALUES
  ('offering-ncls-consultation', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)},
   'Legal Consultation', 'legal-consultation', 'Legal Consultation',
   'A focused conversation about your legal needs and next steps.',
   'Understand your options and decide what to do next.',
   'Bring the key facts and documents so the consultation can stay focused.',
   '[]', '[]', 'Request a consultation', '/contact', '[]', 'LegalService',
   'Legal Consultation | North Carolina Legal Services',
   'Affordable legal consultation for North Carolina clients.', '/services/legal-consultation',
   'published', 0, 1, 'ci_fixture', 'blawby-release-check', ${sqlValue(SEEDED_AT)},
   ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

${pages.map(renderPage).join('\n\n')}
`
}

function runCli() {
  const sql = renderBlawbyCiFixtureSql()
  if (process.argv.includes('--stdout')) {
    process.stdout.write(sql)
    return
  }
  if (!process.argv.includes('--local')) {
    throw new Error('Use --stdout for CI composition or --local for the local D1 fixture.')
  }

  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-blawby-ci-seed-'))
  const sqlPath = join(directory, 'blawby-ci.sql')
  try {
    writeFileSync(sqlPath, sql, 'utf8')
    execFileSync('yarn', ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', sqlPath], { stdio: 'inherit' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
