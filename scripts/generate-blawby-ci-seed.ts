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
  type: 'hero' | 'markdown' | 'heading' | 'offering_grid' | 'contact_cta' | 'feature_grid' | 'donation_choices' | 'callout' | 'faq' | 'testimonial_grid'
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
        type: 'feature_grid',
        data: {
          section: 'approach',
          title: 'How we help',
          accent: 'with clarity',
          features: [
            { name: 'Understand your options', desc: 'Clear explanations for the decisions ahead.' },
            { name: 'Plan the next step', desc: 'Practical guidance for moving forward.' },
          ],
        },
      },
      { type: 'faq', data: { section: 'qa', title: 'Frequently asked questions', source: 'page_qa' } },
      { type: 'testimonial_grid', data: { section: 'reviews', source: 'site_reviews' } },
      { type: 'feature_grid', data: { section: 'articles', source: 'site_posts', limit: 3 } },
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
    title: 'Affordable, for everyone',
    summary: 'Simple, transparent, and affordable legal pricing.',
    pageType: 'recipe',
    recipe: 'pricing',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Affordable, for everyone', description: 'Simple, transparent, and affordable legal pricing.' } },
      {
        type: 'feature_grid',
        data: {
          section: 'pricing',
          calculator: {
            rows: [[1, 39900, 63840, 63840]],
            note: 'This calculator provides an estimate. Final rate determination requires verification of income.',
          },
        },
      },
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
      { type: 'offering_grid', data: { section: 'services', title: 'Our Services', source: 'site_offerings', offering_ids: ['offering-ncls-consultation'] } },
    ],
  },
  {
    key: 'schedule',
    path: '/schedule',
    title: 'Request a Legal Consultation',
    summary: 'Request a focused conversation about your legal needs and next steps.',
    pageType: 'recipe',
    recipe: 'schedule',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Request a Legal Consultation', description: 'Tell us what you need help with and our team will follow up.' } },
      { type: 'markdown', data: { section: 'guidance', markdown: 'A consultation starts with a clear description of your situation, the questions you need answered, and the next step that makes sense for you.' } },
      { type: 'contact_cta', data: { section: 'consultation', title: 'Start with a conversation', description: 'Send a message to request a legal consultation.', label: 'Request a consultation', url: '/contact' } },
    ],
  },
  {
    key: 'blog',
    path: '/blog',
    title: 'Our Blog',
    summary: 'Practical legal information for North Carolina families, workers, and small businesses.',
    pageType: 'recipe',
    recipe: 'blog',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Our Blog', description: 'Practical legal information from North Carolina Legal Services.' } },
      { type: 'callout', data: { section: 'disclaimer', content: 'This information is educational and is not legal advice.' } },
    ],
  },
  {
    key: 'donate',
    path: '/donate',
    title: 'Support Equal Access to Justice',
    summary: 'Your support helps make practical legal guidance more accessible across North Carolina.',
    pageType: 'recipe',
    recipe: 'donate',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Support Equal Access to Justice', description: 'Help North Carolina communities find clear, practical legal support.' } },
      {
        type: 'donation_choices',
        data: {
          section: 'donation',
          destination: 'https://donate.stripe.com/bIY29UfAUec37GocMM',
            tiers: [
            { amount: 100, title: 'Advocacy', description: 'Support practical help for North Carolina families.', featured: true, icon: 'HeartIcon' },
          ],
        },
      },
    ],
  },
  {
    key: 'privacy',
    path: '/policies/privacy',
    title: 'Privacy Policy',
    summary: 'How North Carolina Legal Services handles information submitted through this site.',
    pageType: 'system',
    recipe: 'privacy',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Privacy Policy', description: 'How we handle information submitted through this site.' } },
      { type: 'heading', data: { title: 'Information we collect' } },
      { type: 'markdown', data: { markdown: 'We use submitted information to respond to requests, provide services, and maintain this site.' } },
    ],
  },
  {
    key: 'terms',
    path: '/policies/terms',
    title: 'Terms of Use',
    summary: 'Terms governing use of the North Carolina Legal Services website.',
    pageType: 'system',
    recipe: 'terms',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Terms of Use', description: 'Terms governing use of this website.' } },
      { type: 'heading', data: { title: 'Using this website' } },
      { type: 'markdown', data: { markdown: 'Information on this site is provided for general educational purposes and does not create an attorney-client relationship.' } },
    ],
  },
  {
    key: 'third-party-notices',
    path: '/third-party-notices',
    title: 'Third-Party Notices',
    summary: 'Notices for third-party services used by this website.',
    pageType: 'system',
    recipe: 'third-party-notices',
    blocks: [
      { type: 'hero', data: { section: 'hero', title: 'Third-Party Notices', description: 'Notices for third-party services used by this website.' } },
      { type: 'heading', data: { title: 'Service notices' } },
      { type: 'markdown', data: { markdown: 'This site may use third-party services for hosting, payments, analytics, and communications.' } },
    ],
  },
]

const blogPosts = [
  {
    id: 'blog-ncls-getting-a-divorce',
    title: 'Getting a Divorce in North Carolina',
    slug: 'getting-a-divorce-in-north-carolina',
    category: 'Divorce',
    tags: ['Divorce', 'Consultation'],
    excerpt: 'A practical overview of the first questions to consider when beginning a divorce in North Carolina.',
  },
  {
    id: 'blog-ncls-divorce-and-children',
    title: 'Divorce and Children in North Carolina',
    slug: 'divorce-and-children-in-north-carolina',
    category: 'Divorce',
    tags: ['Divorce'],
    excerpt: 'Questions North Carolina parents often consider when planning for children during divorce.',
  },
  {
    id: 'blog-ncls-consultation',
    title: 'Preparing for Your Consultation with North Carolina Legal Services',
    slug: 'preparing-for-your-consultation-with-north-carolina-legal-services',
    category: 'Consultation',
    tags: ['Consultation'],
    excerpt: 'How to prepare for a focused and productive legal consultation.',
  },
  {
    id: 'blog-ncls-property-division',
    title: 'Property Division in North Carolina Divorce',
    slug: 'property-division-in-north-carolina-divorce-protecting-whats-yours',
    category: 'Property',
    tags: ['Property'],
    excerpt: 'An overview of property division questions in a North Carolina divorce.',
  },
  {
    id: 'blog-ncls-writing-your-own-will',
    title: 'Writing Your Own Will: How It Works',
    slug: 'writing-your-own-will-how-it-works',
    category: 'Estate Planning',
    tags: ['Estate Planning'],
    excerpt: 'Important considerations before writing or updating a will.',
  },
  {
    id: 'blog-ncls-iep-violations',
    title: '7 Common IEP Violations Every North Carolina Parent Should Recognize (And How to Fight Back)',
    slug: '7-common-iep-violations-every-north-carolina-parent-should-recognize-and-how-to-fight-back',
    category: 'Education',
    tags: ['Education'],
    excerpt: 'Common questions North Carolina parents ask about IEP support and school obligations.',
  },
  {
    id: 'blog-ncls-landlord-eviction',
    title: 'Your Landlord Cannot Evict You Without a Court Order — Here\'s What to Do When They Try',
    slug: 'your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try',
    category: 'Housing',
    tags: ['Housing'],
    excerpt: 'General information about responding to an attempted eviction in North Carolina.',
  },
] as const

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
   'https://www.northcarolinalegalservices.org', 'North Carolina Legal Services',
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
  (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
VALUES
  ('locale-ncls-ci-en', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'en', 'English', 1,
   'published', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO site_domains
  (id, organization_id, site_id, domain, type, role, status, dns_status, created_at, updated_at)
VALUES
  ('domain-ncls-ci-local', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'ncls.localhost',
   'subdomain', 'secondary', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}),
  ('domain-ncls-ci-public', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'ncls.krabiclaw.com',
   'subdomain', 'secondary', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}),
  ('domain-ncls-ci-custom', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'www.northcarolinalegalservices.org',
   'custom', 'canonical', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)}),
  ('domain-ncls-ci-apex', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'northcarolinalegalservices.org',
   'custom', 'secondary', 'active', 'valid', ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

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
   '/contact/confirmed', 1, '{"contact_form_enabled":false}', ${sqlValue(SEEDED_AT)},
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

INSERT INTO media_assets
  (id, organization_id, site_id, kind, provider, source, public_url, thumbnail_url,
   mime_type, file_name, width, height, alt_text, category, status, created_at, updated_at)
VALUES
  ('media-ncls-ci-fixture', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, 'image',
   'cloudflare_images', 'uploaded',
   'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
   'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
   'image/jpeg', 'ncls-ci-fixture.jpg', 1200, 800, 'North Carolina Legal Services fixture image', 'other', 'active',
   ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO location_qa
  (id, organization_id, site_id, location_id, page_path, question, answer,
   is_owner_answer, source, status, sort_order, created_at, updated_at)
VALUES
  ('qa-ncls-ci-1', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, NULL, '/',
   'What should I bring to a consultation?',
   'Bring the key facts, dates, and documents related to your question so we can focus on the next step.',
   1, 'manual', 'published', 0, ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO reviews
  (id, organization_id, site_id, location_id, author_name, rating, title, content,
   status, source, publication_authorized, created_at, updated_at)
VALUES
  ('review-ncls-ci-1', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, NULL,
   'NCLS client', 5, 'Clear and practical',
   'The team explained the options clearly and helped us understand what to do next.',
   'approved', 'manual_override', 1, ${sqlValue(SEEDED_AT)}, ${sqlValue(SEEDED_AT)});

INSERT INTO offerings
  (id, organization_id, site_id, name, slug, label, summary, short_description, body,
   features, faqs, cta_label, cta_url, thumbnail_asset_id, hero_image_asset_id, media_asset_ids, schema_type, seo_title, seo_description,
   canonical_path, status, sort_order, featured, source, source_ref, created_at, updated_at, updated_by)
VALUES
  ('offering-ncls-consultation', ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)},
   'Family Law', 'family', 'Family Law',
   'Focused guidance for families working through important legal decisions.',
   'Understand your options and decide what to do next.',
   'Bring the key facts and documents so the consultation can stay focused.',
   '[{"title":"Understand your options","description":"Clarify the process and the decisions ahead."},{"title":"Plan the next step","description":"Leave with a practical path forward."}]', '[]', 'Request a consultation', '/contact', 'media-ncls-ci-fixture', 'media-ncls-ci-fixture', '[]', 'LegalService',
   'Family Law | North Carolina Legal Services',
   'Affordable family law guidance for North Carolina clients.', '/services/family',
   'published', 0, 1, 'ci_fixture', 'blawby-release-check', ${sqlValue(SEEDED_AT)},
   ${sqlValue(SEEDED_AT)}, ${sqlValue(USER_ID)});

${pages.map(renderPage).join('\n\n')}

${renderBlogPosts()}
`
}

function renderBlogPosts(): string {
  const publishedAt = SEEDED_AT
  const bodyFor = (post: typeof blogPosts[number]) => `# ${post.title}\n\n${post.excerpt}\n\nNorth Carolina Legal Services shares general information to help readers understand common legal questions and identify the next practical step. This article is educational and is not legal advice.`
  const rows = blogPosts.map(post => {
    const body = bodyFor(post)
    return `INSERT INTO blog_posts
  (id, organization_id, site_id, title, slug, body, excerpt, category, tags_json,
   nav_section, nav_title, nav_order, nav_section_order, hide_from_nav, featured_order,
   status, visibility, author_id, published_at, first_published_at, created_at, updated_at,
   seo_title, seo_description, seo_keywords, canonical_url, robots, featured_image_asset_id)
VALUES
  (${sqlValue(post.id)}, ${sqlValue(ORGANIZATION_ID)}, ${sqlValue(SITE_ID)}, ${sqlValue(post.title)},
   ${sqlValue(post.slug)}, ${sqlValue(body)}, ${sqlValue(post.excerpt)}, ${sqlValue(post.category)},
   ${sqlJson(post.tags)}, 'Articles', ${sqlValue(post.title)}, 0, 0, 0, NULL, 'published', 'public',
   ${sqlValue(USER_ID)}, ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)},
   ${sqlValue(`${post.title} | North Carolina Legal Services`)}, ${sqlValue(post.excerpt)}, ${sqlValue(post.tags.join(', '))},
   ${sqlValue(`/article/${post.slug}`)}, 'index,follow', 'media-ncls-ci-fixture');

INSERT INTO content_documents
  (id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at)
VALUES
  (${sqlValue(`document-${post.id}`)}, 'tenant_blog', ${sqlValue(post.id)}, ${sqlValue(`revision-${post.id}`)}, ${sqlValue(`revision-${post.id}`)}, ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)});

INSERT INTO content_revisions
  (id, document_id, snapshot_json, body_markdown, created_by, label, created_at, published_at)
VALUES
  (${sqlValue(`revision-${post.id}`)}, ${sqlValue(`document-${post.id}`)}, ${sqlJson({ blocks: [{ id: `block-${post.id}`, parent_block_id: null, type: 'markdown', position: 0, level: null, data: { markdown: body }, updated_at: publishedAt }] })}, ${sqlValue(body)}, ${sqlValue(USER_ID)}, 'Blawby CI fixture', ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)});

INSERT INTO content_blocks
  (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
VALUES
  (${sqlValue(`block-${post.id}`)}, ${sqlValue(`document-${post.id}`)}, NULL, 'markdown', 0, NULL, ${sqlJson({ markdown: body })}, ${sqlValue(publishedAt)}, ${sqlValue(publishedAt)});`
  }).join('\n\n')
  const redirects = [
    ['divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', 'blog-ncls-divorce-and-children'],
    ['preparing-for-your-consultation', 'blog-ncls-consultation'],
    ['property-division-in-north-carolina-divorce', 'blog-ncls-property-division'],
    ['writing-your-own-will-how-it-works-in-north-carolina', 'blog-ncls-writing-your-own-will'],
  ] as const
  const redirectRows = redirects.map(([oldSlug, postId]) => `INSERT INTO blog_post_redirects (id, post_id, site_id, old_slug, created_at) VALUES (${sqlValue(`redirect-${oldSlug}`)}, ${sqlValue(postId)}, ${sqlValue(SITE_ID)}, ${sqlValue(oldSlug)}, ${sqlValue(publishedAt)});`).join('\n')
  return `${rows}\n\n${redirectRows}`
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
