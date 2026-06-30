#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execWithRetry } from './wrangler-retry.ts'
import {
  renderCompiledPotteryHouseBillingBlock,
  renderCompiledPotteryHouseContentBlock,
  renderCompiledPotteryHouseCoreSeedBlock,
  renderCompiledPotteryHouseExperiencesBlock,
  renderCompiledPotteryHouseMediaBlock,
  renderCompiledPotteryHousePostsBlock,
  renderCompiledPotteryHouseQaBlock,
  renderCompiledPotteryHouseReviewsBlock,
  renderCompiledPotteryHouseTranslationsBlock,
} from '../seed-definitions/pottery-house.ts'

const isStdout = process.argv.includes('--stdout')
const isRemote = process.argv.includes('--remote')
const isStaging = process.argv.includes('--staging')
const isPreview = process.argv.includes('--preview')

const envFlag = isStaging ? '--env staging' : isPreview ? '--env preview' : isRemote ? '' : '--local'
const remoteFlag = isRemote || isStaging || isPreview ? '--remote' : ''

const sql = `-- Pottery House Krabi seed
-- Ephemeral: generated from seed-definitions/pottery-house.ts
-- Preview at: http://pottery-house.localhost:3000
-- Production at: https://pottery-house.krabiclaw.com
-- Destructive for pottery-house-owned rows: safe to re-run with yarn seed:local or yarn seed:remote --confirm-production

PRAGMA foreign_keys = ON;

-- Theme is shared platform data, not client-owned.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- Cleanly replace the protected pottery-house tenant. Deleting the site first
-- keeps the seed idempotent even if a prior run left the subdomain row behind.
DELETE FROM sites WHERE id = 'site-pottery-house' OR subdomain = 'pottery-house';
DELETE FROM organization WHERE id = 'org-pottery-house';
DELETE FROM site_domains WHERE domain IN ('pottery-house.localhost', 'pottery-house.krabiclaw.com');

-- Organization (owned by the dedicated Pottery House owner account)
INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-pottery-house', 'Pottery House Krabi', 'pottery-house-krabi', unixepoch());

-- Ensure the dedicated owner user exists in the user table to satisfy foreign key constraints.
INSERT OR IGNORE INTO user (id, name, email, emailVerified)
VALUES
  ('user-pottery-house', 'Pottery House Owner', 'thesdrew@gmail.com', 1);

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES
  ('member-pottery-house', 'org-pottery-house', 'user-pottery-house', 'owner', unixepoch());

${renderCompiledPotteryHouseCoreSeedBlock()}

${renderCompiledPotteryHouseMediaBlock()}

${renderCompiledPotteryHouseExperiencesBlock()}

${renderCompiledPotteryHouseReviewsBlock()}

${renderCompiledPotteryHouseQaBlock()}

${renderCompiledPotteryHousePostsBlock()}

${renderCompiledPotteryHouseContentBlock()}

${renderCompiledPotteryHouseTranslationsBlock()}

${renderCompiledPotteryHouseBillingBlock()}
`

if (isStdout) {
  process.stdout.write(sql)
  process.exit(0)
}

if (isRemote || isStaging || isPreview) {
  const checkCmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --command "SELECT organization_id FROM sites WHERE id = 'site-pottery-house'" --json`.trim()
  const checkOutput = execSync(checkCmd, { encoding: 'utf8' })
  const currentOrgId = JSON.parse(checkOutput)?.[0]?.results?.[0]?.organization_id

  if (currentOrgId && currentOrgId !== 'org-pottery-house') {
    console.error(
      `[seed:pottery-house] Refusing to reseed: site-pottery-house is owned by "${currentOrgId}", not the demo org "org-pottery-house".\n` +
      'This tenant has already been transferred to a real client. Reseeding would delete their live site, ' +
      'business_locations, site_content, media_assets, and custom domain rows, then recreate it back under the demo org.\n' +
      'Aborting.'
    )
    process.exit(1)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-pottery-house-'))
const sqlPath = join(dir, 'pottery-house-krabi.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  const cmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --file "${sqlPath}"`.trim()
  console.log(`[seed:pottery-house] Applying: ${cmd}`)
  await execWithRetry(() => execSync(cmd, { stdio: 'inherit' }), 'seed:pottery-house')
  console.log('[seed:pottery-house] Done.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
