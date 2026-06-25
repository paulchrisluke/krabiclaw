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

Migrations are managed via **wrangler D1 migrations** (hand-authored SQL) and are applied automatically on every deploy. Query access goes through **Drizzle ORM** (`server/db/schema.ts`, `server/db/index.ts`) — Drizzle is a query layer over the same D1 database, not a migration tool. `drizzle-kit` is only used for schema drift checking, never for generating or applying migrations.

1. To change the schema, create a new migration:

   ```bash
   wrangler d1 migrations create DB <description>
   ```

2. Edit the generated file in `migrations/`. Write only the delta: `ALTER TABLE`, `CREATE TABLE`, etc.

3. Update `server/db/schema.ts` by hand to match the new SQL — Drizzle's schema is not generated from migrations.

4. Apply locally to test:

   ```bash
   yarn schema:local
   ```

5. Run `yarn drizzle:check` (`drizzle-kit check`) to verify `server/db/schema.ts` hasn't drifted from the live D1 schema.

6. Migrations run automatically on deploy. `yarn deploy` runs:

   ```bash
   wrangler d1 migrations apply DB --remote
   ```

   before uploading the Worker.

7. Never write ad-hoc SQL files in `scripts/` for schema changes. They will not be tracked and can cause production outages.

8. Never use `drizzle-kit generate` or `drizzle-kit migrate` against this database — `migrations/*.sql` applied via wrangler is the only source of truth for schema changes.

9. Better Auth tables must use exact camelCase column names. App tables use snake_case.

10. Any schema change must be checked against current server queries (raw SQL and Drizzle alike) before finishing.

`migrations/0001_initial.sql` is the **squashed baseline** — all migrations up through the old numbering (including what was previously migration `0017`) were folded into it. Numbering restarted from `0001` after the squash. Each migration file after `0001_initial.sql` is the source of truth for its own delta. Do not reference pre-squash migration numbers (e.g. "migration 0017") as if they still exist as separate files — that history is now baked into `0001_initial.sql`.

**Squashing a migration history only updates the file on disk — it does not retroactively re-run against an environment that already applied an earlier version of that same filename.** `wrangler d1 migrations apply` tracks applied migrations by filename in the `d1_migrations` table, not by content/checksum. If `0001_initial.sql` is re-squashed to include newer tables/columns and a target environment already has an `0001_initial.sql` row recorded from a prior squash, `wrangler d1 migrations apply` will report "No migrations to apply!" and silently skip the new content. This has bitten production twice from the same squash: a whole missing table (`work_requests`/`platform_content_components`, fixed in `migrations/0002_...sql` via `CREATE TABLE IF NOT EXISTS`, safe since the table didn't exist yet) and missing columns on an *existing* table (`site_pageview_events.visitor_id/country/region/city`, fixed in `migrations/0003_...sql`). Missing columns are the harder case — D1's SQLite has no `ADD COLUMN IF NOT EXISTS`, so a plain `ALTER TABLE ADD COLUMN` would fail with "duplicate column" on any fresh environment that already has the column from the current `0001_initial.sql`. The fix is to pull the column(s) back out of `0001_initial.sql`'s `CREATE TABLE` and into their own numbered migration, so every environment — fresh or stale — picks them up exactly once. Before assuming any environment is schema-current, diff its actual `sqlite_master` tables *and* `PRAGMA table_info` per table against `server/db/schema.ts`, not just `wrangler d1 migrations list`.

---

## Multi-Tenancy

- Organizations map to a team or agency using Better Auth’s `organization` plugin.
- **One org can have multiple sites** — the unique-per-org constraint was removed pre-squash (was migration `0017`); this is now part of the `0001_initial.sql` baseline.
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
- `migrations/` — canonical D1 schema, numbered files; `0001_initial.sql` is the squashed base (renumbered, supersedes all pre-squash migration numbers)
- `server/db/schema.ts` — Drizzle ORM schema, hand-maintained to mirror `migrations/`; `server/db/index.ts` — `createDb()` and query helpers
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

---

## Plan System

- Plans:
  - `free` — Starter
  - `growth` — $49/mo
  - `managed` — $149/mo
  - `seo_accelerator` — $349/mo

- Stripe is the source of truth for plan names, prices, and `marketing_features`.
- `server/utils/billing.ts` → `getPlanEntitlements(plan)` defines what each plan unlocks in D1.
- Entitlements are stored **per-site** in the `site_entitlements` table (this superseded `organization_entitlements` pre-squash, was migration `0017`, now part of the `0001_initial.sql` baseline). The old `organization_entitlements` table still exists in the schema for legacy billing/credits data but is not used for plan entitlement checks.
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

- Dashboard pages use Nuxt UI layout primitives rather than custom Tailwind page shells.
- Use:
  - `UCard`
  - `UPage`
  - `UPageBody`
- Saya theme pages keep their established raw layout shell and theme-specific components, rather than being forced into dashboard page primitives.

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
