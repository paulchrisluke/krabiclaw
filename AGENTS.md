# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

---

## Platform Strategy — Dual Surface

KrabiClaw supports **both** the ChatGPT MCP app and the dashboard/ChowBot surfaces.
Content creation and editing may flow through:

- The MCP server (`server/api/mcp.post.ts`)
- Dashboard CMS pages
- ChowBot in the dashboard
- ChowBot over WhatsApp where applicable

The dashboard is still the home for:

- Billing and plan management
- Organization settings: domains, members, general
- Inbox triage: contact submissions, reservations, reviews
- Work requests and support
- Analytics overview

ChowBot and dashboard CMS are supported product surfaces. Keep MCP and ChowBot aligned on the same backend source of truth; do not fork business logic or create shadow data models.

`server/utils/chowbot-media.ts` remains valid shared infrastructure for media-driven menu import. Rename it when refactoring if a better shared name becomes obvious.

**Image generation** uses ChatGPT's native `image_generation` Responses API tool.

- Model: `gpt-image-1` or `gpt-image-2`
- Do not use DALL-E
- Output is base64 in `image_generation_call.result`, but do NOT pass that base64 to MCP tools — OpenAI's safety scanner blocks tool calls carrying raw base64 image data
- MCP flow:
  1. Generate natively with `image_generation`
  2. Call `save_generated_image_file({ site_id, attachment_id: <file-reference>, prompt })` — pass the generated image as a file reference (not raw base64)
  3. Call `show_generated_images` with returned `assetId` and `publicUrl`

Canonical generated-image contracts:
- Native generation: `save_generated_image_file({ site_id, attachment_id, prompt })` — always use this after `image_generation`; passing base64 to `save_generated_image` is blocked by OpenAI safety checks
- Raw base64 (non-native, rare): `save_generated_image({ site_id, image_data_base64, prompt })`

Do not pass raw local file paths like `/mnt/data/...` to MCP tools.

Dashboard CMS pages remain supported. When changing editing behavior, prefer shared server/domain utilities so MCP, dashboard CMS, ChowBot, and WhatsApp all operate on the same canonical state.

---

## Database Schema Workflow

`server/db/schema.ts` (Drizzle ORM) is the **source of truth** for new schema changes. `migrations/0001_initial.sql` through `migrations/0007_*.sql` are historical, hand-authored, **already applied to every real environment (staging, production) and immutable** — never rename, edit, renumber, or re-squash them. From `0008` onward, migrations are *generated* from `schema.ts` via `drizzle-kit generate` and applied via wrangler D1 migrations.

**Why the split:** `wrangler d1 migrations apply` tracks applied migrations by **filename**, not content/checksum. An environment that already ran `0001_initial.sql`...`0007_*.sql` has those exact filenames recorded — it has no idea a squashed `0000_something.sql` is "the same" schema. Renaming/squashing history that's already applied anywhere makes wrangler treat the new file as unapplied and try to re-run it, immediately failing with `table X already exists`. There is no clever flag around this; the only safe move is to never touch an already-applied filename and always add new migrations with higher numbers.

`migrations/meta/0007_snapshot.json` + `migrations/meta/_journal.json` are drizzle-kit's own bookkeeping — a snapshot of what `schema.ts` looks like as of migration `0007`, established once so `drizzle-kit generate` has something to diff against. **There is no `0007_snapshot.sql` file and there shouldn't be one** — the snapshot exists purely so future generates produce a small incremental diff instead of a full from-scratch recreation. Never hand-edit `migrations/meta/*` except when deliberately re-establishing this baseline (see "Re-establishing the baseline" below).

1. Edit `server/db/schema.ts` by hand to make the schema change (add a column, table, constraint, etc.).

2. Generate the migration:

   ```bash
   yarn db:generate
   ```

   This runs `drizzle-kit generate`, diffs `schema.ts` against `migrations/meta/`, and writes a new `migrations/0008_<name>.sql` (then `0009`, `0010`, ...) plus an updated snapshot/journal in `migrations/meta/`. Because the journal's baseline entry is pinned at `idx: 7`, every new generate continues from `0008` — it will never collide with `0001`-`0007`.

3. **`drizzle-kit generate` only emits what's declared in `schema.ts` — nothing else.** It cannot generate:
   - **Triggers** (`CREATE TRIGGER`) — drizzle-orm has no concept of them.
   - **CHECK constraints** — not modeled in this codebase's `schema.ts`; enforce these at the API/Zod layer instead.
   - **Indexes and unique constraints that aren't explicitly declared** — drizzle only emits an index/unique if the column or table builder says so. Model every constraint you need directly in `schema.ts`:
     - Single column: `.unique()` on the column builder (e.g. `slug: text().unique()`).
     - Composite unique: a third-arg callback on `sqliteTable(name, columns, (table) => [unique("name").on(table.a, table.b)])`.
     - Composite primary key: same pattern with `primaryKey({ columns: [table.a, table.b] })` instead of single-column `.primaryKey()`.
     - Partial/`WHERE`-qualified unique index: `uniqueIndex("name").on(table.a, table.b).where(sql\`location_id IS NULL\`)`.
   - If you need a trigger or a `CHECK`, **hand-append it to the generated `migrations/000N_*.sql` file** after running `db:generate`, before applying/committing.

4. Apply locally to test:

   ```bash
   yarn schema:local
   ```

5. Run `yarn drizzle:check` (`drizzle-kit check`) to verify `server/db/schema.ts` hasn't drifted from the live D1 schema. This only checks table/column shape — it will not catch a missing trigger or hand-appended `CHECK`, since those aren't part of what drizzle tracks.

6. Migrations run automatically on deploy. `yarn deploy` runs:

   ```bash
   wrangler d1 migrations apply DB --remote
   ```

   before uploading the Worker.

7. Never write ad-hoc SQL files in `scripts/` for schema changes. They will not be tracked and can cause production outages.

8. Better Auth tables must use exact camelCase column names. App tables use snake_case.

9. Any schema change must be checked against current server queries (raw SQL and Drizzle alike) before finishing.

10. Never define a `d1_migrations` table in `schema.ts`. Wrangler creates and owns that table itself to track applied migrations; if `schema.ts` also declares it, the generated migration tries to `CREATE TABLE d1_migrations` (or, worse, `DROP TABLE d1_migrations` if it's later removed from `schema.ts`) and collides with or destroys wrangler's own copy.

11. After any `db:generate`, do a full local round-trip before trusting the migration: wipe `.wrangler/state/v3/d1`, run `yarn schema:local`, then run the relevant `yarn seed:*` command. A migration that "applies cleanly" can still silently drop a trigger or default that only a real seed run will surface (see incident below).

### Re-establishing the baseline (rare — only if `migrations/meta/` is ever lost or corrupted)

The baseline snapshot was created once by running `yarn db:generate` against an *empty* `migrations/meta/`, then **discarding the generated `.sql` file** (it would just recreate every existing table — never apply it) and keeping only the snapshot/journal, with the journal's single entry hand-edited to `idx: 7` / `tag: "0007_baseline"` (matching the count of real, already-applied files) so the *next* real generate continues at `0008` instead of colliding with `0001`-`0007`. Re-derive the same way if this ever needs to be redone, and bump the `idx` to match however many numbered migration files actually exist at the time.

**Incident — 2026-06-25.** A migration was squashed by running `drizzle-kit generate` straight from `schema.ts` and committing the output as a new baseline (`migrations/0000_living_blockbuster.sql`), replacing `0001_initial.sql`-`0007_*.sql`. Two independent problems surfaced:

1. **Wrangler's filename-tracking broke staging.** `krabiclaw-db-staging` already had `0001`-`0007` recorded as applied. The renamed `0000_living_blockbuster.sql` was an unfamiliar filename, so wrangler tried to apply it fresh and failed immediately with `table account already exists`. This broke the `E2E staging` CI job on every push. The fix was a straight revert of the squash on `staging` — the underlying database was never actually corrupted (D1 rolls back a failed migration file atomically and never records it), only the deploy step was broken.
2. **`drizzle-kit generate` silently drops anything not declared in `schema.ts`.** Because `schema.ts` had never been annotated with `.unique()`/composite-unique/composite-PK, and triggers/`CHECK`s aren't representable in it at all, the generated squash was missing: every `sync_media_assets_old_*` trigger (which is what kept the legacy `media_assets_old` FK target populated), the `trg_chowbot_*` consistency triggers, ~60 unique/performance indexes (uniqueness on `user.email`, `sites.slug`/`subdomain`, `organization.slug`, Stripe IDs, etc.), and the composite `PRIMARY KEY` on `site_config`. Separately, three boolean columns (`menu_items.featured`, `experiences.featured`, `site_locales.is_source`) had silently lost their `DEFAULT false` in `schema.ts` itself — omitting them in a seed insert hit `NOT NULL` with no default, which `INSERT OR IGNORE` swallows without error, leaving rows missing and causing downstream FK failures that looked unrelated. None of this was caught by `drizzle:check`, which only diffs table/column shape.

The fix that stuck: revert the squash, keep `0001`-`0007` exactly as they are, model every constraint drizzle supports directly in `schema.ts` (step 3), and establish the `meta/` baseline (above) so future changes generate additively as `0008+`. **Lesson: a migration that applies without error is not proof it's correct — always do a full wipe + reapply + reseed locally (step 11) before trusting a generated migration, and never rename or squash a migration filename that any real environment has already applied.**

### D1 does not support raw transactions

Cloudflare D1 rejects `BEGIN`/`COMMIT`/`ROLLBACK` sent as raw SQL, full stop — it doesn't matter whether they're sent through Drizzle's `.run()` (`execute(db, 'BEGIN')` from `server/db/index.ts`) or directly on the raw binding (`db.exec('BEGIN IMMEDIATE TRANSACTION')`). Confirmed locally: `wrangler d1 execute DB --local --command "BEGIN IMMEDIATE TRANSACTION;"` fails with `D1_EXEC_ERROR: ... please use the state.storage.transaction() ... instead of the SQL BEGIN TRANSACTION`. This is not a local-emulator quirk — D1 is backed by Durable Object storage in both local and production, and neither supports session-level transaction control this way.

- The only real cross-statement atomicity primitive is `db.batch([...])`, wrapped as `executeBatch()` in `server/db/index.ts`. It requires the full statement list up front — it can't interleave with reads whose results determine later statements in the same call.
- For write sequences that need to react to intermediate results (e.g. insert, then a dependent lookup, then a conditional update), don't wrap them in a fake transaction — just run the statements sequentially and, if a later step fails, do manual compensating cleanup (delete/undo the earlier writes) in a `catch` block. This is the pattern used throughout the codebase (`post-management.ts`, most of `domains.ts`) and is what `createPlatformBlogPost` was reverted to.
- **Incident — 2026-06-27.** Commit `ca8f5a6` ("Fix blog content and schema regressions") wrapped `createPlatformBlogPost`/`updatePlatformBlogPost`/`deletePlatformBlogPost` in `server/utils/platform-content.ts` with `execute(db, 'BEGIN')`/`'COMMIT'`/`'ROLLBACK'`. This silently broke every platform *and* tenant blog mutation (`create_blog_post`, `update_blog_post`, `set_blog_post_image`, `delete_blog_post`, and the platform-only equivalents all funnel through these same three functions, scoped by `site_id`) with a generic MCP `-32603` internal error — reads were unaffected, which is what made it look narrower than it was. `server/utils/domains.ts` (`setCanonicalDomain`, `createCustomDomainPair`) and `server/api/sites/[siteId]/domains/[domainId].patch.ts` (disable-domain path) had the same `db.exec('BEGIN...')` pattern from an earlier, unrelated change and were fixed the same way. **Lesson: if a D1 write path wraps multiple statements in `BEGIN`/`COMMIT`, it is broken — verify with a local `wrangler d1 execute --local` repro before trusting either the bug report or a proposed fix, don't reason about it from code alone.**

---

## Multi-Tenancy

- Organizations map to a team or agency using Better Auth’s `organization` plugin.
- **One org can have multiple sites** — there is no unique-per-org constraint on sites.
- Each site has its own plan and Stripe subscription (`site_billing` table).
- The Stripe *customer* stays at the org level (`organization_billing.stripe_customer_id`) — one payment method per team.
- Multiple physical locations live under `business_locations`, not separate orgs. Locations are **unlimited on all plans**.
- Dashboard route shape (site is always explicit — no implicit "first site in org"):
  - `/dashboard/{orgSlug}` — org root; lists sites, auto-redirects to the single site if the org has exactly one
  - `/dashboard/{orgSlug}/sites/{siteSlug}` — site workspace (`siteSlug` is the site's `subdomain`)
  - `/dashboard/{orgSlug}/sites/{siteSlug}/{locationSlug}` — location workspace
  - `/dashboard/{orgSlug}/sites/new` — create another site under this org
  - `/dashboard/{orgSlug}/~/settings/*` — org settings (billing, members, general, domains, chatgpt — these stay org-scoped, not site-scoped)
  - `/dashboard/account/settings` — personal settings
- The active site is resolved server-side in `server/utils/dashboard-context.ts` from the `x-dashboard-site-slug` header, which `plugins/dashboard-site-header.client.ts` auto-attaches to every `/api/dashboard/*` request based on the current route's `siteSlug` param. This plugin is client-only by design — it works by overriding `globalThis.$fetch` (bare `$fetch()` calls everywhere resolve to that global, not to a nuxtApp-provided one), which is only safe in the single-tenant-per-tab browser context, not on the server where `globalThis` is shared across concurrent requests in the same Worker isolate. Do not add new dashboard API calls that bypass this, and do not try to "fix" SSR by moving this override server-side. When the header is missing, `getDashboardContext()` auto-selects the org's sole site if it has exactly one, and otherwise returns `null` (or throws `400` when the caller passed `requireSite: true`) — it does not fall back to the org's oldest site; guessing among multiple sites was an intentional removal to prevent the silent-wrong-site risk.
- Second-site billing: a new site always starts on `free`. If the org already has another site on a paid plan and a saved card on file, the dashboard offers to auto-subscribe the new site via `POST /api/billing/site-subscribe` (confirm modal, no Checkout redirect). Otherwise it's a normal Checkout upgrade later. See `server/utils/site-creation.ts`.
- **Site transfers move only the site** — `executeSiteTransfer()` reparents one site's scoped tables (`site_billing`, `site_entitlements`, `business_locations`, content, etc.) from the source org to the recipient's existing owner org. The org itself, its other sites, and org-level billing/credits never move.

- Tenant resolution lives in `server/middleware/tenant-resolution.ts`:
  - `localhost` / `krabiclaw.com` = platform routes
  - `*.krabiclaw.com` or custom domains = tenant sites
  - On `*.workers.dev` preview Workers, `x-preview-tenant: <slug>` header carries tenant identity because the browser cannot spoof subdomains against a single-level wildcard cert.

---

## Analytics

There are three independent analytics layers — do not conflate them or assume one supersedes another:

1. **Platform GA4** (`G-NJ1BSP9BYG`, injected in `app.vue`) — KrabiClaw's own marketing-site property, fires only when `isPlatform` is true. This is the only GA4 stream KrabiClaw owns.
2. **Per-tenant connected GA4** — a site owner links their own GA4 property via the OAuth flow in `server/utils/google-analytics.ts` / `server/api/sites/[siteId]/integrations/google-analytics/`. The resulting `ga4_measurement_id` lands in `site_config` (already exposed publicly via bootstrap's `config` object — no extra plumbing needed) and `app.vue` injects it as that tenant's own gtag tag. Sites with no connection get no tag from this layer.
3. **Internal pipeline** (`site_pageview_events` → `aggregateAnalyticsForDate()` → `site_analytics_daily`) — powers each site's own dashboard "Analytics overview" tab. Tracked via `server/middleware/zz-pageview-tracking.ts` (SSR) and `plugins/pageview-tracking.client.ts` (SPA navigation + duration ping), using the `kc_visitor_id` (2yr)/`kc_session_id` (30min sliding) anonymous cookie pair defined in `server/utils/pageview-tracking.ts`. This is intentionally not a Better Auth session — anonymous visitors must never create rows in `user`/`session`.

There used to be a fourth "platform-wide rollup GA4" (`G-Z18L1Y4G7K`, via `nuxt.config.ts` `scripts.registry.googleAnalytics`) — removed 2026-06-25. It was never an owned property; the "intentional cross-tenant rollup" rationale was a retroactive guess, not a real decision. Do not re-add it.

### Stripe → GA4 (billing lifecycle events)

`server/utils/ga4-measurement-protocol.ts` sends server-side events into the platform GA4 property (`GA4_MEASUREMENT_ID`/`GA4_API_SECRET` env vars) from `server/api/billing/webhook.post.ts` — this is the only correct place to fire billing-truth GA4 events, not the browser, since only the webhook knows a payment actually succeeded/failed/renewed.

- `subscription_created` — fires on `checkout.session.completed` for standard plan checkouts. This is the revenue-confirming event; `checkout_started` (browser-side, `useAnalytics.ts`) only signals intent.
- `plan_upgraded` / `plan_downgraded` — fires on `customer.subscription.updated` when the resolved plan differs from the previously stored `site_billing.plan`, ranked via `PLAN_RANK` in the webhook handler.
- `subscription_cancelled` — fires on `customer.subscription.deleted`.
- `payment_failed` — fires on `invoice.payment_failed` (tracked, but not a GA4 key event — it's a churn signal, not a conversion).

Identity stitching: `getGaClientId()` in `composables/useAnalytics.ts` reads the GA4 `_ga` cookie client-side and is passed as `gaClientId` into `POST /api/billing/checkout`, which stores it as `ga_client_id` in both the Checkout Session metadata and `subscription_data.metadata` so it survives into every later webhook event for that subscription. Without a `client_id`, GA4 Measurement Protocol events still land but can't join back to the browsing session that started checkout.

Recommended GA4 key events: `sign_up`, `checkout_started`, `subscription_created`, `plan_upgraded`, `onboarding_completed`. Do not mark `subscription_cancelled` or `payment_failed` as key events — they're churn/diagnostic signals, not conversions.

---

## File Conventions

- `server/utils/auth.ts` — `createAuth(env)` — always takes full CF env
- `server/utils/api-response.ts` — `cloudflareEnv(event)` — use for all server env/DB access
- `server/middleware/tenant-resolution.ts` — runs on every request
- `lib/auth-client.ts` — client-side Better Auth instance
- `composables/` — Nuxt auto-imported
- `migrations/` — D1 schema; `0001`-`0007` are historical and immutable, `0008+` are generated from `server/db/schema.ts` via `yarn db:generate`; `migrations/meta/` is drizzle-kit's own bookkeeping, never hand-edited except when re-establishing the baseline
- `server/db/schema.ts` — Drizzle ORM schema, the source of truth for `migrations/`; `server/db/index.ts` — `createDb()` and query helpers
- `seed-definitions/demo.ts` — typed source of truth for the hybrid platform demo tenant
- `seed-definitions/pottery-house.ts`, `seed-definitions/kikuzuki.ts` — client site seed definitions
- `scripts/generate-demo-seed.ts` — ephemeral demo seed generator; applies from `/tmp`, never from a checked-in SQL file
- `scripts/archive/` — historical one-off migration scripts only; do not wire archived tooling back into package scripts or routine workflows

### Seed Insert Strategy

Seeds use a two-tier insert strategy so that MCP edits survive a reseed:

- **Structure tables** (`sites`, `site_config`, `site_locales`, `site_domains`, `media_assets`, `business_locations`, `menus`, `experiences`) → `INSERT OR REPLACE` — idempotent config, safe to overwrite
- **Content tables** (`site_content`, `menu_items`, `reviews`, `location_qa`, `posts`, `post_channel_jobs`, `*_translations`) → `INSERT OR IGNORE` — first seed wins; MCP changes are never overwritten by a reseed

Production is never reseeded (only migrated), so this only affects local dev, preview, and staging. If you need to force-push updated content from a seed definition to an already-seeded environment, delete the affected rows first or use an MCP tool call directly.
- Layout name for Saya theme pages: `layout: 'saya'`
- `tenant` layout is dead

---

## Media Contract

- Images must use the Cloudflare Images flow:
  1. Request an upload URL from `/api/editor/sites/[siteId]/media/request-upload`
  2. Upload directly from the browser
  3. Persist `provider = 'cloudflare_images'`

- Videos and other files must use the Worker-streamed `/api/editor/sites/[siteId]/media/upload` path and persist `provider = 'cloudflare_r2'`.
- Do not use `external_url` for curated fixtures, approved client imports, or template-generated tenant media.
- Do not commit tenant media under `public/images/*` or `public/videos/*`.
- Demo/reference assets may start from external sources during research, but seeded or imported tenant state must download them, upload them to Cloudflare, and serve the Cloudflare URL only.
- Seeded tenant-facing URLs include:
  - `media_assets`
  - `site_content` image/video fields
  - Review avatars
  - Post thumbnails
  - Any similar content blocks

---

## Local Testing

- Dev login bypasses OAuth:

  ```text
  http://localhost:3000/api/dev/login
  ```

  This only works in `import.meta.dev` and creates a session for the first local D1 user.

- Dev login in CI/E2E:

  ```http
  GET /api/dev/login
  ```

  with `x-dev-route-secret` header.

  Enabled by:
  - `E2E_ALLOW_DEV_ROUTES=true`
  - `E2E_DEV_ROUTE_SECRET`

  in `wrangler.toml [env.preview.vars]` and `[env.staging.vars]`.

  Never pass the secret in query params.

- To test `/admin` locally, promote a user:

  ```bash
  yarn wrangler d1 execute DB --local --command "UPDATE user SET role = 'admin' WHERE lower(email) = 'your@email.com';"
  ```

- Stripe webhooks:

  ```bash
  yarn stripe:listen
  ```

  Run this in a second terminal. Use the CLI-output signing secret as `STRIPE_WEBHOOK_SECRET` in `.env` during local dev only.

---

## CI / E2E Architecture

Three tiers exist, each with a dedicated Worker and URL.

### e2e-smoke

Runs on every PR.

Flow:

1. Build
2. `wrangler deploy --env preview`
3. Seed `krabiclaw-db-preview`
4. Run the full E2E suite against `preview.krabiclaw.com`

`PLAYWRIGHT_PREVIEW_URL` is hardcoded to that URL. `playwright.config.ts` skips `webServer` when it is set.

### e2e-staging

Runs on push to the `staging` branch.

Flow:

1. Build
2. `wrangler deploy --env staging`
3. Seed `krabiclaw-db-staging`
4. Run the full E2E suite against `staging.krabiclaw.com`

This is the pre-production gate before staging is merged to main. Keep real assertions here. Only fix staging-only false negatives. Do not casually trim coverage.

### prod-deploy

Runs on push to `main`.

Flow:

1. Apply D1 migrations
2. `wrangler deploy` to production `krabiclaw`
3. Run `prod-smoke`
4. Run canaries against production routes/domains that are intentionally live

### CI Environment Rules

- Cloudflare credentials are scoped only to the specific steps that perform Cloudflare actions:
  - `wrangler deploy`
  - `wrangler d1 *`
  - Canaries

- Never put `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in the top-level job `env:`.
- All E2E jobs require:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

- Without Stripe env vars, billing API calls return 503 and console-error assertions fail.
- Remote staging seeds must be idempotent. Repeated runs must reseed without unique-key collisions like `sites.subdomain`.
- Production smoke must not include intentionally disabled paid customer domains.
- As of June 9, 2026, `www.potteryhousekrabi.com` is intentionally disabled and excluded from `prod-smoke`.
- The free tenant host `pottery-house.krabiclaw.com` remains covered.

---

## MCP

- Nuxt UI MCP server is required for building UI components with Nuxt UI integration.
- Content creation and editing must go through the KrabiClaw MCP server.
- Do not build parallel dashboard CMS flows when the equivalent MCP tool should be the primary surface.
- Client MCP and ChowBot share one curated conversational surface policy in `server/utils/conversational-tool-surface.ts`. Do not add one-off tools to either surface without updating `docs/tool-parity.md`. Translations/locales, social/OAuth publishing, domains, and managed-service work requests are hidden by default and require explicit `CONVERSATIONAL_TOOLS_*_ENABLED=true` flags before they are exposed.

---

## Plan System

- Plans:
  - `free` — Starter
  - `growth` — $49/mo
  - `managed` — $149/mo
  - `seo_accelerator` — $349/mo

- Stripe is the source of truth for plan names, prices, and `marketing_features`.
- `server/utils/billing.ts` → `getPlanEntitlements(plan)` defines what each plan unlocks in D1.
- Entitlements are stored **per-site** in the `site_entitlements` table (this superseded `organization_entitlements`). The old `organization_entitlements` table still exists in the schema for legacy billing/credits data but is not used for plan entitlement checks.
- Billing is **per-site** via `site_billing`. Checkout must pass `site_id` in Stripe session metadata.
- Key entitlement keys:
  - `custom_domains`
  - `google_business`
  - `translation`
  - `translation_languages`
  - `ai_credits`
  - `managed_service`
  - `seo_accelerator`
- `max_locations` and `max_sites` entitlements no longer exist — locations are unlimited on all plans.

- `managed_service = true` on Growth, Managed, and SEO Accelerator (Starter/free is the only tier without it).
- `managed_service` gates Facebook sync auth/publish/sync endpoints, and the Support page's work-request queue.
- Entitlement checks must use `hasSiteEntitlement(db, siteId, key)` against the specific site in scope — never the org-level `hasEntitlement()` shim when a `siteId` is already available, since that shim resolves to the org's oldest site and can silently check the wrong site's plan in a multi-site org.
- `plans.get.ts`:
  - Only Starter has a static definition
  - All paid plans come from Stripe exclusively
  - Returns 503 if `STRIPE_SECRET_KEY` is not set

- `PLAN_CTA` map in `plans.get.ts` holds CTA labels/hrefs. This is app config, not Stripe data.
- Seeder:

  ```bash
  node scripts/seed-stripe.mjs
  ```

  The seeder is idempotent, upserts products, and updates `marketing_features`.

---

## Managed Service Queue

- `work_requests` table fields:
  - `type`
  - `title`
  - `description`
  - `status`
  - `priority`
  - `source`
  - `notes`
  - `assigned_to`

- Restaurant owners submit requests through:

  ```http
  POST /api/dashboard/work-requests
  ```

- Admins manage the queue through:

  ```http
  GET /api/admin/work-requests
  PATCH /api/admin/work-requests/[id]
  ```

- Admin Work Queue tab shows all requests with:
  - Type icons
  - Priority badges
  - Inline status dropdown

- Dashboard Support page:

  ```text
  /dashboard/[orgSlug]/support
  ```

  Free plan users see an upsell. Paid plan users see the request form and request history.

- Managed-service intent handling belongs in the MCP-native flow or explicit dashboard work-request endpoints.

---

## Admin Workspace

- `/admin` route is gated by `middleware/admin.ts`.

- `middleware/admin.ts` calls:

  ```http
  GET /api/auth/get-session
  ```

  using `useRequestFetch()` to forward cookies during SSR.

- Access requires both:
  - `user.role = 'admin'` in DB
  - Server-side `isPlatformAdmin()` check aligned to the Better Auth global admin role

- Admin navigation is defined in `adminNavigation` computed in `layouts/dashboard.vue`.

- Admin nav uses:
  - `i-lucide-*` icons
  - `?tab=` query params
  - Explicit `active` computed

- Tabs:
  - Work Queue
  - Add-ons
  - Clients
  - Members
  - Analytics
  - Domains
  - Users
  - Content
  - Blog

- Add-ons are backed by `service_addon_purchases`.

- Post-login routing:

  ```http
  GET /api/post-login
  ```

  - `isPlatformAdmin()` → `/admin`
  - Else → `/dashboard/[orgSlug]`

- Dev login:

  ```http
  GET /api/dev/login
  ```

  redirects to `/api/post-login`.

---

## Design System Enforcement

**Nuxt UI is the default for the dashboard, not a blanket rule for the whole app.** Dashboard/admin surfaces (auth-gated, not part of any tenant's public page weight) should keep using Nuxt UI. Saya's public, high-traffic surface (header/footer and anything else rendered on every tenant page load) is being moved off Nuxt UI's interactive components on purpose — see below.

- Dashboard pages use Nuxt UI layout primitives rather than custom Tailwind page shells.
- Use:
  - `UCard`
  - `UPage`
  - `UPageBody`
- Saya theme pages keep their established raw layout shell and theme-specific components, rather than being forced into dashboard page primitives.

### Saya public surface — prefer native Tailwind + Vue over Nuxt UI

Lighthouse isolation testing (`pages/dev/perf-text.vue`, see `docs/page-speed-debugging-methodology.md`) showed Nuxt UI's interactive components (`UButton`, `UDropdownMenu`, `UIcon`) are the real cost behind `SayaHeader`/`SayaFooter`'s LCP/FCP/TTI regression versus a plain-text baseline — not markup size or any single icon. Reka UI's primitives (floating-ui, focus-trap, etc.) add ~19-22 modulepreloads and ~70-80KB transfer to every tenant page load, since header/footer render on every route.

- On Saya's public component tree (`components/saya/**`), prefer plain `<button>`/`<NuxtLink>`/`<a>` + Tailwind classes over `UButton`, and inline SVG over `UIcon`, for anything in the always-rendered header/footer path. This is a *perf-driven exception* to the Nuxt UI default, scoped to public/high-traffic Saya components — it does not apply to the dashboard, to Saya's own auth-gated dashboard-CMS edit affordances, or to low-traffic Saya pages that aren't part of every page load.
- For dropdowns/menus on this surface, use `components/saya/SayaDropdown.vue` — a small headless local component (open/close, click-outside, Escape, arrow-key nav, ARIA) built specifically to replace `UDropdownMenu` without pulling in Reka. Reuse it rather than reaching for `UDropdownMenu` or hand-rolling another dropdown.
- Before replacing more Nuxt UI usage on this surface, re-measure with the same isolation-mode + modulepreload-count method (compare `.output` production build via local `wrangler dev`, not the Vite dev server — dev mode doesn't emit `modulepreload` tags) to confirm the change is actually load-bearing, not just done on suspicion.
- This does not extend to Saya pages/components outside the always-rendered header/footer path unless the same measurement shows a real win there too — don't preemptively de-Nuxt-UI-ify Saya wholesale.

- UCard `:ui` prop only accepts:
  - `root`
  - `header`
  - `title`
  - `description`
  - `body`
  - `footer`

- Use `class` on the element for all other styling:
  - Border
  - Background
  - Rounded
  - Shadow

- Dashboard pages do not use `UPageHeader`.
- Dashboard page content goes directly in `UPageBody`.
- Saya public pages should preserve the existing editorial layout pattern, using `div` / `section` wrappers and Saya components where that surface already has an established convention.
- Admin nav uses `i-lucide-*` icons and must stay consistent with the rest of the dashboard nav.
- Do not introduce custom `border` or `bg` classes that break global theme inheritance.
- If a specific visual layout is needed, such as a flat Vercel card, use the Nuxt UI component and override specific tokens through `:ui`.

Example:

```vue
<UCard :ui="{ shadow: '', rounded: 'rounded-xl', body: { padding: 'p-0' } }">
```

---

## Saya Empty States

Saya components never render a blank section or a skeleton-only placeholder when content is missing. Every core list-style section (menu items, experiences, locations) shows a **filled example** — realistic placeholder content shown directly on the live site, matching Shopify's unconfigured-storefront pattern (e.g. "Example product title", "$19.99 USD"). Supplementary sections (posts, reviews, Q&A) use a low-key icon+message empty state instead — see below.

- `config/saya-empty-states.ts` is the single source of truth for example content and ChowBot prompt hints, one entry per section. Add new sections here, not inline in components.
- `components/saya/SayaEmptyExample.vue` renders one example card; `components/saya/SayaMcpHint.vue` renders the owner-only "Try: ..." affordance that pre-fills and opens ChowBot via `useChowBot().setDraftMessage()` + `.open()`.
- The hint only renders in dashboard edit mode (`useEditMode().editMode`, i.e. `?edit=true`) — real site visitors only ever see the clean example, never the hint UI.
- Filled examples are only for **core** sections (menu, experiences, locations) where an empty section usually means an unfinished site. **Supplementary/optional** sections (posts, reviews, Q&A) use the low-key icon+message empty state instead — a live, fully-operational business may legitimately never post updates or get reviews, so a fabricated "Example post title" shown to a real visitor would incorrectly imply the site is broken. Posts/Reviews/Q&A still get a hint when merchant-actionable (posts, Q&A; not reviews, which aren't merchant-authored).
- `config/content-registry.ts` field `defaultValue` is the render-time fallback for scalar `site_content` fields (`usePageContent().getField()` falls back to it automatically when no value is in the DB and the caller passes no explicit default). **These must always be generic, vertical-neutral copy** — never tenant- or demo-identity-specific text (no business names, no "Saya Kitchen", no real addresses/phone numbers). The "Saya fallback copy on any tenant page" regression below is about leaking *demo-tenant identity*, not about having a generic instructional fallback — a generic fallback rendering on an empty tenant page is the intended behavior, not the regression.

---

## Client Onboarding Pipeline

### Canonical Command

Use this for every new client. No manual SQL. No ad-hoc seeds.

```bash
yarn client:onboard \
  --slug pottery-house-krabi \
  --vertical experience \
  --maps-url "https://www.google.com/maps/place/Pottery+House+Krabi/..." \
  --maps-url "https://www.google.com/maps/place/Beachfront+Pottery+Krabi/..." \
  --images ./new-client-Pottery-House-Krabi \
  --live-url https://pottery-house.krabiclaw.com \
  --site-id site-pottery-house-krabi \
  --remote
```

Or load from a YAML intake file:

```bash
yarn client:onboard --from client-intake/pottery-house-krabi.yml
```

### Intake File Format

`client-intake/<slug>.yml`:

```yaml
slug: pottery-house-krabi
vertical: experience
live_url: https://pottery-house.krabiclaw.com
site_id: site-pottery-house-krabi
maps_urls:
  - https://www.google.com/maps/place/Pottery+House+Krabi/...
  - https://www.google.com/maps/place/Beachfront+Pottery+Krabi/...
images_dir: ./new-client-Pottery-House-Krabi
notes: |
  Use client photos only. No restaurant copy.
```

---

## LLM Operating Rule — Client Sites

Never manually seed, patch D1, invent client data, use stock images, leave tenant media on third-party hosts, or claim deployment success for a client site.

A site is not complete until `client:verify` passes and `client-handoff.md` is generated.

Required pipeline:

1. `client:import --dry-run` — fetch real data, scan real images, generate reviewable manifests
2. Human review of `client-imports/<slug>/`
3. `client:import --approve` — sign the manifest hash
4. `client:import --apply` — execute only the approved seed
5. `client:verify` — all checks must pass
6. `client:deploy` — for production, seed remote D1, deploy Worker, verify live

If any step fails, fix the source of truth:

- API data
- Schema
- Theme copy

Do not add frontend workarounds.

---

## Pottery House Krabi — Canonical Regression Case

The Pottery House Krabi onboarding incident is the canonical failure reference.

These failures must never recur:

- Stock photos when client photos exist
- Restaurant copy on an experience vertical:
  - “Come dine with us”
  - “Reserve a table”
  - “From the kitchen”

- Saya fallback copy, including “Also part of Saya,” on any tenant page
- Wrong phone/email fallback from Saya demo data
- Experience detail route rendering the index page because of a Nuxt nested routing conflict
- Image 404s serving from `bootstrap` response
- Manual D1 mutations outside the approved `client:apply` path

Run the regression fixture before merging any PR that touches `scripts/` or `components/saya/`:

```bash
# Requires a local dev server seeded with pottery house data
yarn fixture:pottery-house --url http://localhost:3000 --site-id site-pottery-house

# Against staging — the fixture auto-sends x-preview-tenant since staging's
# wildcard TLS only covers one subdomain level; --slug must be passed too
yarn fixture:pottery-house --url https://staging.krabiclaw.com --site-id site-pottery-house --slug pottery-house
```

The client was originally intake'd as "pottery-house-krabi" but is live under the shorter `pottery-house` slug/site id — use the live identifiers above, not the original intake name.

---

## Custom Domains

Custom domain onboarding is automated through:

```http
POST /api/sites/[siteId]/domains
```

The dashboard exposes this at:

```text
/dashboard/[orgSlug]/~/settings/domains
```

### Architecture — Cloudflare for SaaS + Workers

- `customers.krabiclaw.com` is the SaaS fallback origin.

- It must be:

  ```text
  A 192.0.2.1
  ```

  and proxied.

- Never make `customers.krabiclaw.com` a CNAME to `pages.dev` or `workers.dev`. That causes error 1014.

- Never make `customers.krabiclaw.com` a Worker Custom Domain. That causes Host header 403.

- `*/*` Worker route in `wrangler.toml` is required for custom hostname traffic to hit the Worker.

- Without the `*/*` Worker route, all custom hostname requests get 522.

- This route must stay in `wrangler.toml`; otherwise `wrangler deploy` will wipe it.

- SSL validation must use direct TXT records at `_acme-challenge.www`.

- Do not use the DCV delegation CNAME, `*.dcv.cloudflare.com`; that target times out.

- After provisioning, set:
  - `site_domains.role = 'canonical'` for the custom domain
  - `site_domains.role = 'secondary'` for the krabiclaw subdomain

- Tenant-routing middleware redirects to canonical.

- If the krabiclaw subdomain stays canonical, the custom domain bounces back.

### DNS Instructions for Clients

For GoDaddy or any external registrar:

1. `CNAME www → customers.krabiclaw.com`
2. `TXT _acme-challenge.www → <value1>` from the Cloudflare for SaaS API response
3. `TXT _acme-challenge.www → <value2>` second value, same name
4. Apex without `www`: use registrar HTTP forwarding:

   ```text
   potteryhousekrabi.com → https://www.potteryhousekrabi.com
   ```

   Registrar forwarding only works over HTTP. The browser handles the HTTPS hop after following the redirect.

Rules:

- Do not add a CNAME at the apex. Most registrars block it.
- Do not use the DCV delegation CNAME for SSL. It does not work.
- After adding TXT records, do not touch DNS again until the cert issues.
- Every PATCH to the custom hostname rotates the ACME tokens.
