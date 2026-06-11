# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

## Database Schema Workflow

Migrations are managed via **wrangler D1 migrations** — applied automatically on every deploy.

1. To change the schema, create a new migration: `wrangler d1 migrations create DB <description>`
2. Edit the generated file in `migrations/` — write only the delta (ALTER TABLE, CREATE TABLE, etc.)
3. Apply locally to test: `yarn schema:local`
4. Migrations run automatically on deploy: `yarn deploy` runs `wrangler d1 migrations apply DB --remote` before uploading the Worker
5. Never write ad-hoc SQL files in `scripts/` for schema changes — they will not be tracked and will cause production outages
6. Better Auth tables must use exact camelCase column names; app tables use snake_case
7. Any schema change must be checked against current server queries before finishing

The current canonical schema is `migrations/0001_initial.sql`. Each subsequent migration file is the source of truth for its delta.

---

## Multi-Tenancy

- Organizations map 1:1 with restaurant brands/workspaces (Better Auth `organization` plugin)
- One site per org — enforced by unique index on `sites(organization_id)`
- Multiple physical locations live under `business_locations` (not separate orgs)
- Dashboard route shape: `/dashboard/{orgSlug}` (restaurant workspace), `/dashboard/{orgSlug}/{locationSlug}` (location workspace), `/dashboard/{orgSlug}/~/settings/*` (org settings), `/dashboard/account/settings` (personal)
- Tenant resolution: `server/middleware/tenant-resolution.ts`
  - `localhost` / `krabiclaw.com` = platform routes
  - `*.krabiclaw.com` or custom domains = tenant sites
  - On `*.workers.dev` preview Workers: `x-preview-tenant: <slug>` header carries tenant identity (browser can't spoof subdomain against single-level wildcard cert)

---

## File Conventions

- `server/utils/auth.ts` — `createAuth(env)` — always takes full CF env
- `server/utils/api-response.ts` — `cloudflareEnv(event)` — use for all server env/DB access
- `server/middleware/tenant-resolution.ts` — runs on every request
- `lib/auth-client.ts` — client-side Better Auth instance
- `composables/` — Nuxt auto-imported
- `migrations/` — canonical D1 schema (numbered files; `0001_initial.sql` is the base)
- `seed-definitions/demo.ts` — typed source of truth for the hybrid platform demo's generated experience block
- `seeds/demo.sql` — checked-in demo seed; refresh generated demo experience content with `yarn seed:demo:generate`
- `scripts/archive/` — historical one-off migration scripts only; do not wire archived tooling back into package scripts or routine workflows
- Layout name for Saya theme pages: `layout: 'saya'` — `tenant` is dead

## Media Contract

- Images must use the Cloudflare Images flow: request an upload URL from `/api/editor/sites/[siteId]/media/request-upload`, upload directly from the browser, then persist `provider = 'cloudflare_images'`
- Videos and other files must use the Worker-streamed `/api/editor/sites/[siteId]/media/upload` path and persist `provider = 'cloudflare_r2'`
- Do not use `external_url` for curated fixtures, approved client imports, or template-generated tenant media
- Do not commit tenant media under `public/images/*` or `public/videos/*`
- Demo/reference assets may start from external sources during research, but seeded or imported tenant state must download them, upload them to Cloudflare, and serve the Cloudflare URL only
- Seeded tenant-facing URLs include `media_assets`, `site_content` image/video fields, review avatars, post thumbnails, and any similar content blocks

---

## Local Testing

- Dev login (bypasses OAuth): `http://localhost:3000/api/dev/login` — only works in `import.meta.dev`, creates session for first local D1 user
- Dev login in CI/E2E: `GET /api/dev/login` with `x-dev-route-secret` header — enabled by `E2E_ALLOW_DEV_ROUTES=true` + `E2E_DEV_ROUTE_SECRET` in `wrangler.toml [env.preview.vars]` and `[env.staging.vars]`. Never pass the secret in query params.
- To test `/admin` locally, promote a user: `yarn wrangler d1 execute DB --local --command "UPDATE user SET role = 'admin' WHERE lower(email) = 'your@email.com';"`
- Stripe webhooks: run `yarn stripe:listen` in a second terminal; use the CLI-output signing secret as `STRIPE_WEBHOOK_SECRET` in `.env` during local dev only

---

## CI / E2E Architecture

Three tiers, each with a dedicated Worker and URL:

- **e2e-smoke** (every PR): builds → `wrangler deploy --env preview` → seeds `krabiclaw-db-preview` → full E2E suite against `preview.krabiclaw.com`. `PLAYWRIGHT_PREVIEW_URL` is hardcoded to that URL; `playwright.config.ts` skips `webServer` when it is set.
- **e2e-staging** (push to `staging` branch): builds → `wrangler deploy --env staging` → seeds `krabiclaw-db-staging` → full E2E suite against `staging.krabiclaw.com`. Pre-production gate before staging is merged to main. Keep real assertions here; only fix staging-only false negatives, do not casually trim coverage.
- **prod-deploy** (push to `main`): applies D1 migrations → `wrangler deploy` (production `krabiclaw`) → `prod-smoke` and canaries run after, testing production routes/domains that are intentionally live.
- Cloudflare creds (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are scoped to deploy steps only — not in the top-level job `env:`.
- All E2E jobs require `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — without them billing API calls 503 and console-error assertions fail.
- Remote staging seeds must be idempotent. Repeated runs should be able to reseed without unique-key collisions like `sites.subdomain`.
- Production smoke must not include intentionally disabled paid customer domains. As of June 9, 2026, `www.potteryhousekrabi.com` is intentionally disabled and excluded from `prod-smoke`; the free tenant host `pottery-house.krabiclaw.com` remains covered.

---

## MCP

- Nuxt UI MCP server required for building UI components with Nuxt UI integration

---

## Plan System

- Plans: `free` (Starter), `growth` ($49/mo), `managed` ($149/mo), `seo_accelerator` ($349/mo)
- Stripe is the source of truth for plan names, prices, and `marketing_features` (feature bullets)
- `server/utils/billing.ts` → `getPlanEntitlements(plan)` defines what each plan unlocks in D1
- Entitlements stored per-org in `organization_entitlements` table, checked at API level
- Key entitlement keys: `custom_domains`, `google_business`, `translation`, `translation_languages`, `ai_credits`, `managed_service`, `seo_accelerator`
- `managed_service = true` on Managed and SEO Accelerator — gates Facebook sync (auth/publish/sync endpoints)
- `plans.get.ts` — only Starter has a static definition; all paid plans come from Stripe exclusively. Returns 503 if `STRIPE_SECRET_KEY` not set.
- `PLAN_CTA` map in `plans.get.ts` holds CTA labels/hrefs (app config, not Stripe data)
- Seeder: `node scripts/seed-stripe.mjs` — idempotent, upserts products and updates `marketing_features`

---

## Managed Service Queue

- `work_requests` table: type, title, description, status, priority, source (dashboard/whatsapp/chowbot/admin), notes, assigned_to
- `POST /api/dashboard/work-requests` — restaurant owners submit requests
- `GET /api/admin/work-requests` + `PATCH /api/admin/work-requests/[id]` — admin manages queue
- ChowBot has `create_work_request` tool — routes managed service intents to Paul & Julia instead of handling autonomously
- Admin Work Queue tab shows all requests with type icons, priority badges, inline status dropdown
- Dashboard Support page (`/dashboard/[orgSlug]/support`) — free plan sees upsell, paid plans see request form + history

---

## Admin Workspace

- `/admin` route — gated by `middleware/admin.ts` which calls `GET /api/auth/get-session` using `useRequestFetch()` to forward cookies during SSR
- Access: `user.role = 'admin'` in DB, AND checked server-side via `isPlatformOwner()` against `PLATFORM_OWNER_EMAILS` env var
- Admin navigation defined in `adminNavigation` computed in `layouts/dashboard.vue` — uses `i-lucide-*` icons and `?tab=` query params with explicit `active` computed
- Tabs: Work Queue, Add-ons (service_addon_purchases), Clients, Members, Analytics, Domains, Users, Content, Blog
- Post-login routing: `GET /api/post-login` — `isPlatformOwner` → `/admin`, else → `/dashboard/[orgSlug]`
- Dev login: `GET /api/dev/login` → redirects to `/api/post-login`

---

## Design System Enforcement

- Never bypass Nuxt UI layout components (`UCard`, `UPage`, `UPageBody`) to write custom Tailwind `div` wrappers
- UCard `:ui` prop only accepts: `root`, `header`, `title`, `description`, `body`, `footer` — use `class` on the element for all other styling (border, background, rounded, shadow)
- Dashboard pages do NOT use `UPageHeader` — content goes directly in `UPageBody`
- Admin nav uses `i-lucide-*` icons; keep consistent with the rest of the dashboard nav
- Do not introduce custom `border` or `bg` classes that break the global theme inheritance
- If a specific visual layout (like a flat Vercel card) is needed, use the Nuxt UI component and override specific tokens via the `:ui` prop (e.g., `<UCard :ui="{ shadow: '', rounded: 'rounded-xl', body: { padding: 'p-0' } }">`)

---

## Client Onboarding Pipeline

**Canonical command** — use this for every new client. No manual SQL, no ad-hoc seeds.

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

**Intake file format** — `client-intake/<slug>.yml`:

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

### LLM Operating Rule — Client Sites

**Never** manually seed, patch D1, invent client data, use stock images, leave tenant media on third-party hosts, or claim deployment success for a client site. A site is not complete until `client:verify` passes and `client-handoff.md` is generated.

The required pipeline is:

1. `client:import --dry-run` — fetch real data, scan real images, generate reviewable manifests
2. Human review of `client-imports/<slug>/`
3. `client:import --approve` — sign the manifest hash
4. `client:import --apply` — execute only the approved seed
5. `client:verify` — all checks must pass
6. `client:deploy` — for production: seed remote D1, deploy Worker, verify live

If any step fails, fix the source of truth (API data, schema, theme copy). Do not add frontend workarounds.

### Pottery House Krabi — Canonical Regression Case

The Pottery House Krabi onboarding incident is the canonical failure reference. These failures must never recur:

- Stock photos when client photos exist
- Restaurant copy on an experience vertical ("Come dine with us", "Reserve a table", "From the kitchen", etc.)
- Saya fallback copy ("Also part of Saya") on any tenant page
- Wrong phone/email fallback from Saya demo data
- Experience detail route rendering the index page (Nuxt nested routing conflict)
- Image 404s serving from `bootstrap` response
- Manual D1 mutations outside the approved `client:apply` path

Run the regression fixture before merging any PR that touches `scripts/` or `components/saya/`:

```bash
# Requires a local dev server seeded with pottery house data
yarn fixture:pottery-house --url http://localhost:3000 --site-id site-pottery-house-krabi
```

### Custom Domains

Custom domain onboarding is automated via `POST /api/sites/[siteId]/domains`. The dashboard exposes this at `/dashboard/[orgSlug]/~/settings/domains`.

**Architecture (Cloudflare for SaaS + Workers):**
- `customers.krabiclaw.com` — SaaS fallback origin, must be `A 192.0.2.1` proxied. Never a CNAME to `pages.dev` or `workers.dev` (causes error 1014). Never a Worker Custom Domain (causes Host header 403).
- `*/*` Worker route in `wrangler.toml` — required for custom hostname traffic to hit the Worker. Without it, all custom hostname requests get 522. This route MUST stay in wrangler.toml or wrangler deploy will wipe it.
- SSL validation — use direct TXT records at `_acme-challenge.www`. Do NOT use the DCV delegation CNAME (`*.dcv.cloudflare.com`) — that target times out.
- After provisioning, set `site_domains.role = 'canonical'` for the custom domain and `'secondary'` for the krabiclaw subdomain. The tenant-routing middleware redirects to canonical; if the krabiclaw subdomain stays canonical the custom domain bounces back.

**DNS instructions for clients (GoDaddy or any external registrar):**
1. `CNAME www → customers.krabiclaw.com`
2. `TXT _acme-challenge.www → <value1>` (from Cloudflare for SaaS API response)
3. `TXT _acme-challenge.www → <value2>` (second value, same name)
4. Apex (no www): use registrar HTTP forwarding `potteryhousekrabi.com → https://www.potteryhousekrabi.com` — registrar forwarding only works over HTTP; the browser handles the HTTPS hop after following the redirect.
- Do NOT add a CNAME at the apex — most registrars block it.
- Do NOT use the DCV delegation CNAME for SSL — it doesn't work.
- After adding TXT records, do not touch DNS again until the cert issues. Every PATCH to the custom hostname rotates the ACME tokens.
