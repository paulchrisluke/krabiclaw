#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execWithRetry } from './wrangler-retry.ts'

// Sweeps rows that Playwright E2E specs leave behind on preview/staging, so scheduled tasks and
// manual queries against these environments don't scan an ever-growing table. Two categories:
//
// 1. Throwaway sites/orgs created via tests/e2e/helpers/ensure-site.ts, mcp.spec.ts's MCP-tool
//    variant, or a direct POST /api/sites - every convention in use (e2e-site-*, e2e-throwaway-*,
//    e2e-dashboard-pages-*, mcp-e2e-*) contains 'e2e-' as a substring, so one LIKE pattern covers
//    all of them. sites.organization_id cascades from organization (ON DELETE CASCADE), and every
//    org-scoped table cascades from organization in turn (same pattern already relied on by
//    generate-demo-seed.ts's org reset), so deleting the organization row is sufficient for most
//    child tables - except notification_events, whose organization_id/site_id columns are
//    ON DELETE SET NULL rather than CASCADE, so it's swept explicitly before the org delete.
//    An org is only eligible once every site it owns matches - preserves any org that also holds
//    a fresh or non-E2E site.
//
// 2. Guest-submitted rows against the *persistent* Pottery House fixture (bookings, contact
//    forms, reservations) - these specs already mark every guest email '...@playwright.example',
//    so they're swept by that marker instead, since there's no throwaway org/site to cascade from.
//
// Age-guarded (default 2 hours) as a practical safety margin, not a hard guarantee: rows created
// by an in-flight run are always fresher than the cutoff, so a run has to be stuck for the full
// window before its own data becomes sweepable by a concurrent run against the same shared
// preview/staging DB (CI's concurrency group is per-PR, so multiple PRs' e2e-smoke runs can be
// in flight at once). Observed e2e-smoke runtime is well under an hour; if that ever changes,
// raise --older-than-hours to match rather than treating 2h as untouchable.

const isStaging = process.argv.includes('--staging')
const isPreview = process.argv.includes('--preview')
const isStdout = process.argv.includes('--stdout')

if (isStaging && isPreview) {
  console.error('Only one of --staging or --preview may be provided.')
  process.exit(1)
}

// Intentionally no standalone --remote: this script only ever targets throwaway E2E rows
// (matched by the 'e2e-' subdomain / '@playwright.example' email markers), which is meaningless
// against production, so it must always be explicitly scoped to --preview or --staging (or
// default to --local for testing the emitted SQL against a local D1 file).
const envFlag = isStaging ? '--env staging' : isPreview ? '--env preview' : '--local'
const remoteFlag = isStaging || isPreview ? '--remote' : ''

const ageArg = process.argv.find((arg) => arg.startsWith('--older-than-hours='))
const olderThanHours = ageArg ? Number(ageArg.split('=')[1]) : 2
if (!Number.isFinite(olderThanHours) || olderThanHours < 0) {
  console.error('--older-than-hours must be a non-negative number.')
  process.exit(1)
}

const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
if (Number.isNaN(cutoffDate.getTime())) {
  console.error('--older-than-hours produced an invalid cutoff date.')
  process.exit(1)
}
const cutoff = cutoffDate.toISOString()

// An org is eligible only when every site it owns matches the throwaway-E2E pattern - an org
// that also holds a fresh or non-E2E site must survive.
const eligibleOrgIds = `
  SELECT s.organization_id FROM sites s
  WHERE s.subdomain LIKE '%e2e-%' AND s.created_at < '${cutoff}'
  GROUP BY s.organization_id
  HAVING COUNT(*) = (SELECT COUNT(*) FROM sites s2 WHERE s2.organization_id = s.organization_id)
`

const sql = `-- Sweeps E2E-generated rows from preview/staging so they don't accumulate forever.
-- Safe to re-run: only ever targets the 'e2e-' subdomain convention and the
-- '@playwright.example' guest-email marker that tests/e2e specs already use. Curated fixtures
-- (Pottery House, Kikuzuki, demo, MCP plan fixtures) are untouched - they live under fixed IDs
-- reset separately by generate-*-seed.ts.

PRAGMA foreign_keys = ON;

-- Category 1: throwaway sites/orgs.
-- notification_events.organization_id/site_id are ON DELETE SET NULL, not CASCADE, so they'd
-- otherwise survive the org delete below as orphaned rows pointing at a submission_id whose
-- parent row no longer exists. Delete them first, while organization_id is still populated.
DELETE FROM notification_events WHERE organization_id IN (${eligibleOrgIds});

-- Cascades through sites, content, translation_jobs, experiences, locations, guest_threads
-- (and, via guest_threads' own cascading FK, submission_messages), etc. via
-- organization_id -> organization(id) ON DELETE CASCADE.
DELETE FROM organization WHERE id IN (${eligibleOrgIds});

-- Category 2: guest-submitted rows on the persistent Pottery House fixture, marked by email.
-- notification_events is polymorphic (submission_type/submission_id, no FK) so it must be swept
-- explicitly before its parent rows disappear. submission_messages has a real FK to guest_threads
-- (ON DELETE CASCADE), but it's deleted explicitly here too rather than relied on implicitly, so
-- this block's correctness doesn't depend on the guest_threads delete below succeeding first.
DELETE FROM notification_events WHERE submission_id IN (
  SELECT id FROM contact_submissions WHERE email LIKE '%@playwright.example' AND created_at < '${cutoff}'
  UNION ALL
  SELECT id FROM reservation_submissions WHERE email LIKE '%@playwright.example' AND created_at < '${cutoff}'
  UNION ALL
  SELECT id FROM experience_bookings WHERE guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}'
);

DELETE FROM submission_messages WHERE thread_id IN (
  SELECT id FROM guest_threads WHERE guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}'
);

DELETE FROM guest_threads WHERE guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}';

DELETE FROM contact_submissions WHERE email LIKE '%@playwright.example' AND created_at < '${cutoff}';
DELETE FROM reservation_submissions WHERE email LIKE '%@playwright.example' AND created_at < '${cutoff}';
DELETE FROM experience_bookings WHERE guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}';
DELETE FROM notifications WHERE recipient LIKE '%@playwright.example' AND created_at < '${cutoff}';
`

if (isStdout) {
  process.stdout.write(sql)
} else {
  const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-reset-e2e-'))
  const sqlPath = join(dir, 'reset-e2e-artifacts.sql')

  try {
    writeFileSync(sqlPath, sql, 'utf8')
    const cmd = `npx wrangler d1 execute DB ${envFlag} ${remoteFlag} --file "${sqlPath}"`.trim()
    console.log(`[reset-e2e-artifacts] Applying: ${cmd}`)
    await execWithRetry(() => execSync(cmd, { stdio: 'inherit' }), 'reset-e2e-artifacts')
    console.log('[reset-e2e-artifacts] Done.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
