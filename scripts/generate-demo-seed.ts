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

-- Cleanly replace the protected demo tenant. Cascades remove demo site content,
-- locations, media, menus, reviews, posts, translations, bookings, billing,
-- credits, ChowBot state, domains, and other demo-owned child rows.
DELETE FROM organization WHERE id IN ('org-demo', 'org_demo');
DELETE FROM user WHERE id IN ('user-demo', 'user_demo', 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re');

-- Guard against legacy demo scripts that may have claimed the demo domains.
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
