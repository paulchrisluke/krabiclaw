# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

---

## Stack

- **Nuxt 4** + **Nitro** with `cloudflare-pages` preset
- **D1** (SQLite) via `@atinux/kysely-d1` — single binding: `REVIEWS_DB`
- **Better Auth 1.6+** — Google OAuth + `organization` plugin; `phoneNumber` plugin for WhatsApp OTP
- **Stripe** — subscriptions, entitlements
- **Cloudflare Workers** — serverless runtime
- **Package manager: yarn only** — never npm or pnpm
- Commands: `yarn dev` (local, port 3000), `yarn build`, `yarn deploy`

---

## Critical Wrangler Rules

- Always use `nodejs_compat_v2` (not `nodejs_compat`) in `wrangler.toml` — Better Auth 1.6+ requires it
- `yarn dev` runs `nuxt dev` — secrets are read from `.env`. `.dev.vars` is only used by `wrangler pages dev` (not the default dev command here)
- Never rely on `process.env` alone in server code — always merge with `event.context.cloudflare?.env` via `cloudflareEnv()` in `server/utils/api-response.ts`
- Schema: `yarn schema:local` / `yarn schema:remote`
- Deploys require patching the generated Nitro/Cloudflare process shim — always use `yarn deploy`, never `wrangler pages deploy` directly

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

1. `schema.sql` is the single source of truth — edit this, never add numbered migration files
2. Apply locally: `yarn schema:local` — remotely: `yarn schema:remote`
3. Greenfield — drop and recreate freely when a rebuild is cleaner
4. No inline migration blocks, compatibility columns, duplicate indexes, or legacy aliases in `schema.sql`
5. Better Auth tables must use exact camelCase column names; app tables use snake_case
6. Any schema change must be checked against current server queries before finishing

---

## Multi-Tenancy

- Organizations map 1:1 with restaurant owners (Better Auth `organization` plugin)
- Sites belong to an org; multiple sites per org supported
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
- To test `/admin` locally, promote a user: `yarn wrangler d1 execute REVIEWS_DB --local --command "UPDATE user SET role = 'admin' WHERE lower(email) = 'your@email.com';"`
- Stripe webhooks: run `yarn stripe:listen` in a second terminal; use the CLI-output signing secret as `STRIPE_WEBHOOK_SECRET` in `.env` during local dev only

---

## MCP

- Nuxt UI MCP server required for building UI components with Nuxt UI integration
