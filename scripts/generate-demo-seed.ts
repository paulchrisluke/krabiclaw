#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  renderCompiledDemoContentBlock,
  renderCompiledDemoCoreSeedBlock,
  renderCompiledDemoMediaBlock,
  renderCompiledDemoMenuBlock,
  renderCompiledDemoPostsBlock,
  renderCompiledDemoQaBlock,
  renderCompiledDemoReviewsBlock,
  renderCompiledDemoTranslationsBlock,
  renderCompiledDemoBillingBlock,
  renderDemoExperienceSeedBlock,
} from '../seed-definitions/demo.ts'
import { renderSiteBillingSql, renderSiteEntitlementsSql } from '../seed-definitions/billing-sql.ts'

function escapeSql(value: string) {
  return value.replace(/'/g, "''")
}

function sqlValue(value: string | number | boolean | null) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escapeSql(value)}'`
}

function renderMcpFixtureOrg(orgId: string, userId: string, name: string, slug: string, plan: 'free' | 'growth' | 'managed') {
  const siteId = `site-${orgId.replace(/^org-/, '')}`
  const locationId = `loc-${orgId.replace(/^org-/, '')}`
  const status = plan === 'free' ? 'free' : 'active'
  return `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlValue(userId)}, ${sqlValue(name)}, ${sqlValue(`${userId}@example.test`)}, 1, 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(orgId)}, ${sqlValue(name)}, ${sqlValue(slug)}, CURRENT_TIMESTAMP);

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlValue(`member-${orgId}`)}, ${sqlValue(orgId)}, ${sqlValue(userId)}, 'owner', CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO sites (id, organization_id, theme_id, theme, slug, subdomain, brand_name, status, plan, onboarding_status, source_locale, default_currency, url_structure, vertical, created_at, updated_at)
VALUES (${sqlValue(siteId)}, ${sqlValue(orgId)}, 'saya-theme-v1', 'saya', ${sqlValue(slug)}, ${sqlValue(slug)}, ${sqlValue(name)}, 'active', ${sqlValue(plan)}, 'active', 'en', 'THB', 'location_subdirectories', 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO business_locations (id, organization_id, site_id, slug, title, city, address, phone, email, maps_url, status, is_primary, created_at, updated_at)
VALUES (${sqlValue(locationId)}, ${sqlValue(orgId)}, ${sqlValue(siteId)}, 'main', ${sqlValue(name)}, 'Krabi', '{}', NULL, NULL, NULL, 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE sites SET primary_location_id = ${sqlValue(locationId)} WHERE id = ${sqlValue(siteId)};

${renderSiteBillingSql(siteId, orgId, { status, plan }, sqlValue)}

${renderSiteEntitlementsSql(siteId, orgId, plan, sqlValue)}`
}

const isStdout = process.argv.includes('--stdout')
const isRemote = process.argv.includes('--remote')
const isStaging = process.argv.includes('--staging')
const isPreview = process.argv.includes('--preview')

if ([isRemote, isStaging, isPreview].filter(Boolean).length > 1) {
  console.error('Only one of --remote, --staging, or --preview may be provided.')
  process.exit(1)
}

const envFlag = isStaging ? '--env staging' : isPreview ? '--env preview' : isRemote ? '' : '--local'
const remoteFlag = isRemote || isStaging || isPreview ? '--remote' : ''

const sql = `-- Demo seed for local development - Saya theme showcase
-- Ephemeral: generated from seed-definitions/demo.ts
-- Preview at: http://demo.localhost:3000
-- Production at: https://demo.krabiclaw.com
-- Destructive for demo-owned rows: safe to re-run with yarn seed:local or yarn seed:remote --confirm-production

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
DELETE FROM organization WHERE id IN ('org-demo', 'org_demo', 'org-mcp-free', 'org-mcp-growth', 'org-mcp-managed', 'org-transfer-recipient');

-- Delete users (after member rows are deleted)
DELETE FROM user WHERE id IN ('user-demo', 'user_demo', 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'user-mcp-free', 'user-mcp-growth', 'user-mcp-managed');

-- Guard against legacy demo scripts that may have claimed the demo domains
DELETE FROM site_domains WHERE domain IN ('demo.localhost', 'demo.krabiclaw.com');

-- Users
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('user-demo', 'Demo Owner', 'demo@krabiclaw.com', 1, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Site-transfer recipient: used by site-transfer E2E tests.
-- Must be an owner of an org so that the site-transfer accept endpoint can find an owner organization.
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'Transfer Recipient', 'recipient@example.test', 1, 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO organization (id, name, slug, createdAt)
VALUES ('org-transfer-recipient', 'Recipient Studio', 'recipient-studio', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-transfer-recipient', 'org-transfer-recipient', 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re', 'owner', CURRENT_TIMESTAMP);

-- Standard paid/free fixture orgs for MCP and editor E2E tests.
${renderMcpFixtureOrg('org-mcp-free', 'user-mcp-free', 'MCP Free Fixture', 'mcp-free-fixture', 'free')}

${renderMcpFixtureOrg('org-mcp-growth', 'user-mcp-growth', 'MCP Growth Fixture', 'mcp-growth-fixture', 'growth')}

${renderMcpFixtureOrg('org-mcp-managed', 'user-mcp-managed', 'MCP Managed Fixture', 'mcp-managed-fixture', 'managed')}

-- Organization
INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-demo', 'Ember & Slice', 'ember-slice-demo', CURRENT_TIMESTAMP);

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-demo', 'org-demo', 'user-demo', 'owner', CURRENT_TIMESTAMP);

${renderCompiledDemoCoreSeedBlock()}

${renderCompiledDemoMediaBlock()}

${renderCompiledDemoReviewsBlock()}

${renderCompiledDemoMenuBlock()}

${renderCompiledDemoQaBlock()}

${renderCompiledDemoPostsBlock()}

${renderDemoExperienceSeedBlock()}

${renderCompiledDemoContentBlock()}

${renderCompiledDemoTranslationsBlock()}

${renderCompiledDemoBillingBlock()}
`

if (isStdout) {
  process.stdout.write(sql)
  process.exit(0)
}

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
