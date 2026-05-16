When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first; do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

## MCP Requirements
- Nuxt UI MCP server required
- Provides UI components, docs, and examples
- Used for building UI components with Nuxt UI integration

---

## Stack

- **Nuxt 4** + **Nitro** with `cloudflare-pages` preset
- **D1** (SQLite) via `@atinux/kysely-d1` — single binding: `REVIEWS_DB`
- **Better Auth 1.6+** — Google OAuth + `organization` plugin; `phoneNumber` plugin for WhatsApp OTP
- **Stripe** — subscriptions, entitlements
- **Cloudflare Workers** — serverless runtime
- Commands: `yarn dev` (local, port 3000), `yarn build`, `yarn deploy`

---

## Critical Wrangler Rules

- Always use `nodejs_compat_v2` (not `nodejs_compat`) in `wrangler.toml` — Better Auth 1.6+ requires it
- `yarn dev` runs `nuxt dev` — secrets are read from `.env`. `.dev.vars` is only used by `wrangler pages dev` (not the default dev command here)
- Never rely on `process.env` alone in server code — always merge with `event.context.cloudflare?.env` via `cloudflareEnv()` in `server/utils/api-response.ts`
- Schema application: `yarn schema:local` / `yarn schema:remote`
- Current deploys require patching the generated Nitro/Cloudflare process shim before `wrangler pages deploy`; use `yarn deploy` so this step is not skipped

## Stripe Local Development

- Run `yarn stripe:listen` in a second terminal to forward Stripe webhooks to `localhost:3000/api/billing/webhook`
- The CLI outputs a signing secret (`whsec_...`) — set this as `STRIPE_WEBHOOK_SECRET` in `.env` while developing locally
- The dashboard webhook secret (set in Stripe → Developers → Webhooks) is for production only; swap back before deploying
- Install CLI once: `brew install stripe/stripe-cli/stripe && stripe login`

---

## Auth

- Single catch-all handler: `server/api/auth/[...].ts`
- Auth factory: `server/utils/auth.ts` — `createAuth(env: CloudflareEnv)` — takes full CF env
- WeakMap cache keyed on the D1 binding instance — safe for Worker lifecycle
- Google OAuth (social sign-in) + Better Auth `admin` plugin + `organization` plugin + `phoneNumber` plugin (WhatsApp OTP delivery)
- Account linking enabled for Google as trusted provider
- Client: `lib/auth-client.ts` → `createAuthClient` from `better-auth/client`
- `authClient` is auto-imported via Nuxt plugin — no explicit import needed in `<script setup>`
- Platform admin access uses Better Auth `user.role = 'admin'`; org/site access uses Better Auth organization `member.role`
- Platform admin emails configured via secure config or PLATFORM_ADMIN_EMAILS env var
- Admin support impersonation uses `authClient.admin.impersonateUser({ userId })`; dashboard must show the impersonation banner and `authClient.admin.stopImpersonating()`

## ChowBot Ownership Boundary

- ChowBot is the product owner and durable system of record for AI conversations, messages, tool calls, media context, and channel state.
- D1 tables `chowbot_conversations`, `chowbot_messages`, and `chowbot_channel_state` are canonical. Do not reintroduce browser `localStorage` chat history or channel-specific shadow history.
- Dashboard and WhatsApp are clients of the same ChowBot backend. Both must route owner intent through shared ChowBot utilities, especially `runChowBot(...)`.
- WhatsApp is an interface/transport only. Webhooks may verify Meta, identify the sender, select the site, dedupe Meta message IDs, download inbound media, persist the inbound message/media, and send ChowBot's final plain-text reply.
- WhatsApp webhooks must not own product workflows, parse business intents, or directly execute domain actions such as menu import, post creation, publishing, deleting, or media task decisions. Those belong in ChowBot tools/core logic.
- If WhatsApp receives media, persist it as a ChowBot message attachment and pass pending media context into ChowBot. ChowBot decides whether to import menu items, save media, use it for another task, ask a clarifying question, or cancel.
- Tool calls/results must be stored on ChowBot assistant messages so dashboard and WhatsApp see the same conversation truth.
- Keep confirmation rules centralized in ChowBot: publish/delete/destructive tools require confirmation; draft creates/updates can run directly.
- Do not hide ChowBot API failures by fabricating conversations, messages, empty histories, or successful channel responses.

## Local Login & Browser Testing

- Start local app with `yarn dev`; it normally serves `http://localhost:3000`, but Nuxt may choose `3001` if `3000` is already occupied
- Dev-only login endpoint: `http://localhost:<port>/api/dev/login`
  - Only works in `import.meta.dev`
  - Creates a Better Auth session for the first local D1 user
  - Redirects to `/dashboard`
- The Google refresh token in `.env` is for Google Business/Profile API access, not browser login
- Existing Playwright helper scripts:
  - `node scripts/bugcheck-setup.mjs` hits `/api/dev/login` and saves `scripts/.auth-state.json`
  - `node scripts/bugcheck.mjs` reuses that saved state for dashboard crawling
  - These scripts assume port `3000`; if Nuxt moved to `3001`, either free port `3000` or adjust the script before running
- To test `/admin` locally, the local D1 user must have `user.role = 'admin'`
  - Check: `npx wrangler d1 execute REVIEWS_DB --local --command "SELECT email, role FROM user;"`
  - WARNING: Replace admin@example.com with your intended address before running to avoid accidentally granting admin privileges
  - Promote local user: `npx wrangler d1 execute REVIEWS_DB --local --command "UPDATE user SET role = 'admin' WHERE lower(email) = 'admin@example.com';"`
- To test client/owner view, use a non-admin email/user so the `/admin` route redirects away and the dashboard behaves like a normal restaurant owner

---

## Database Schema Workflow

1. `schema.sql` is the single source of truth — edit this, never add numbered migration files
2. Apply locally: `yarn schema:local` — remotely: `yarn schema:remote`
3. Greenfield — drop and recreate freely when a rebuild is cleaner
4. No inline migration blocks, compatibility columns, duplicate indexes, or legacy aliases in `schema.sql`
5. Better Auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) must use Better Auth's exact camelCase column names; app-owned tables use snake_case
6. Any schema change must be checked against current server queries before finishing

### Auth/App Naming Boundary

- Better Auth physical columns are vendor/auth-owned and must not be renamed in this repo
- App-owned tables must remain snake_case; do not introduce new app camelCase columns to match Better Auth naming
- Cross-domain joins are expected to bridge naming domains explicitly, e.g. `sites.organization_id = member.organizationId`
- Standard membership access pattern: `sites.organization_id = member.organizationId` and `member.userId = session.user.id`
- Remove unnecessary joins through `organization` when membership alone proves access
- Centralize access checks only when repeated SQL justifies it; avoid abstraction churn

---

## Multi-Tenancy

- Organizations map 1:1 with restaurant owners (Better Auth `organization` plugin)
- Sites belong to an org; multiple sites per org supported
- Tenant resolution: `server/middleware/tenant-resolution.ts`
  - `localhost` / `krabiclaw.com` = platform routes
  - `*.krabiclaw.com` or custom domains = tenant sites
- Unknown domains → 404

---

## File Conventions

- `server/utils/auth.ts` — `createAuth(env)` — always takes full CF env
- `server/utils/api-response.ts` — `cloudflareEnv(event)` — use for all DB access
- `server/middleware/tenant-resolution.ts` — runs on every request
- `lib/auth-client.ts` — client-side Better Auth instance
- `composables/` — Nuxt auto-imported
- `schema.sql` — canonical D1 schema
