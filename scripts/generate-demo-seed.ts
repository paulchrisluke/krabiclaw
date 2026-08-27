#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  renderCompiledDemoContentBlock,
  renderCompiledDemoTenantPagesBlock,
  renderCompiledDemoCoreSeedBlock,
  renderCompiledDemoMediaBlock,
  renderCompiledDemoMenuBlock,
  renderCompiledDemoPostsBlock,
  renderCompiledDemoBlogBlock,
  renderCompiledDemoQaBlock,
  renderCompiledDemoReviewsBlock,
  renderCompiledDemoBillingBlock,
  renderCompiledDemoInboxBlock,
  renderDemoExperienceSeedBlock,
} from '../seed-definitions/demo.ts'
import { renderCanonicalBillingSql } from '../seed-definitions/billing-sql.ts'
import { renderTenantPagesSeedSql } from '../seed-definitions/tenant-pages.ts'

function escapeSql(value: string) {
  return value.replace(/'/g, "''")
}

function sqlValue(value: string | number | boolean | null) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escapeSql(value)}'`
}

function sqlJson(value: unknown) {
  return sqlValue(JSON.stringify(value))
}

function renderMcpFixtureOrg(orgId: string, userId: string, name: string, slug: string, plan: 'free' | 'growth', includeSelectionSite = false) {
  const siteId = `site-${orgId.replace(/^org-/, '')}`
  const locationId = `loc-${orgId.replace(/^org-/, '')}`
  const status = plan === 'free' ? 'free' : 'active'
  const aiCredits = {
    balance: plan === 'growth' ? 2000 : 500,
    lifetimeUsed: 0,
  }
  const tenantPages = renderTenantPagesSeedSql({
    siteId,
    organizationId: orgId,
    sourceLocale: 'en',
    locales: [{ locale: 'en', status: 'published' }],
    rows: [
      {
        id: `${siteId}-home-hero`,
        page: 'home',
        field: 'hero',
        content: name,
        heroTitle: name,
        heroSubtitle: 'A seeded MCP fixture page.',
        media: [],
      },
      {
        id: `${siteId}-about-body`,
        page: 'about',
        field: 'body',
        content: `${name} about page.`,
        media: [],
      },
      {
        id: `${siteId}-contact-body`,
        page: 'contact',
        field: 'body',
        content: `${name} contact page.`,
        media: [],
      },
    ],
    sqlValue,
    sqlJson,
  })
  const selectionSite = includeSelectionSite ? `
INSERT OR REPLACE INTO sites (id, organization_id, theme_id, theme, slug, subdomain, brand_name, public_url, status, plan, onboarding_status, source_locale, default_currency, vertical, created_at, updated_at)
VALUES ('site-mcp-growth-service-selection', ${sqlValue(orgId)}, 'saya-theme-v1', 'saya', 'mcp-growth-service-selection', 'mcp-growth-service-selection', 'MCP Selection Fixture', 'https://mcp-growth-service-selection.krabiclaw.com', 'active', ${sqlValue(plan)}, 'active', 'en', 'THB', 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status)
VALUES
  ('locale::org-mcp-growth-service::site-mcp-growth-service-selection::en', ${sqlValue(orgId)}, 'site-mcp-growth-service-selection', 'en', 'English', 1, 'published');
` : ''
  return `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlValue(userId)}, ${sqlValue(name)}, ${sqlValue(`${userId}@example.test`)}, 1, 'user', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(orgId)}, ${sqlValue(name)}, ${sqlValue(slug)}, unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlValue(`member-${orgId}`)}, ${sqlValue(orgId)}, ${sqlValue(userId)}, 'owner', unixepoch());

INSERT OR REPLACE INTO sites (id, organization_id, theme_id, theme, slug, subdomain, brand_name, public_url, status, plan, onboarding_status, source_locale, default_currency, vertical, created_at, updated_at)
VALUES (${sqlValue(siteId)}, ${sqlValue(orgId)}, 'saya-theme-v1', 'saya', ${sqlValue(slug)}, ${sqlValue(slug)}, ${sqlValue(name)}, ${sqlValue(`https://${slug}.krabiclaw.com`)}, 'active', ${sqlValue(plan)}, 'active', 'en', 'THB', 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO site_locales
  (id, organization_id, site_id, locale, label, is_source, status)
VALUES
  (${sqlValue(`locale::${orgId}::${siteId}::en`)}, ${sqlValue(orgId)}, ${sqlValue(siteId)}, 'en', 'English', 1, 'published');

INSERT OR IGNORE INTO business_locations (id, organization_id, site_id, slug, title, city, address, phone, email, maps_url, opening_hours, status, is_primary, created_at, updated_at)
VALUES (${sqlValue(locationId)}, ${sqlValue(orgId)}, ${sqlValue(siteId)}, 'main', ${sqlValue(name)}, 'Krabi', ${sqlJson({ addressLines: [] })}, NULL, NULL, NULL, ${sqlJson([
    { openDay: 'MONDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'TUESDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'WEDNESDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'THURSDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'FRIDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'SATURDAY', openTime: '11:00', closeTime: '22:00' },
    { openDay: 'SUNDAY', openTime: '11:00', closeTime: '22:00' },
  ])}, 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE sites SET primary_location_id = ${sqlValue(locationId)} WHERE id = ${sqlValue(siteId)};

INSERT OR REPLACE INTO media_assets
  (id, organization_id, site_id, kind, provider, source,
   cloudflare_image_id, public_url, thumbnail_url, mime_type, file_name,
   alt_text, category, status, created_at, updated_at)
VALUES
  (${sqlValue(`media-${siteId}-fixture-image`)}, ${sqlValue(orgId)}, ${sqlValue(siteId)},
   'image', 'cloudflare_images', 'uploaded', ${sqlValue('0762ea49-0bd2-4cc8-1044-d6c9b1f00100')},
   'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
   'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public',
   'image/jpeg', ${sqlValue(`${siteId}-fixture.jpg`)}, 'Seeded MCP image fixture', 'other', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO media_placements
  (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status)
VALUES
  (${sqlValue(`placement-${siteId}-fixture-gallery`)}, ${sqlValue(orgId)}, ${sqlValue(siteId)}, 'business_location', ${sqlValue(locationId)}, 'gallery', ${sqlValue(`media-${siteId}-fixture-image`)}, 0, 'active');

${renderCanonicalBillingSql(siteId, orgId, { status, plan }, sqlValue, aiCredits)}

${tenantPages}
${selectionSite}`
}

// INCIDENT: Anthropic's Claude (an AI coding assistant) ran this script with
// --preview believing it was a harmless dry run. It is not. --preview
// executes these queries for real against the remote preview D1 database via
// `wrangler d1 execute DB --env preview --remote`. Claude did not check what
// the flag actually did before running it and fired a live remote write
// without asking the user first. That was Claude's mistake, not a tooling
// ambiguity — the behavior is spelled out a few lines below. If you are
// Claude (or any other AI assistant) reading this: check what a flag on a
// database-touching script actually does before you run it. Use --stdout to
// see the generated SQL without applying it anywhere.
const isStdout = process.argv.includes('--stdout')
const isPreview = process.argv.includes('--preview')

if (process.argv.includes('--remote') || process.argv.includes('--staging')) {
  console.error('This seed supports only local and preview databases.')
  process.exit(1)
}

const envFlag = isPreview ? '--env preview' : '--local'
const remoteFlag = isPreview ? '--remote' : ''

const sql = `-- Demo seed for local development - Saya theme showcase
-- Ephemeral: generated from seed-definitions/demo.ts
-- Preview at: http://demo.localhost:3000
-- Production at: https://demo.krabiclaw.com
-- Destructive for demo-owned rows: safe to re-run locally or against preview.

PRAGMA foreign_keys = ON;

-- Theme is shared platform data, not demo-owned data.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- Cleanly replace the protected demo tenant and MCP fixture orgs.
-- Every org-scoped table declares ON DELETE CASCADE back to organization(id),
-- and D1 honors that cascade within a single wrangler d1 execute --file run
-- (verified: deleting organization cascades through sites -> experiences ->
-- experience_bookings without a constraint error). So deleting the org row
-- is sufficient; there is no need to hand-maintain a child-table delete list
-- that has to be kept in sync with every new table added to the schema.
DELETE FROM organization WHERE id IN ('org-demo', 'org_demo', 'org-mcp-free', 'org-mcp-growth', 'org-mcp-growth-service', 'org-mcp-managed', 'org-transfer-recipient');

-- Better Auth subscriptions do not reference organization with a foreign key.
-- Remove the ephemeral fixture rows explicitly so a free fixture cannot retain
-- stale paid access across a re-seed.
DELETE FROM subscription WHERE referenceId IN ('org-transfer-recipient', 'org-demo', 'org_demo', 'org-mcp-free', 'org-mcp-growth', 'org-mcp-growth-service', 'org-mcp-managed');

-- Delete users (after member rows are deleted)
DELETE FROM user WHERE id IN ('user-demo', 'user_demo', 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'user-mcp-free', 'user-mcp-growth', 'user-mcp-growth-service', 'user-mcp-managed');

-- Guard against legacy demo scripts that may have claimed the demo domains
DELETE FROM site_domains WHERE domain IN ('demo.localhost', 'demo.krabiclaw.com');

-- Users
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('user-demo', 'Demo Owner', 'demo@krabiclaw.com', 1, 'admin', unixepoch(), unixepoch());

-- Site-transfer recipient: used by site-transfer E2E tests.
-- Must be an owner of an org so that the site-transfer accept endpoint can find an owner organization.
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'Transfer Recipient', 'recipient@example.test', 1, 'user', unixepoch(), unixepoch());

INSERT OR IGNORE INTO organization (id, name, slug, createdAt)
VALUES ('org-transfer-recipient', 'Recipient Studio', 'recipient-studio', unixepoch());

INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-transfer-recipient', 'org-transfer-recipient', 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'owner', unixepoch());

-- Standard paid/free fixture orgs for MCP and editor E2E tests.
${renderMcpFixtureOrg('org-mcp-free', 'user-mcp-free', 'MCP Free Fixture', 'mcp-free-fixture', 'free')}

${renderMcpFixtureOrg('org-mcp-growth', 'user-mcp-growth', 'MCP Growth Fixture', 'mcp-growth-fixture', 'growth')}

${renderMcpFixtureOrg('org-mcp-growth-service', 'user-mcp-growth-service', 'MCP Growth Service Fixture', 'mcp-growth-service-fixture', 'growth', true)}

-- Organization
INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-demo', 'Ember & Slice', 'ember-slice-demo', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-demo', 'org-demo', 'user-demo', 'owner', unixepoch());

${renderCompiledDemoCoreSeedBlock()}

-- Preserve the canonical credentialed local browser owner across demo-only reseeds.
-- The user/session is provisioned separately by scripts/provision-e2e-auth.ts, while
-- deleting org-demo above cascades its membership; restore that membership when the
-- credentialed user already exists without inventing another auth path.
INSERT INTO member (id, organizationId, userId, role, createdAt)
SELECT 'member-user-e2e-demo-owner-org-demo', 'org-demo', 'user-e2e-demo-owner', 'owner', unixepoch()
WHERE EXISTS (SELECT 1 FROM user WHERE id = 'user-e2e-demo-owner')
ON CONFLICT(id) DO UPDATE SET role = excluded.role;

${renderCompiledDemoMediaBlock()}

${renderCompiledDemoReviewsBlock()}

${renderCompiledDemoMenuBlock()}

${renderCompiledDemoQaBlock()}

${renderCompiledDemoPostsBlock()}

${renderCompiledDemoBlogBlock()}

${renderDemoExperienceSeedBlock()}

${renderCompiledDemoInboxBlock()}

${renderCompiledDemoContentBlock()}

${renderCompiledDemoTenantPagesBlock()}

${renderCompiledDemoBillingBlock()}
`

if (isStdout) {
  process.stdout.write(sql)
} else {
  const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-demo-'))
  const sqlPath = join(dir, 'demo.sql')

  try {
    writeFileSync(sqlPath, sql, 'utf8')
    const cmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --file "${sqlPath}"`.trim()
    console.log(`[seed:demo] Applying: ${cmd}`)
    execSync(cmd, { stdio: 'inherit' })
    console.log('[seed:demo] Done.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
