#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  renderCompiledPotteryHouseBillingBlock,
  renderCompiledPotteryHouseBlogBlock,
  renderCompiledPotteryHouseContentBlock,
  renderCompiledPotteryHouseCoreSeedBlock,
  renderCompiledPotteryHouseExperiencesBlock,
  renderCompiledPotteryHouseMediaBlock,
  renderCompiledPotteryHousePostsBlock,
  renderCompiledPotteryHouseQaBlock,
  renderCompiledPotteryHouseReviewsBlock,
} from '../seed-definitions/pottery-house.ts'
import { spawnYarn } from './utils/spawn-yarn.mjs'

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

const sql = `-- Pottery House Krabi seed
-- Ephemeral: generated from seed-definitions/pottery-house.ts
-- Preview at: http://pottery-house.localhost:3000
-- Production at: https://www.potteryhousekrabi.com
-- Destructive for pottery-house-owned rows: safe to re-run locally or against preview.

PRAGMA foreign_keys = ON;

-- Theme is shared platform data, not client-owned.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('saya-theme-v1', 'Saya', 'saya', '1.0.0', 'Restaurant website theme', 'active');

-- Cleanly replace the protected pottery-house tenant. Deleting the site first
-- keeps the seed idempotent even if a prior run left the subdomain row behind.
DELETE FROM sites WHERE id = 'site-pottery-house' OR subdomain = 'pottery-house';
DELETE FROM organization WHERE id = 'org-pottery-house';
DELETE FROM site_domains WHERE domain IN ('pottery-house.localhost', 'pottery-house.krabiclaw.com', 'www.potteryhousekrabi.com');

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

${renderCompiledPotteryHouseBlogBlock()}

${renderCompiledPotteryHouseContentBlock()}

${renderCompiledPotteryHouseBillingBlock()}
`

if (isStdout) {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(sql, error => error ? reject(error) : resolve())
  })
  process.exit(0)
}

if (isPreview) {
  const checkResult = spawnYarn(
    ['wrangler', 'd1', 'execute', 'DB', ...envFlag.split(' '), remoteFlag, '--command', "SELECT organization_id FROM sites WHERE id = 'site-pottery-house'", '--json'],
    { encoding: 'utf8' },
  )
  if (checkResult.error) throw checkResult.error
  if (checkResult.status !== 0) process.exit(checkResult.status ?? 1)
  const checkOutput = String(checkResult.stdout)
  const currentOrgId = JSON.parse(checkOutput)?.[0]?.results?.[0]?.organization_id

  if (currentOrgId && currentOrgId !== 'org-pottery-house') {
    console.error(
      `[seed:pottery-house] Refusing to reseed: site-pottery-house is owned by "${currentOrgId}", not the demo org "org-pottery-house".\n` +
      'This tenant has already been transferred to a real client. Reseeding would delete their live site, ' +
      'business_locations, tenant pages, media_assets, and custom domain rows, then recreate it back under the demo org.\n' +
      'Aborting.'
    )
    process.exit(1)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-pottery-house-'))
const sqlPath = join(dir, 'pottery-house-krabi.sql')

try {
  writeFileSync(sqlPath, sql, 'utf8')
  const args = ['wrangler', 'd1', 'execute', 'DB', ...envFlag.split(' '), ...remoteFlag.split(' ').filter(Boolean), '--file', sqlPath]
  console.log(`[seed:pottery-house] Applying: corepack yarn ${args.join(' ')}`)
  const result = spawnYarn(args)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log('[seed:pottery-house] Done.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
