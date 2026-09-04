#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnYarn } from './utils/spawn-yarn.mjs'

// Sweeps rows that Playwright E2E specs leave behind on local/preview disposable data.
//
// 1. Every non-fixture organization. Preview never holds legitimate customer data -
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
// 2. Guest-submitted rows against persistent customer fixtures (bookings,
//    contact forms, reservations) - these specs already mark every guest email
//    '...@playwright.example', so they're swept by that marker instead, since there's no
//    throwaway org/site to cascade from. Every one of these queries scopes to known
//    fixture site/org IDs FIRST, before the LIKE pattern - contact_submissions,
//    experience_bookings, and reservation_submissions all already carry a site_id-leading index
//    (idx_contact_submissions_site, idx_experience_bookings_site, idx_reservation_submissions_site)
//    and notifications an organization_id-leading one (notifications_organization_created_at_idx) - but a bare
//    `email LIKE '%@playwright.example'` with no site/org filter can't use any of them (leading
//    wildcard forces a full scan regardless), which is what still exceeded D1's CPU budget on
//    preview even after category 1 was fixed to be cheap.
//
// Age-guarded (default 2 hours) as a practical safety margin, not a hard guarantee: rows created
// by an in-flight run are always fresher than the cutoff, so a run has to be stuck for the full
// window before its own data becomes sweepable by a concurrent run against the same shared
// preview DB (CI serializes the shared preview deployment, but cancelled runs still leave data).
// If runtime changes materially,
// raise --older-than-hours to match rather than treating 2h as untouchable. For category 1, the
// guard is "does this org own any site created after the cutoff" rather than checking every
// site's age individually - an org that's still actively being built by an in-flight test run
// gets skipped entirely, everything else disposable goes.

// Every org a seed script creates under a fixed ID, kept in sync with each
// `DELETE FROM organization WHERE id ...` in generate-demo-seed.ts,
// generate-pottery-house-seed.ts, generate-kikuzuki-seed.ts, and
// Curated Blawby fixtures are provisioned outside the disposable E2E artifact sweep.
const FIXTURE_ORG_IDS = [
  'org-demo',
  'org_demo',
  'org-mcp-free',
  'org-mcp-growth',
  'org-mcp-growth-service',
  // Removed by the next demo seed; protect an old fixture until that cleanup runs.
  'org-mcp-managed',
  'org-transfer-recipient',
  'org-pottery-house',
  'org-kikuzuki',
  'org-ncls-blawby',
]

// The customer fixtures targeted by tenant-guest-journeys.spec.ts. Scoping by
// indexed site/org columns keeps the email marker queries bounded.
const GUEST_BOOKING_SITE_IDS = ['site-pottery-house', 'site-kikuzuki', 'site-ncls-blawby']
const GUEST_BOOKING_ORGANIZATION_IDS = ['org-pottery-house', 'org-kikuzuki', 'org-ncls-blawby']

// Site-transfer E2E creates throwaway `e2e-*` sites in the protected fixture
// organizations, then moves them between those organizations. They must be
// swept by site ID rather than by deleting the fixture organizations/users.
// Retained/audit tables are explicit because their site foreign keys are often
// SET NULL (or intentionally polymorphic), so deleting the site alone would
// leave rows behind in the shared preview database.
const E2E_FIXTURE_SITE_RETAINED_TABLES = [
  'usage_events',
  'stripe_ga4_subscription_intents',
  'canary_runs',
  'mcp_tool_call_events',
  'notification_events',
  'notifications',
  'chowbot_messages',
  'chowbot_conversations',
  'organization_events',
  'site_domain_events',
  'site_conversion_events',
  'site_pageview_events',
  'site_analytics_daily',
  'work_requests',
] as const

// Every fixture user a seed script creates under a fixed ID or that also happens to use
// '@example.test' must be excluded by ID, not just by domain: user-mcp-free/growth/growth-service
// (scripts/generate-demo-seed.ts's
// Growth service fixture) and the site-transfer recipient both use @example.test. user-ncls-blawby
// The curated Blawby fixture uses 'ncls-blawby@example.test' and does match the domain — it
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
  'user-mcp-growth-service',
  // Removed by the next demo seed; protect an old fixture until that cleanup runs.
  'user-mcp-managed',
  'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re',
  'user-pottery-house',
  'user-kikuzuki',
  'user-ncls-blawby',
]

const isPreview = process.argv.includes('--preview')
const isStdout = process.argv.includes('--stdout')

if (process.argv.includes('--staging') || process.argv.includes('--remote')) {
  console.error('E2E cleanup supports only local and preview disposable data.')
  process.exit(1)
}

// Intentionally no standalone --remote: this script targets non-fixture organizations through
// the fixed fixture allowlist and age guard, plus guest rows marked '@playwright.example'. That
// scope is meaningless against production, so it must always be explicitly scoped to --preview
// or default to --local for testing the emitted SQL against a local D1 file.
const envFlag = isPreview ? '--env preview' : '--local'
const remoteFlag = isPreview ? '--remote' : ''

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

const eligibleE2eFixtureSiteIds = `
  SELECT id FROM sites
  WHERE organization_id IN (${fixtureOrgIdList})
    AND (subdomain LIKE 'e2e-%' OR subdomain LIKE 'mcp-e2e-%')
    AND created_at < '${cutoff}'
  ORDER BY id
  LIMIT ${batchSize}
`

const e2eFixtureSiteRetainedDeletes = E2E_FIXTURE_SITE_RETAINED_TABLES.map(table => `
DELETE FROM ${table}
WHERE site_id IN (${eligibleE2eFixtureSiteIds});
`).join('\n')

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

// Better Auth's subscription.referenceId intentionally has no foreign key to
// organization. Capture disposable Stripe subscription IDs while those rows
// still exist so the unscoped version table can be pruned before deleting the
// organization. The LIMIT keeps each reset invocation bounded.
const eligibleSubscriptionIds = `
  SELECT stripeSubscriptionId FROM subscription
  WHERE referenceId IN (${eligibleOrgIds})
    AND stripeSubscriptionId IS NOT NULL
  LIMIT ${batchSize}
`

const eligibleUserIds = `
  SELECT id FROM user
  WHERE id NOT IN (${fixtureUserIdList})
    AND email LIKE '%@example.test'
    AND createdAt < ${cutoffUnixSeconds}
  LIMIT ${batchSize}
`

const sql = `-- Sweeps E2E-generated rows from local/preview so they don't accumulate forever.
-- Safe to re-run: only ever targets organizations outside the fixed fixture allowlist and the
-- '@playwright.example' guest-email marker that tests/e2e specs already use. Curated fixtures
-- (Pottery House, Kikuzuki, demo, MCP plan fixtures, NCLS/Blawby) are untouched - they live under
-- fixed IDs reset separately by generate-*-seed.ts.

PRAGMA foreign_keys = ON;

-- Better Auth subscription rows are not organization children, so remove them
-- explicitly. stripe_subscription_versions is also unscoped; its IDs are
-- selected before the subscription rows disappear. Processed webhook audit
-- rows are intentionally retained because stripe_webhook_events has no safe
-- organization foreign key and this sweep must not infer ownership from JSON.
DELETE FROM stripe_subscription_versions
WHERE stripe_subscription_id IN (${eligibleSubscriptionIds});

DELETE FROM subscription WHERE referenceId IN (${eligibleOrgIds});

-- Category 1: throwaway sites/orgs.
-- notification_events.organization_id/site_id are ON DELETE SET NULL, not CASCADE, so they'd
-- otherwise survive the org delete below as orphaned rows pointing at a submission_id whose
-- parent row no longer exists. Delete them first, while organization_id is still populated.
DELETE FROM notification_events WHERE organization_id IN (${eligibleOrgIds});

-- Cascades through sites, content, experiences, locations, guest_threads
-- (and, via guest_threads' own cascading FKs, guest_thread_entries/guest_thread_member_state/
-- guest_thread_deliveries), etc. via organization_id -> organization(id) ON DELETE CASCADE.
DELETE FROM organization WHERE id IN (${eligibleOrgIds});

-- Category 1b: throwaway E2E sites created under protected fixture organizations.
-- Site-transfer E2E deliberately moves these sites between allowlisted fixture orgs, so the
-- organization sweep above must not delete either the fixture org or its users. The same
-- age/prefix/batch guard is applied to every statement; retained/audit rows are deleted first,
-- then the site row removes the remaining cascade-owned content.
${e2eFixtureSiteRetainedDeletes}

-- chowbot_channel_state and mcp_workspace_preferences are user/org-scoped preferences rather
-- than disposable rows; clear only their references to the throwaway sites before deletion.
UPDATE chowbot_channel_state
SET selected_site_id = NULL,
    active_conversation_id = NULL,
    pending_message_id = NULL,
    pending_confirmation = NULL
WHERE selected_site_id IN (${eligibleE2eFixtureSiteIds});

UPDATE mcp_workspace_preferences
SET site_id = NULL,
    location_id = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE site_id IN (${eligibleE2eFixtureSiteIds});

DELETE FROM site_transfer_requests
WHERE site_id IN (${eligibleE2eFixtureSiteIds});

DELETE FROM sites
WHERE id IN (${eligibleE2eFixtureSiteIds});

-- Category 2: guest-submitted rows on persistent customer fixtures, marked by
-- email. Every query below filters by the known fixture site_id/organization_id FIRST - via
-- idx_contact_submissions_site, idx_experience_bookings_site, idx_reservation_submissions_site,
-- and notifications_organization_created_at_idx (see comment above) - so the
-- unindexable 'LIKE %@playwright.example' only has to scan a handful of fixture-scoped rows,
-- not a full table scan. notification_events is polymorphic (submission_type/submission_id, no
-- FK) so it must be swept explicitly before its parent rows disappear. guest_thread_entries/
-- guest_thread_member_state/guest_thread_deliveries all have real FKs to guest_threads
-- (ON DELETE CASCADE), but they're deleted explicitly here too rather than relied on
-- implicitly, so this block's correctness doesn't depend on the guest_threads delete below
-- succeeding first.
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

DELETE FROM guest_thread_deliveries WHERE thread_id IN (
  SELECT id FROM guest_threads WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);

DELETE FROM guest_thread_member_state WHERE thread_id IN (
  SELECT id FROM guest_threads WHERE site_id IN (${guestBookingSiteIdList}) AND guest_email LIKE '%@playwright.example' AND created_at < '${cutoff}' LIMIT ${batchSize}
);

DELETE FROM guest_thread_entries WHERE thread_id IN (
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

-- Category 3: historical test users created by the removed dev-login bypass. Keep sweeping these
-- legacy '<userId>@example.test' rows until every shared environment has aged them out.
-- member/session/invitation(as inviter) all cascade from user.id
-- (ON DELETE CASCADE), so deleting the user row is sufficient - it does NOT cascade up to
-- organization/sites (organization isn't a child of user), but those are independently covered by
-- category 1 above regardless of whether their owning user was already swept.
-- site_transfer_requests deliberately restrict deletion of their initiating user. E2E transfer
-- specs create both records, so remove the stale request before its stale test user. Requests
-- tied to fixture users are untouched because the same protected-user selection is reused.
DELETE FROM site_transfer_requests WHERE initiated_by_user_id IN (${eligibleUserIds});

DELETE FROM user WHERE id IN (${eligibleUserIds});
`

if (isStdout) {
  process.stdout.write(sql)
} else {
  const dir = mkdtempSync(join(tmpdir(), 'krabiclaw-reset-e2e-'))
  const sqlPath = join(dir, 'reset-e2e-artifacts.sql')

  try {
    writeFileSync(sqlPath, sql, 'utf8')
    const args = ['wrangler', 'd1', 'execute', 'DB', ...envFlag.split(' '), ...remoteFlag.split(' ').filter(Boolean), '--file', sqlPath]
    console.log(`[reset-e2e-artifacts] Applying: corepack yarn ${args.join(' ')}`)
    const result = spawnYarn(args)
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
    console.log('[reset-e2e-artifacts] Done.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
