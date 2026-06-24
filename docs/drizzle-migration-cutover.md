# Drizzle Migration Cutover Runbook

> **Status (2026-06-24): staging rehearsal is complete; production has a confirmed schema
> gap with a fix already staged.** The migration is fully merged to `staging` (PR #96,
> tracked in issue #95). Zero raw `D1Database.prepare()`/`.batch()` calls remain outside
> `server/db/index.ts`, the last `as ApiRecord` casts were removed in `7f79f57`, and
> `site-kikuzuki`/`site-pottery-house` on staging now mirror prod's real billing/ownership
> shape (`348ae3a`). The canonical regression fixture passes 37/37 against staging (`19247d5`
> fixed the fixture itself, which was missing the `x-preview-tenant` header).
>
> **Critical finding while verifying production readiness:** production's `d1_migrations`
> bookkeeping last applied `0005_add_google_analytics_connections.sql` (2026-06-22) and is
> missing `work_requests` and `platform_content_components` entirely — both tables that
> `main`'s *current, already-deployed* code depends on (Managed Service work queue, platform
> blog/docs FAQ/How-To components). This is a **pre-existing production gap, not something
> this PR introduces.** Root cause: repeated migration squashes collapsed history into a
> `0001_initial.sql` whose *filename* production already has recorded as applied (from
> 2026-05-28) — `wrangler d1 migrations apply` matches by filename, not content, so it
> silently reports "No migrations to apply!" and never re-runs the newer squashed content.
> Fixed with a new, uniquely-named, idempotent migration —
> `migrations/0002_add_work_requests_and_platform_content_components.sql` (`CREATE TABLE IF
> NOT EXISTS`, so it's a verified no-op on staging, which already has both tables under their
> original pre-squash migration names, and additive-only on production). Tested against local
> D1 and staging remote; **not yet applied to production.**
>
> This runbook now applies to the **production cutover**, which is gated on the `staging` →
> `main` PR merging first (CI deploys to production on push to `main`, which will pick up
> migration `0002` automatically). For exact next steps, treat
> [`docs/handoffs/drizzle-prod-cutover-2026-06-24.md`](handoffs/drizzle-prod-cutover-2026-06-24.md)
> as authoritative over the historical scope description below — it reflects what's actually
> been verified, this file documents the mechanics of running the cutover itself.

Scope: rollout of the now-merged Drizzle migration — replaces the Kysely/`@atinux/kysely-d1`
Better Auth adapter with `drizzleAdapter` over `drizzle-orm/d1`, and migrates every
`server/*` data-access call site (251 files across `server/utils/*`, `server/middleware/*`,
and `server/api/*`) from raw `D1Database.prepare()` calls to the `server/db` helpers
(`createDb`, `queryFirst`, `queryAll`, `execute`, `executeBatch`).

This is a same-database migration for the Drizzle adapter swap itself (no new D1 instance,
no destructive schema migration to existing tables) — the risk there is in the *data-access
layer rewrite*, not the schema. Separately, and not because of anything in this PR, production
is missing two tables that `main` already depends on (see finding above) — migration `0002`
fixes that additively, no backup/wipe/restore needed for that specific gap. Issue #95's
original "Cutover steps" section describes a more drastic full backup → wipe → reapply
migrations → restore Better Auth tables only → reseed → re-promote admins sequence, written
defensively before the migration work started ("you'll likely need to delete the whole DB and
do a fresh migration" per the lead engineer's note). **Re-evaluate whether that's still
necessary against current evidence before running any destructive step** — see the handoff
doc for the current recommendation.

---

## 1. Preconditions

Before starting prod cutover:

- [x] `server/db/schema.ts` matches the live D1 schema on staging — `yarn drizzle:check`
      passed (see §2 for the production-side command, which still needs to be run as part
      of cutover).
- [ ] No other engineer has an in-flight migration file pending apply on
      `krabiclaw-db-staging` or `krabiclaw-db` (production) — check
      `wrangler d1 migrations list DB --env staging --remote` and
      `wrangler d1 migrations list DB --remote`.
      **Do not trust "No migrations to apply!" alone** — that's exactly what masked the
      missing `work_requests`/`platform_content_components` tables on production (see status
      banner above). Cross-check actual tables: `wrangler d1 execute DB --remote --command
      "SELECT name FROM sqlite_master WHERE type='table'"` diffed against
      `grep -oP 'sqliteTable\("\K[^"]+' server/db/schema.ts`.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are
      set for production (billing webhook is in scope for this deploy and is
      billing-sensitive for both live client sites — see §3 staging validation, already passed).
- [x] Staging seed data for `site-kikuzuki` and `site-pottery-house` mirrors prod's real
      billing/ownership shape (paid `growth` plan, dedicated owner org per site, not the
      platform-admin/fixture org). Closed in `8b3f733`/`348ae3a`, confirmed directly against
      staging D1.
- [x] Canonical regression fixture (`yarn fixture:pottery-house`) passes 37/37 against staging.
- [ ] **The `staging` → `main` PR is open/merged.** Production deploy only happens on push to
      `main` (`.github/workflows/ci.yml`'s `prod-deploy` job) — this is the actual trigger for
      everything below, not a manual `yarn deploy` run from a laptop.
- [ ] `yarn stripe:listen` is **not** required for staging/prod (local-only).
- [ ] You have a terminal ready to run the admin re-promotion SQL immediately after cutover
      (§4) — the `user.role` column is unaffected by this migration, but confirm it
      post-deploy since `admin()` plugin role checks gate `/admin`.

---

## 2. Commands

### Local typecheck + lint

```bash
yarn typecheck
yarn lint
```

### Schema verification (drizzle schema vs. live D1)

```bash
# Local D1 (uses .wrangler/state/v3/d1 sqlite file via drizzle.config.ts)
yarn drizzle:check

# Staging — point DRIZZLE_DB_FILE or re-pull schema before check if drift suspected
wrangler d1 migrations list DB --env staging --remote
wrangler d1 execute DB --env staging --remote --command ".schema" > /tmp/staging-schema.sql

# Production
wrangler d1 migrations list DB --remote
wrangler d1 execute DB --remote --command ".schema" > /tmp/prod-schema.sql
```

Diff `/tmp/staging-schema.sql` / `/tmp/prod-schema.sql` against `server/db/schema.ts`
column-for-column for any table touched by the adapter rewrite (`user`, `session`,
`account`, `organization`, `member`, `media_assets`, `site_config`, `business_locations`).

### Staging deploy

```bash
yarn deploy:staging
# = yarn build && wrangler d1 migrations apply DB --env staging --remote && wrangler deploy --env staging
```

### Production deploy

```bash
yarn deploy
# = yarn build && wrangler d1 migrations apply DB --remote && wrangler deploy
```

Do not run `yarn deploy` until staging validation (§3) passes in full.

---

## 3. Post-cutover validation

Run against `staging.krabiclaw.com` after `deploy:staging`, then again against
production routes after `yarn deploy`.

### Auth still works

```bash
# Sign up + sign in via UI, or:
curl -i https://staging.krabiclaw.com/api/auth/get-session -b cookie.txt
```
- [ ] Email/password sign-up creates `user`, `organization`, `member` rows (the
      `databaseHooks.user.create.after` batch insert now goes through
      `db.batch([...]).onConflictDoNothing()` instead of raw `d1.batch()` — verify both
      rows land, not just `user`).
- [ ] Sign-in issues a session cookie and `/api/auth/get-session` returns the user.
- [ ] Phone/WhatsApp OTP sign-in still works (unrelated to this migration, but shares the
      same `betterAuth()` instance — smoke-test once).

### Better Auth Drizzle adapter session flows

- [ ] Session refresh / `get-session` works across a page reload (cookie → session lookup
      goes through `drizzleAdapter`, not Kysely — this is the highest-risk single change).
- [ ] Org membership is readable immediately after signup (no replication lag from the
      `db.batch` insert).
- [ ] Admin role check still works: sign in as one of the accounts in §4 and load
      `/admin` — confirms `drizzleAdapter` returns `role` correctly on the `user` row.
- [ ] Sign-out clears session and a subsequent `get-session` returns 401/empty.

### Dashboard basic pages

- [ ] `/dashboard/{orgSlug}` loads and redirects correctly for a single-site org.
- [ ] `/dashboard/{orgSlug}/sites/{siteSlug}` loads site config (exercises
      `site-config.ts` → `getConfig`/`queryAll` rewrite).
- [ ] `/dashboard/{orgSlug}/sites/{siteSlug}/settings/domains` and `/billing` load without 500s.

### Public tenant page bootstrap/content

- [ ] A known tenant site (e.g. `pottery-house.krabiclaw.com`) loads and resolves via
      `tenant-resolution.ts` (rewritten to `queryFirst` — confirm subdomain, custom-domain,
      and `.localhost` resolution paths all still match the live row).
- [ ] `/api/public/sites/[siteId]/config`, `/locales`, `/contact` (form submit),
      `/locations/[slug]/media`, `/qa`, `/reviews` all return 200 with expected shape —
      these were all touched in this diff.
- [ ] Run `yarn fixture:pottery-house --url https://staging.krabiclaw.com --site-id site-pottery-house --slug pottery-house`
      per CLAUDE.md's canonical regression fixture before considering staging green.
      (`--site-id`/`--slug` default to the live values now — see CLAUDE.md note on the
      original `pottery-house-krabi` intake name vs. the live `pottery-house` identifiers.)

### Analytics tracking still writes

- [ ] Load a public tenant page and confirm a row lands in `site_pageview_events`
      (`server/middleware/zz-pageview-tracking.ts` was modified in this diff).
- [ ] `POST /api/analytics/track` (custom events) returns 200 and the event is queryable.
- [ ] Run `aggregateAnalyticsForDate()` (or wait for the scheduled job) and confirm
      `site_analytics_daily` picks up the new rows — confirms the full pipeline, not just
      the write.

---

## 4. Post-cutover admin re-promotion

Better Auth roles are stored on the `user` table and are unaffected by the schema, but
re-confirm/re-apply immediately after each environment's cutover in case of any adapter
read/write mismatch. Use the canonical promotion script:

```bash
# Staging
node scripts/promote-platform-admin.mjs --email paulchrisluke@gmail.com --staging
node scripts/promote-platform-admin.mjs --email bamboo.chow@gmail.com --staging
node scripts/promote-platform-admin.mjs --email mrjoeelia@gmail.com --staging

# Production
node scripts/promote-platform-admin.mjs --email paulchrisluke@gmail.com --remote
node scripts/promote-platform-admin.mjs --email bamboo.chow@gmail.com --remote
node scripts/promote-platform-admin.mjs --email mrjoeelia@gmail.com --remote
```

Verify with `GET /api/auth/get-session` while signed in as each account, then confirm
`/admin` loads.

---

## 5. Rollback guidance

This deploy applies `wrangler d1 migrations apply` before `wrangler deploy` (per
`yarn deploy` / `yarn deploy:staging`). The Drizzle adapter swap itself does not ship a
new D1 migration — `drizzle/` currently has no migration files (`drizzle/meta/_journal.json`
only), so a rollback of *this* change is a Worker rollback, not a schema rollback.

If the deploy fails before traffic is healthy:

1. **Worker fails to deploy / build fails**: nothing is live yet — fix and redeploy. No
   user impact.
2. **Worker deployed but auth/session checks are failing in validation (§3)**:
   ```bash
   wrangler rollback --env staging   # or omit --env for production
   ```
   `wrangler rollback` reverts to the previous Worker version without requiring a rebuild.
   Confirm via `wrangler deployments list --env staging` which version it reverted to.
3. **If a D1 migration was applied as part of this deploy and needs to be undone**: D1
   migrations are forward-only via `wrangler d1 migrations apply`. There is currently no
   migration tied to this change, but if one is added before cutover, write and apply a
   compensating migration rather than hand-editing rows — do not run ad-hoc SQL per
   CLAUDE.md (`scripts/` ad-hoc SQL is explicitly disallowed).
4. **After rollback**: re-run §3 validation against the now-reverted Worker to confirm
   the rollback restored healthy auth/session/dashboard/public/analytics behavior before
   re-attempting the cutover.
5. **Communicate**: this is a shared-state, customer-visible system (tenant sites + their
   auth) — do not silently retry; confirm health before re-deploying.

---

## 6. Open risk areas

- **`drizzleAdapter` session/account field mapping** is the single biggest risk: Better
  Auth's Kysely adapter and Drizzle adapter can disagree on camelCase vs. snake_case
  column expectations. `server/db/schema.ts` defines Better Auth tables (`account`,
  `user`, `session`, `organization`, `member`) — per CLAUDE.md, Better Auth tables must
  use exact camelCase column names; confirm `schema.ts` matches that exactly, since a
  mismatch here would silently break session lookups rather than throwing.
- **`databaseHooks.user.create.after`** changed from a raw `d1.batch([...])` to
  `db.batch([db.insert(...).onConflictDoNothing(), ...])`. `onConflictDoNothing()` changes
  failure semantics from "insert or throw" to "insert or silently skip" — a partial/duplicate
  signup retry could now silently produce an owner-less org if the conflict target isn't
  exactly what's expected. Worth a direct test of the signup retry path, not just the happy
  path.
- **Unrelated changes bundled into this branch**: `server/api/billing/webhook.post.ts`
  carries a non-trivial Stripe subscription period-end hydration fix
  (`hydrateSubscriptionForBilling`, `subscriptionPeriodEndIso`) that is unrelated to the
  Drizzle migration. It has since been fully migrated onto the `server/db` helpers
  (`queryFirst`/`execute`) along with everything else, but it's still worth treating as a
  distinct change — if billing webhook validation fails post-cutover, check this logic
  specifically rather than assuming it's Drizzle-related.
- **Mixed data-access patterns**: resolved as of the final sweep (`a2d3a2e`) — a repo-wide
  grep for `.prepare(`/`.batch(` outside `server/db/index.ts` now only matches comments and
  `server/utils/auth.ts`'s `db.batch()` (Drizzle's own atomic batch API on query-builder
  objects, correctly left as-is, not raw D1).
- **Schema Squashed**: All D1 migration files `0002` through `0009` have been squashed down into `0001_initial.sql` as part of this cutover to provide a single source of truth that perfectly matches `server/db/schema.ts`. **This squashing is exactly what caused the production gap described in the status banner** — filename-based migration tracking can't tell that a re-squashed file's content moved forward when the filename didn't change. If another squash happens in the future, re-run the table-diff check above against every environment before assuming `wrangler d1 migrations apply` will pick it up.
- **`cloudflareEnv()` now always constructs a Drizzle `db` instance** (`server/utils/api-response.ts`)
  even for requests that never touch it, adding a `createDb()` call (cached via `WeakMap`,
  so cheap, but worth confirming under load) to every request through `db-foreign-keys.ts`
  middleware, which now also issues `PRAGMA foreign_keys = ON` through the Drizzle `execute()`
  wrapper instead of direct D1 — confirm this still runs per-request without measurable
  latency regression in staging before prod cutover.
