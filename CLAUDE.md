# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.


## Stack



## Critical Wrangler Rules



## Auth


### Auth/App Naming Boundary



## ChowBot Ownership Boundary



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

---

## File Conventions

- `server/utils/auth.ts` — `createAuth(env)` — always takes full CF env
- `server/utils/api-response.ts` — `cloudflareEnv(event)` — use for all server env/DB access
- `server/middleware/tenant-resolution.ts` — runs on every request
- `lib/auth-client.ts` — client-side Better Auth instance
- `composables/` — Nuxt auto-imported
- `schema.sql` — canonical D1 schema
- Layout name for Saya theme pages: `layout: 'saya'` — `tenant` is dead

---

## Local Testing

- Dev login (bypasses OAuth): `http://localhost:3000/api/dev/login` — only works in `import.meta.dev`, creates session for first local D1 user
- To test `/admin` locally, promote a user: `yarn wrangler d1 execute DB --local --command "UPDATE user SET role = 'admin' WHERE lower(email) = 'your@email.com';"`
- Stripe webhooks: run `yarn stripe:listen` in a second terminal; use the CLI-output signing secret as `STRIPE_WEBHOOK_SECRET` in `.env` during local dev only

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

<<<<<<< HEAD
- Never bypass Nuxt UI layout components (`UCard`, `UPage`, `UPageBody`) to write custom Tailwind `div` wrappers
- UCard `:ui` prop only accepts: `root`, `header`, `title`, `description`, `body`, `footer` — use `class` on the element for all other styling (border, background, rounded, shadow)
- Dashboard pages do NOT use `UPageHeader` — content goes directly in `UPageBody`
- Admin nav uses `i-lucide-*` icons; keep consistent with the rest of the dashboard nav
- Do not introduce custom `border` or `bg` classes that break the global theme inheritance
=======
- Never bypass Nuxt UI layout components (`UCard`, `UPage`, `UPageHeader`) to write custom Tailwind `div` wrappers, even when matching external design references. 
- If a specific visual layout (like a flat Vercel card) is needed, you must use the Nuxt UI component and override its specific tokens via the `:ui` prop (e.g., `<UCard :ui="{ shadow: '', rounded: 'rounded-xl', body: { padding: 'p-0' } }">`). 
- Do not introduce custom `border` or `bg` classes that break the global theme inheritance.

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

**Never** manually seed, patch D1, invent client data, use stock images, or claim deployment success for a client site. A site is not complete until `client:verify` passes and `client-handoff.md` is generated.

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

Subdomains (`<slug>.krabiclaw.com`) are provisioned automatically. Customer-owned domains require a separate Cloudflare for SaaS custom hostname — this is not yet automated in the onboarding pipeline. Do not attempt to configure custom hostnames manually in `wrangler.toml` or via the API; document the requirement and escalate.
>>>>>>> origin/main
