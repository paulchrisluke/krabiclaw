#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnYarn } from './utils/spawn-yarn.mjs'

// 'platform' is KrabiClaw's own organization in the fixture snapshot.
const FIXTURE_ORG_IDS = [
  'platform',
  'org-demo',
  'org-mcp-free',
  'org-mcp-growth',
  'org-mcp-growth-service',
  'org-pottery-house',
  'org-kikuzuki',
  'org-ncls-blawby',
]

// The customer fixtures targeted by tenant-guest-journeys.spec.ts. Scoping by
// indexed site/org columns keeps the email marker queries bounded.
const GUEST_BOOKING_SITE_IDS = ['site-pottery-house', 'site-kikuzuki', 'site-ncls-blawby']

// E2E creates throwaway `e2e-*` sites in the protected fixture organizations.
// They must be swept by site ID rather than by deleting the fixture
// organizations/users.
// Retained/audit tables are explicit because their site foreign keys are often
// SET NULL (or intentionally polymorphic), so deleting the site alone would
// leave rows behind in the shared preview database.
// `reservations` and `bookings` restrict their request's deletion, so they are
// swept first. Order here is the order the statements are emitted in.
const RETAINED_SITE_TABLES = [
  'usage_events',
  'stripe_ga4_subscription_intents',
  'mcp_tool_call_events',
  'activity_entries',
  'analytics_events',
  'analytics_summaries',
  'reservations',
  'bookings',
  'requests',
] as const

const FIXTURE_USER_IDS = [
  'user-demo',
  'user-mcp-free',
  'user-mcp-growth',
  'user-mcp-growth-service',
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


// Repeat the bounded selector in each statement; D1 remote execution does not allow temporary tables.
const eligibleOrgIds = `
  SELECT id FROM organization
  WHERE id NOT IN (${fixtureOrgIdList})
    AND createdAt < ${cutoffUnixSeconds}
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

const eligibleSiteIds = `
  SELECT id FROM sites WHERE organization_id IN (${eligibleOrgIds})
  UNION SELECT id FROM (${eligibleE2eFixtureSiteIds})
`

const retainedSiteDeletes = RETAINED_SITE_TABLES.map(table => `
DELETE FROM ${table} WHERE site_id IN (${eligibleSiteIds});
`).join('\n')

// What a guest booked holds its request open: `reservations` and `bookings`
// reference it ON DELETE RESTRICT, so both are cleared before the request is.
const disposableGuestRequestIds = `
  SELECT id FROM requests
  WHERE site_id IN (${guestBookingSiteIdList})
    AND kind IN ('contact', 'reservation', 'booking')
    AND payload_json ->> '$.guest.email' LIKE '%@playwright.example'
    AND created_at < '${cutoff}'
  ORDER BY id LIMIT ${batchSize}
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

${retainedSiteDeletes}

UPDATE user_workspace_state
SET whatsapp_pending_confirmation = NULL, whatsapp_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_extract(whatsapp_pending_confirmation, '$.siteId') IN (${eligibleSiteIds})
   OR EXISTS (SELECT 1 FROM json_each(whatsapp_pending_confirmation, '$.candidates') candidate
              WHERE json_extract(candidate.value, '$.siteId') IN (${eligibleSiteIds}));

UPDATE user_workspace_state
SET site_id = NULL, location_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE site_id IN (${eligibleSiteIds})
   OR location_id IN (SELECT id FROM business_locations WHERE site_id IN (${eligibleSiteIds}));

DELETE FROM sites WHERE id IN (${eligibleE2eFixtureSiteIds});
DELETE FROM organization WHERE id IN (${eligibleOrgIds});

DELETE FROM reservations WHERE request_id IN (${disposableGuestRequestIds});
DELETE FROM bookings WHERE request_id IN (${disposableGuestRequestIds});
DELETE FROM requests WHERE id IN (${disposableGuestRequestIds});
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
