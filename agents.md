Never add fallbacks ever.

## MCP Requirements
- Nuxt UI MCP server required
- Provides UI components, docs, and examples
- Used for building UI components with Nuxt UI integration

---

## KrabiClaw Platform Overview

KrabiClaw is a **Shopify for restaurants** — a multi-tenant SaaS where restaurant owners sign up free, get a subdomain site, and build their web presence with a visual editor. We sell SSR-ready, SEO-optimized restaurant websites as a service, powered by Google Business data.

### Business Model
- **Free tier**: Subdomain site (e.g., `kikuzuki.krabiclaw.com`), Saya theme, manual editor
- **$25/mo plan (or similar)**: Custom domain (BYOD), Stripe subscription, SSL provisioning via Cloudflare
- **Upsell ideas** (pricing TBD):
  - Google Business API integration — self-manage site from Google Business
  - Multi-language translations (Thai, Japanese, Arabic, etc.)
  - Marketing strategy services
  - Additional themes beyond Saya

### Current Clients
- **Client 1**: Japanese restaurant brand, 2 locations, both already invited to Google Business
- **Client 2**: Retail store onboarding

### Default Theme: "Saya"
- All tenants start with the Saya theme
- SSR-rendered, SEO-first
- Inline editor for manual content updates
- Google Business data auto-populates content when connected

---

## Tech Stack Decisions

### Runtime & Deployment
- **Nuxt 4** + **Nitro** with `cloudflare-pages` preset
- **Wrangler** for all local CF dev (`dev:cf` script), schema application, and deployments
- **D1** (SQLite) via `@atinux/kysely-d1` adapter — single database binding: `REVIEWS_DB`
- Deploy: `nuxt build --preset=cloudflare_pages` → `wrangler pages deploy dist`

### Critical Wrangler Rules
- Always use `nodejs_compat_v2` (not `nodejs_compat`) in `wrangler.toml` — Better Auth 1.6+ requires it
- Local secrets go in `.dev.vars` (NOT `.env`) — Wrangler ignores `.env` at the CF Workers runtime layer
- Schema application: `yarn schema:local` / `yarn schema:remote`
- Never rely on `process.env` alone in server code — always merge with `event.context.cloudflare?.env` via the `cloudflareEnv()` helper in `server/utils/api-response.ts`

### Auth: Better Auth 1.6+
- Single catch-all handler: `server/api/auth/[...].ts`
- Auth factory: `server/utils/auth.ts` — `createAuth(env: CloudflareEnv)` — takes the full CF env, not just d1
- WeakMap cache keyed on the D1 binding instance — safe for Worker lifecycle
- Google OAuth only (social sign-in), plus `organization` plugin for multi-tenancy
- Account linking enabled for Google as trusted provider
- Client: `lib/auth-client.ts` → `createAuthClient` from `better-auth/client`
- All pages use `authClient.useSession()` for reactive session state
- `authClient` is auto-imported via Nuxt plugin (no explicit import needed in `<script setup>`)

### Multi-Tenancy
- Organizations map 1:1 with restaurant owners (Better Auth `organization` plugin)
- Sites belong to an organization; multiple sites per org are supported
- Tenant resolution via `server/middleware/tenant-resolution.ts`:
  - `localhost` / `krabiclaw.com` = platform routes
  - `*.krabiclaw.com` subdomains or custom domains = tenant sites
- Platform routes: `/login`, `/signup`, `/dashboard`, `/api/auth`, etc.
- Tenant sites rendered with the Saya theme; unknown domains → 404

### Stripe Integration
- Billing routes: `server/api/billing/` (checkout, portal, status, webhook)
- `organization_billing` table stores `stripe_customer_id`, `stripe_subscription_id`, plan, period
- `organization_entitlements` table drives feature flags (custom domains, Google Business, translations)
- Webhook events idempotently stored in `stripe_webhook_events`
- Plans not yet priced — implement as feature flags first, wire pricing later

### Google Business API
- Applied for GMB API access — awaiting approval
- Current client has invited us as manager to 2 locations
- Integration: `server/utils/google-business.ts` + `google_business_connections` table
- Connection stores encrypted access/refresh tokens per org+site
- Pub/Sub push endpoint: `server/api/google-business/notifications.post.ts`
- Public data endpoint: `server/api/google-business/public.get.ts`
- Plan: upsell GMB self-management as a paid feature once API is approved

### SEO Architecture
- `nuxt-schema-org`, `@nuxtjs/sitemap`, `@nuxtjs/robots` installed
- Site-level SEO config via `site_config` table (per tenant)
- `useSeoMeta` on all pages; tenant pages get restaurant-specific title/description/OG
- Canonical URLs enforce non-www; robots disallow `/admin` and `/api`
- Structured data (JSON-LD) for restaurant schema on tenant sites

### Database Schema Workflow
1. Edit `schema.sql` as the single source of truth
2. Apply locally: `yarn schema:local`
3. Apply remotely: `yarn schema:remote`
4. Keep schema changes consolidated in `schema.sql`; do not add numbered migration files
5. Greenfield project — no data migration concerns yet; drop and recreate freely when a rebuild is cleaner

### Dev Workflow
- `yarn dev` — standard Nuxt dev server (port 3000), uses `.env`, hot reload
- `yarn dev:cf` — wrangler pages dev against `dist/` (port 8788), uses `.dev.vars`, mirrors CF runtime
- Always test auth and D1 queries via `dev:cf` — `yarn dev` does not simulate CF Workers env
- Build before `dev:cf`: `yarn build` then `yarn dev:cf`

---

## File Conventions
- `server/utils/auth.ts` — `createAuth(env)` — always takes full CF env
- `server/utils/api-response.ts` — `cloudflareEnv(event)` helper — use this for all DB access
- `server/middleware/tenant-resolution.ts` — runs on every request, sets `event.context.tenantType`
- `lib/auth-client.ts` — client-side Better Auth instance
- `composables/` — Nuxt auto-imported composables
- `schema.sql` — canonical D1 schema; edit this instead of adding numbered migration files
