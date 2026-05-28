# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

---

## Stack

- **Nuxt 4** + **Nitro** with `cloudflare-module` preset
- **D1** (SQLite) via `@atinux/kysely-d1` — single binding: `DB`
- **Better Auth 1.6+** — Google OAuth + `organization` plugin; `phoneNumber` plugin for WhatsApp OTP
- **Stripe** — subscriptions, entitlements
- **Cloudflare Workers** — serverless runtime
- **Package manager: yarn only** — never npm or pnpm
- Commands: `yarn dev` (local, port 3000), `yarn build`, `yarn deploy`

---

## Critical Wrangler Rules

- Always use `nodejs_compat_v2` (not `nodejs_compat`) in `wrangler.toml` — Better Auth 1.6+ requires it
- `yarn dev` runs `nuxt dev` — secrets are read from `.env`. `.dev.vars` is only used by `wrangler dev` (not the default dev command here)
- Never rely on `process.env` alone in server code — always merge with `event.context.cloudflare?.env` via `cloudflareEnv()` in `server/utils/api-response.ts`
- Schema migrations: `yarn schema:local` (local) / `yarn schema:remote` (remote) — run automatically on `yarn deploy`
- Deploys require patching the generated Nitro/Cloudflare process shim — always use `yarn deploy`, never `wrangler deploy` directly
- Secrets: managed via `wrangler secret put <KEY>` or `wrangler secret bulk <file.json>` — never `wrangler pages secret`
- Wildcard subdomains (`*.krabiclaw.com`) are handled automatically via Worker route — no per-tenant DNS setup needed
- New tenants get `<slug>.krabiclaw.com` for free; custom domains use Cloudflare for SaaS (fallback origin: `customers.krabiclaw.com`)

---

## Auth

- Single catch-all handler: `server/api/auth/[...].ts`
- Auth factory: `server/utils/auth.ts` — `createAuth(env: CloudflareEnv)` — takes full CF env
- WeakMap cache keyed on D1 binding — safe for Worker lifecycle
- Client: `lib/auth-client.ts` — `authClient` is auto-imported via Nuxt plugin
- Platform admin: `user.role = 'admin'`; org/site access: Better Auth `member.role`
- Admin emails: `PLATFORM_ADMIN_EMAILS` env var

### Auth/App Naming Boundary

- Better Auth physical columns are vendor-owned and must not be renamed (`userId`, `organizationId`, etc.)
- App-owned tables use snake_case — do not introduce new camelCase app columns
- Standard membership access: `sites.organization_id = member.organizationId` and `member.userId = session.user.id`
- Remove unnecessary joins through `organization` when membership alone proves access

---

## ChowBot Ownership Boundary

- ChowBot owns AI conversations, messages, tool calls, media context, and channel state in D1
- `chowbot_conversations`, `chowbot_messages`, `chowbot_channel_state` are canonical — do not reintroduce localStorage or channel-specific shadow history
- Dashboard and WhatsApp are clients of the same ChowBot backend — route owner intent through `runChowBot(...)`
- WhatsApp webhooks are transport only: verify Meta, identify sender, select site, dedupe message IDs, download/persist media, call ChowBot, send reply
- WhatsApp must not own product workflows (menu import, post creation, publish, delete, media decisions) — those belong in ChowBot tools
- Tool calls/results must be stored on ChowBot assistant messages so dashboard and WhatsApp see the same conversation truth
- Do not hide ChowBot API failures by fabricating conversations or empty histories

---

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

- Organizations map 1:1 with restaurant owners (Better Auth `organization` plugin)
- One site per org — enforced by unique index on `sites(organization_id)`
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

## Design System Enforcement

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
