#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execWithRetry } from './wrangler-retry.ts'

// Sweeps rows that Playwright E2E specs leave behind on preview/staging, so scheduled tasks and
// manual queries against these environments don't scan an ever-growing table. Two categories:
//
// 1. Every non-fixture organization. Preview/staging never hold legitimate customer data -
//    everything in `organization` is either one of the fixed, named seed fixtures below (reset
//    on every run by generate-*-seed.ts) or E2E-test-created throwaway state, so "not a known
//    fixture" is sufficient to mark an org disposable - no naming-convention/pattern matching on
//    `sites.subdomain` needed. That matters operationally, not just for simplicity: an earlier
//    version matched orgs via a `sites.subdomain LIKE 'e2e-%'` GROUP BY/HAVING check, which -
//    against preview's actual accumulated backlog - exceeded D1's per-call CPU budget and reset
//    the DB before the sweep could run at all ("D1 DB exceeded its CPU time limit and was
//    reset"). A plain `id NOT IN (<9 fixed ids>)` filter on `organization` is a single cheap
//    linear scan of a small table, regardless of how large the disposable backlog has grown.
//    sites.organization_id cascades from organization (ON DELETE CASCADE), and every org-scoped
//    table cascades from organization in turn (same pattern already relied on by
//    generate-demo-seed.ts's org reset), so deleting the organization row is sufficient for most
//    child tables - except notification_events, whose organization_id/site_id columns are
//    ON DELETE SET NULL rather than CASCADE, so it's swept explicitly before the org delete.
//
// 2. Guest-submitted rows against the *persistent* Pottery House and demo fixtures (bookings,
//    contact forms, reservations) - these specs already mark every guest email
//    '...@playwright.example', so they're swept by that marker instead, since there's no
//    throwaway org/site to cascade from. Every one of these queries scopes to the two known
//    fixture site/org IDs FIRST, before the LIKE pattern - contact_submissions,
//    experience_bookings, and reservation_submissions all already carry a site_id-leading index
//    (idx_contact_submissions_site, idx_experience_bookings_site, idx_reservation_submissions_site)
//    and notifications an organization_id-leading one (idx_notifications_org), hand-authored in
//    the immutable migrations/0001_initial.sql and already live everywhere - but a bare
//    `email LIKE '%@playwright.example'` with no site/org filter can't use any of them (leading
//    wildcard forces a full scan regardless), which is what still exceeded D1's CPU budget on
//    staging even after category 1 was fixed to be cheap.
//
// Age-guarded (default 2 hours) as a practical safety margin, not a hard guarantee: rows created
// by an in-flight run are always fresher than the cutoff, so a run has to be stuck for the full
// window before its own data becomes sweepable by a concurrent run against the same shared
// preview/staging DB (CI's concurrency group is per-PR, so multiple PRs' e2e-smoke runs can be
// in flight at once). Observed e2e-smoke runtime is well under an hour; if that ever changes,
// raise --older-than-hours to match rather than treating 2h as untouchable. For category 1, the
// guard is "does this org own any site created after the cutoff" rather than checking every
// site's age individually - an org that's still actively being built by an in-flight test run
// gets skipped entirely, everything else disposable goes.

// Every org a seed script creates under a fixed ID, kept in sync with each
// `DELETE FROM organization WHERE id ...` in generate-demo-seed.ts,
// generate-pottery-house-seed.ts, generate-kikuzuki-seed.ts, and
// generate-ncls-blawby-seed.mjs. Add new fixtures here when adding a new seed script.
const FIXTURE_ORG_IDS = [
  'org-demo',
  'org_demo',
  'org-mcp-free',
  'org-mcp-growth',
  'org-mcp-managed',
  'org-transfer-recipient',
  'org-pottery-house',
  'org-kikuzuki',
  'org-ncls-blawby',
]

// The only two fixtures guest-booking/contact specs target: Pottery House (notifications.spec.ts,
// pottery-house.spec.ts) and demo (reply-threading.spec.ts, public.spec.ts) - lets category 2
// scope by an indexed column before the unindexable email LIKE pattern. Update this list if a
// future spec targets a different fixture (grep tests/e2e/*.spec.ts for '@playwright.example' to
// find every spec that needs to stay covered).
const GUEST_BOOKING_SITE_IDS = ['site-pottery-house', 'site-demo']
const GUEST_BOOKING_ORGANIZATION_IDS = ['org-pottery-house', 'org-demo']

// Every fixture user a seed script creates under a fixed ID or that also happens to use
// '@example.test' (server/api/dev/login.get.ts's auto-create path uses exactly this domain for
// every dev-login test user, so several fixtures collide with it and must be excluded by ID, not
// just by domain): user-mcp-free/growth/managed (scripts/generate-demo-seed.ts's
// renderMcpFixtureOrg) and the site-transfer recipient both use @example.test. user-ncls-blawby
// (generate-ncls-blawby-seed.mjs) uses 'ncls-blawby@example.test' and does match the domain — it
// must stay excluded by ID: it's entered_by_user_id on NCLS's owner-entered reviews, and deleting
// it cascades entered_by_user_id to NULL (ON DELETE SET NULL), which violates
// reviews_owner_entered_provenance_check (requires entered_by_user_id IS NOT NULL for
// source='owner_entered'). user-demo, user-pottery-house, and user-kikuzuki use other domains and
// would never match anyway, but are listed for clarity/future-proofing. Keep in sync with
// FIXTURE_ORG_IDS' seed scripts.
const FIXTURE_USER_IDS = [
  'user-demo',
  'user_demo',
  'user-mcp-free',
  'user-mcp-growth',
  'user-mcp-managed',
  'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re',
  'user-pottery-house',
  'user-kikuzuki',
  'user-ncls-blawby',
]

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
// Better Auth tables (user, member, session, invitation) store createdAt as a Unix-seconds
// integer via unixepoch(), not the ISO8601 text app tables use - category 3 needs this variant.
const cutoffUnixSeconds = Math.floor(cutoffDate.getTime() / 1000)

const fixtureOrgIdList = FIXTURE_ORG_IDS.map((id) => `'${id}'`).join(', ')
const fixtureUserIdList = FIXTURE_USER_IDS.map((id) => `'${id}'`).join(', ')
const guestBookingSiteIdList = GUEST_BOOKING_SITE_IDS.map((id) => `'${id}'`).join(', ')
const guestBookingOrgIdList = GUEST_BOOKING_ORGANIZATION_IDS.map((id) => `'${id}'`).join(', ')

const batchArg = process.argv.find((arg) => arg.startsWith('--batch-size='))
const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 500
if (!Number.isInteger(batchSize) || batchSize <= 0) {
  console.error('--batch-size must be a positive integer.')
  process.exit(1)
}

// Category 1's "is this org eligible" check, capped with LIMIT so a single run can never be
// asked to filter the entire backlog in one CPU-budgeted call - it makes bounded incremental
// progress every run instead, draining a large existing backlog over several runs rather than
// needing to clear it all at once. Every throwaway site creates exactly one throwaway org 1:1
// (runSiteCreation only reuses an org while it still owns zero sites), so organization has grown
// to roughly sites' scale. Intentionally interpolated twice below rather than factored into a
// TEMP TABLE - D1's remote execute endpoint rejects CREATE TEMP TABLE/DROP TABLE with
// "not authorized: SQLITE_AUTH" (its HTTP API restricts DDL beyond a plain wrangler d1 execute
// --file), so each DELETE re-evaluates its own copy instead of sharing one materialized result -
// more total scan work than a temp table would need, but each copy still terminates after
// finding batchSize matches, so it stays cheap regardless of backlog size.
const eligibleOrgIds = `
  SELECT id FROM organization
  WHERE id NOT IN (${fixtureOrgIdList})
    AND id NOT IN (SELECT organization_id FROM sites WHERE created_at >= '${cutoff}')
  LIMIT ${batchSize}
`

const sql = `-- Sweeps E2E-generated rows from preview/staging so they don't accumulate forever.
-- Safe to re-run: only ever targets organizations outside the fixed fixture allowlist and the
-- '@playwright.example' guest-email marker that tests/e2e specs already use. Curated fixtures
-- (Pottery House, Kikuzuki, demo, MCP plan fixtures, NCLS/Blawby) are untouched - they live under
-- fixed IDs reset separately by generate-*-seed.ts.

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

-- Category 2: guest-submitted rows on the persistent Pottery House/demo fixtures, marked by
-- email. Every query below filters by the known fixture site_id/organization_id FIRST - via
-- idx_contact_submissions_site, idx_experience_bookings_site, idx_reservation_submissions_site,
-- and idx_notifications_org (all hand-authored, already live, see comment above) - so the
-- unindexable 'LIKE %@playwright.example' only has to scan a handful of fixture-scoped rows,
-- not a full table scan. notification_events is polymorphic (submission_type/submission_id, no
-- FK) so it must be swept explicitly before its parent rows disappear. submission_messages has a
-- real FK to guest_threads (ON DELETE CASCADE), but it's deleted explicitly here too rather than
-- relied on implicitly, so this block's correctness doesn't depend on the guest_threads delete
-- below succeeding first.
-- Each branch is LIMIT-bounded too, as its own derived table - SQLite rejects a bare
-- parenthesized SELECT as a compound-query operand inside IN(...) ("near UNION: syntax error"),
-- so each branch is wrapped as SELECT id FROM (SELECT ... LIMIT n) instead. Defensive: category 2
-- is already site/org-scoped down to 2 fixtures, so its result sets should be small regardless,
-- but every fix so far in this script underestimated backlog scale.
DELETE FROM notification_events WHERE submission_id IN (
  SELECT id FROM (SELECT id FROM contact_submissions WHERE site_id IN (${guestBookingSiteIdList}) AND email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize})
  UNION ALL
  SELECT id FROM (SELECT id FROM reservation_submissions WHERE site_id IN (${guestBookingSiteIdList}) AND email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize})
  UNION ALL
  SELECT id FROM (SELECT id FROM experience_bookings WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize})
);

DELETE FROM submission_messages WHERE thread_id IN (
  SELECT id FROM guest_threads WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);

DELETE FROM guest_threads WHERE id IN (
  SELECT id FROM guest_threads WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);

DELETE FROM contact_submissions WHERE id IN (
  SELECT id FROM contact_submissions WHERE site_id IN (${guestBookingSiteIdList}) AND email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);
DELETE FROM reservation_submissions WHERE id IN (
  SELECT id FROM reservation_submissions WHERE site_id IN (${guestBookingSiteIdList}) AND email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);
DELETE FROM experience_bookings WHERE id IN (
  SELECT id FROM experience_bookings WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);
DELETE FROM notifications WHERE id IN (
  SELECT id FROM notifications WHERE organization_id IN (${guestBookingOrgIdList}) AND recipient LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);

-- Category 3: dev-login-created test users. server/api/dev/login.get.ts's userId-less path
-- auto-creates a user under '<userId>@example.test' for every dev-login call that doesn't pass
-- an explicit userId - the exact query that was reading 47.5M rows per execution (99.5% of all
-- D1 rows read on preview/staging, per wrangler d1 insights) because it scanned this ever-growing
-- table with 3 correlated EXISTS subqueries per row. That query is now fixed to a single indexed
-- pass regardless of table size, but this table still grows unboundedly without a sweep, so it's
-- covered here too. member/session/invitation(as inviter) all cascade from user.id
-- (ON DELETE CASCADE), so deleting the user row is sufficient - it does NOT cascade up to
-- organization/sites (organization isn't a child of user), but those are independently covered by
-- category 1 above regardless of whether their owning user was already swept.
DELETE FROM user WHERE id IN (
  SELECT id FROM user
  WHERE id NOT IN (${fixtureUserIdList})
    AND email LIKE '%@example.test'
    AND createdAt < ${cutoffUnixSeconds}
  LIMIT ${batchSize}
);
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
