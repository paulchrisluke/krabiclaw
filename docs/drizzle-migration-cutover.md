# Drizzle Migration Cutover Runbook

Scope: rollout of the `drizzle-migration-95` branch — replaces the Kysely/`@atinux/kysely-d1`
Better Auth adapter with `drizzleAdapter` over `drizzle-orm/d1`, and migrates several
`server/utils/*` and `server/middleware/*` data-access call sites (`tenant-resolution.ts`,
`db-foreign-keys.ts`, `site-config.ts`, `media-asset-manager.ts`, `pageview-tracking.ts`,
`site-i18n.ts`, `site-locales.ts`, `api-response.ts`) from raw `D1Database.prepare()` calls
to the new `server/db` helpers (`createDb`, `queryFirst`, `queryAll`, `execute`).

This is a same-database migration (no new D1 instance, no destructive schema migration) —
the risk is in the *data-access layer rewrite*, not the schema.

---

## 1. Preconditions

Before starting staging verification or prod cutover today:

- [ ] Branch `drizzle-migration-95` is rebased on latest `main`.
- [ ] `server/db/schema.ts` matches the live D1 schema for the target environment. Run
      `yarn drizzle:check` against each target before deploying to it (see §2).
- [ ] No other engineer has an in-flight migration file pending apply on
      `krabiclaw-db-staging` or `krabiclaw-db` (production) — check
      `wrangler d1 migrations list DB --env staging --remote` and
      `wrangler d1 migrations list DB --remote`.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are
      set for the target environment (billing webhook changes are bundled in this diff —
      see §6 risk areas).
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
- [ ] Run `yarn fixture:pottery-house --url https://staging.krabiclaw.com --site-id site-pottery-house-krabi`
      per CLAUDE.md's canonical regression fixture before considering staging green.

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
  Drizzle migration and still talks to D1 directly via `db.prepare(...)` rather than the
  new `server/db` helpers. This widens the blast radius of today's deploy — if billing
  webhook validation fails post-cutover, don't assume it's Drizzle-related; check this
  diff specifically.
- **Mixed data-access patterns remain**: not all call sites were migrated — e.g. the
  `site_billing` lookup added in `handleSubscriptionUpdated` uses raw `db.prepare(...).bind(...).first()`
  against `D1Database` directly, side-by-side with `server/db`-helper call sites elsewhere
  in the same file/PR. This is fine functionally (both can coexist) but means the codebase
  is mid-migration — don't assume "if `server/db` exists, raw D1 calls are gone."
- **Schema Squashed**: All D1 migration files `0002` through `0009` have been squashed down into `0001_initial.sql` as part of this cutover to provide a single source of truth that perfectly matches `server/db/schema.ts`.
- **`cloudflareEnv()` now always constructs a Drizzle `db` instance** (`server/utils/api-response.ts`)
  even for requests that never touch it, adding a `createDb()` call (cached via `WeakMap`,
  so cheap, but worth confirming under load) to every request through `db-foreign-keys.ts`
  middleware, which now also issues `PRAGMA foreign_keys = ON` through the Drizzle `execute()`
  wrapper instead of direct D1 — confirm this still runs per-request without measurable
  latency regression in staging before prod cutover.
