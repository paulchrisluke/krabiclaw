Use this chat handoff when resuming the production Drizzle cutover:

```text
We are resuming the KrabiClaw Drizzle production cutover on June 24, 2026.
This supersedes the earlier same-day handoff — staging is now fully verified
and a real production schema gap has been found and fixed (not yet applied
to prod). Read docs/drizzle-migration-cutover.md in full before doing
anything; its status banner has the same finding in more detail.

Current state already verified (commits on `staging`, latest 294cdc1):
- `staging` branch is deployed and current on staging, E2E staging green
- `yarn drizzle:check` passes locally and the schema matches staging D1
- Full local E2E passed: 88/88 (a couple of intermittent CI flakes earlier
  today reran clean — delete_location_qa 400, create_experience 400, and an
  ECONNRESET on an unrelated test all cleared on retry with zero code
  changes between runs; treat isolated single-test failures as flaky unless
  they recur on a rerun)
- `yarn fixture:pottery-house --url https://staging.krabiclaw.com --site-id
  site-pottery-house --slug pottery-house` passes 37/37 against staging
  (the fixture script itself was broken — missing the x-preview-tenant
  header staging requires, plus stale --site-id/--slug defaults from the
  original "pottery-house-krabi" intake name; both fixed in 19247d5)
- Zero raw `as ApiRecord` casts, zero raw `db.prepare()`/`.batch()` outside
  server/db/index.ts (verified via grep, not just trusting prior claims)
- GitHub issue #95 has the latest progress comment posted on 2026-06-24
  summarizing all of the above plus the migration gap below

Critical production facts confirmed directly against prod D1 today:
- `site-kikuzuki` is live and paid
  - `sites.plan = growth`, `site_billing.plan = growth`, `status = active`
  - `stripe_subscription_id = sub_1TlMdlEm0pkzLQDb6M9oi2Ud`
  - it has its own Better Auth org/account, not the staging fixture org
- `site-pottery-house` is live and active
  - `sites.plan = growth`, `site_billing.plan = growth`, `status = active`
  - `stripe_subscription_id = sub_1TjqPAEm0pkzLQDbLbA5oipj`
  - canonical custom domain `www.potteryhousekrabi.com` is active/valid
  - it has its own Better Auth org/account in prod
- Staging now mirrors both of the above exactly (closed in 8b3f733/348ae3a)

NEW FINDING — production is missing two tables (294cdc1):
- `work_requests` and `platform_content_components` do not exist on
  production at all, confirmed via direct `sqlite_master` query — NOT a
  filter/query artifact, double-checked.
- `main`'s *currently deployed* code already references both tables
  (server/utils/work-request-management.ts, server/utils/platform-content.ts)
  — this is a pre-existing production gap, unrelated to anything in this
  Drizzle PR. It predates this work.
- Root cause: production's d1_migrations bookkeeping last applied
  `0005_add_google_analytics_connections.sql` (2026-06-22). A later
  migration squash collapsed history back into a single `0001_initial.sql`.
  `wrangler d1 migrations apply` tracks applied migrations BY FILENAME, not
  content/checksum — production already had a `0001_initial.sql` row
  recorded from 2026-05-28 (an earlier squash), so re-running the current
  (re-squashed, content-newer) `0001_initial.sql` against production is
  silently skipped. `wrangler d1 migrations list DB --remote` reports
  "No migrations to apply!" even though the tables are missing — do not
  trust that output alone, ever, on this repo's migration history.
- Fix already written, tested, and pushed:
  `migrations/0002_add_work_requests_and_platform_content_components.sql`
  uses `CREATE TABLE IF NOT EXISTS` so it's a verified no-op on staging
  (already has both tables under their original pre-squash migration
  names — confirmed idempotent, row counts unchanged after re-applying)
  and purely additive on production (no data touched).
- This migration has NOT been applied to production yet. It will run
  automatically via the existing `prod-deploy` CI job
  (`.github/workflows/ci.yml`, `wrangler d1 migrations apply DB --remote`)
  the moment `staging` merges into `main` and that push triggers deploy.

Your task now:

1. Confirm the `staging` → `main` PR status (open it if not already open —
   it was being prepared as of this handoff; it will include ALL
   accumulated staging work, not just the Drizzle migration: analytics
   pipeline, platform content components, FAQ/How-To admin UI, etc. That's
   expected and fine per direct instruction — don't try to split it).

2. Before merging, re-verify the migration-gap finding still holds:
   - `wrangler d1 migrations list DB --remote` (expect it to still lie and
     say nothing to apply — that's the known-bad signal, not a green light)
   - `wrangler d1 execute DB --remote --command "SELECT name FROM
     sqlite_master WHERE type='table' AND name IN ('work_requests',
     'platform_content_components')"` — expect EMPTY results, confirming
     the gap is still real and migration 0002 is still needed.
   - If somehow already fixed by someone else, figure out how before
     proceeding — that would mean migration tracking is even less reliable
     than understood here.

3. Decide whether issue #95's original "Cutover steps" (full backup → wipe
   entire prod DB → reapply migrations fresh → restore ONLY Better Auth
   tables from backup → reseed app content → re-promote admins → verify)
   is still necessary, or whether the lower-risk path now applies instead:
   merge the PR, let the existing CI prod-deploy job apply migration 0002
   (additive, no data loss) and deploy the new Worker, then run the
   §3/§4 post-cutover validation checklist in
   docs/drizzle-migration-cutover.md (auth/session flows, dashboard pages,
   public tenant bootstrap, analytics writes, admin re-promotion).
   Current evidence favors the lower-risk path — production schema
   otherwise matches server/db/schema.ts, and both live client sites'
   data has been directly confirmed intact and correct — but this is a
   real decision with real stakes (live paying customers, live domains),
   not a checkbox. Re-verify the evidence yourself before acting on it;
   don't take this handoff's word for it on a destructive operation.

4. If you proceed with the lower-risk path: merge the PR, watch the
   `prod-deploy` CI job (migrations apply, then `wrangler deploy`), then
   immediately run docs/drizzle-migration-cutover.md §3 (post-cutover
   validation) and §4 (admin re-promotion) against production. Don't
   consider this done until §3 passes for real, not just "the deploy
   succeeded."

5. If you instead decide the full backup/wipe/restore/reseed plan is
   still warranted: follow issue #95's "Cutover steps" section exactly,
   substituting `migrations/0002_...sql` into the "reapply migrations"
   step so the fresh DB comes up with both tables from the start.

Constraints to preserve:
- Better Auth tables must be restored from backup if you do a wipe, not
  reseeded — they contain real production users that no seed script knows
  about.
- Better Auth camelCase column names must remain exact.
- migrations/*.sql applied via wrangler remains the production schema
  source of truth — never `drizzle-kit push` or `drizzle-kit generate`
  against this database.
- Pottery House and Kikuzuki are live customer sites with real Stripe
  subscriptions and (for Pottery House) a live custom domain — preserve
  their current working domains, ownership, and billing state through
  whichever path you take.
- Never write ad-hoc SQL files in scripts/ for schema changes — a proper
  numbered migration file is the only sanctioned mechanism, per CLAUDE.md.

If anything conflicts between this handoff and current prod D1 or current
`staging`/`main` state, trust what you observe right now over this
document — things may have moved since it was written. Surface any
discrepancy explicitly with exact dates/commits rather than silently
reconciling it.
```
