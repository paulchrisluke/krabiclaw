# KrabiClaw

Multi-tenant restaurant SaaS. Nuxt 4 + Cloudflare Pages + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server (localhost:3000) with local Cloudflare bindings for D1/R2/KV and tenant subdomain routing on `*.localhost`. |
| `yarn build` | Production build → `.output/` |
| `yarn deploy` | Build, patch Nitro shim, apply D1 migrations, deploy the Worker |
| `yarn db:generate` | Generate a new `migrations/*.sql` file from `server/db/schema.ts` |
| `yarn schema:local` | Apply pending `migrations/*.sql` to local D1 |
| `yarn schema:remote` | Apply pending `migrations/*.sql` to production D1 |
| `yarn drizzle:check` | Verify `server/db/schema.ts` hasn't drifted from the live D1 schema |
| `yarn seed:local` | Seed demo data locally |
| `yarn stripe:listen` | Forward Stripe webhooks to localhost (local dev only) |
| `yarn canary:prod` | Production-safe authenticated browser canary (read-only checks). |
| `yarn canary:notifications` | Production provider-level email/WhatsApp notification canary. |
| `yarn rollback:prod` | Roll back Worker to previous version, then run smoke + auth canary checks. |
| `yarn test:mcp:local` | Local ChatGPT MCP harness preflight against the public tunnel target. |

---

## Production Canary Runs

Real-send production canaries are intentionally off on normal `main` deploys to avoid
accidental email/WhatsApp spend on every merge. To run them on demand, use the GitHub
Actions workflow `Production Real-Send Canaries` and choose whether to send:

- the auth OTP canary
- the notification email/WhatsApp canary

That workflow always runs production smoke first, then only sends the real canaries you
explicitly selected for that run.

See [docs/notification-testing.md](docs/notification-testing.md) for the full policy on
log-only vs live email/WhatsApp testing, production-safe verification, and which public
submission paths send for real in production.

---

## Local Setup

### 1. Install

```bash
yarn install
```

### 2. Environment

Copy `.env.example` to `.env` and fill in values. Required for local dev:

```env
BETTER_AUTH_SECRET=        # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
CRON_SECRET=               # openssl rand -base64 32
GOOGLE_CLIENT_ID=          # Google Cloud Console — OAuth client
GOOGLE_CLIENT_SECRET=
```

### 3. Database

```bash
yarn schema:local
yarn seed:local             # optional — loads demo data
```

### 4. Run

```bash
yarn dev
```

App at `http://localhost:3000`. Dev login (bypasses OAuth): `http://localhost:3000/api/dev/login`

Tenant sites resolve locally on `*.localhost`, for example:

```text
http://pottery-house.localhost:3000/experiences
http://kikuzuki-krabi-thailand.localhost:3000/reservations
```

`yarn dev` now disables Wrangler remote bindings by default so tenant dev does not depend on a remote Workers AI proxy session. This matters because Wrangler otherwise tries to open a remote preview session for the `AI` binding before attaching local `DB`/R2/KV bindings; if that handshake times out, tenant hosts fall through to `Site Not Found` even when local D1 is seeded correctly.

If you specifically need the old remote-binding behavior for AI debugging, opt back in per shell:

```bash
NUXT_CF_REMOTE_BINDINGS=true yarn dev
```

### Local ChatGPT MCP harness

For local-but-public connector testing through a real HTTPS origin, use the
hybrid local harness instead of plain localhost:

```bash
yarn dev:tunnel
yarn tunnel
yarn test:mcp:local
```

The full env contract, tunnel setup, write-smoke mode, and ChatGPT handoff are
documented in [docs/local-mcp-harness.md](docs/local-mcp-harness.md).

### macOS file limit fix

```bash
ulimit -n 65536
```

---

## Deployment

```bash
yarn deploy
```

Builds, patches the Nitro/Cloudflare process shim, applies pending D1 migrations (`yarn migrate:prod`, wraps `wrangler d1 migrations apply DB --remote`), then deploys the Cloudflare Worker (`yarn deploy:prod:worker`, wraps `wrangler deploy` with a retry-once on failure). **Never run `wrangler deploy` or `wrangler d1 migrations apply` directly** — the shim patch, migration step, and retry logic will be skipped. Equivalent per-environment scripts exist for preview (`yarn deploy:preview`, `yarn migrate:preview`, `yarn deploy:preview:worker`) and staging (`yarn deploy:staging`, `yarn migrate:staging`, `yarn deploy:staging:worker`). In CI, the `e2e-smoke`, `e2e-staging`, and `prod-deploy` jobs in `.github/workflows/ci.yml` all call these same named scripts for deploy/migrate — never raw `wrangler deploy`/`wrangler d1 migrations apply` — so that behavior is identical locally and in CI. Raw `wrangler`/`npx wrangler` invocations for other purposes (e.g. `wrangler pages secret put`, `wrangler d1 execute` for read-only inspection) are fine.

Production secrets live in the Cloudflare dashboard → Workers & Pages → krabiclaw → Settings → Variables.

Set protected internal job secrets with Wrangler:

```bash
openssl rand -base64 32
yarn wrangler pages secret put CRON_SECRET
```

`CRON_SECRET` protects internal endpoints such as `/api/internal/translation-jobs/process`. Local `yarn dev` reads it from `.env`; `wrangler pages dev` reads it from `.dev.vars`.

CI + E2E auth/billing parity, tier intent, and staging-vs-production smoke rules are documented in [docs/ci-e2e-guardrails.md](docs/ci-e2e-guardrails.md). MCP reconnect triage and Cloudflare auth debugging are documented in [docs/mcp-auth-debugging.md](docs/mcp-auth-debugging.md) and [docs/observability-debugging.md](docs/observability-debugging.md).

---

## Schema

`server/db/schema.ts` (Drizzle ORM) is the source of truth for new schema changes. `migrations/0001_initial.sql`–`0007_*.sql` are historical and immutable (already applied everywhere) — from `0008` onward, schema changes start in `schema.ts`, then `yarn db:generate` (`drizzle-kit generate`) produces the matching additive `migrations/000N_*.sql` file, applied via `wrangler d1 migrations apply`. `drizzle-kit generate` can't emit triggers or CHECK constraints, and only emits indexes/uniques explicitly declared in `schema.ts` — those must be hand-appended to the generated migration file. Full workflow, the constraint caveats, and the 2026-06-25 incident (a squashed baseline broke staging CI and silently dropped ~80 triggers/indexes — since reverted) are documented in `CLAUDE.md`'s "Database Schema Workflow" section.

```bash
yarn db:generate     # generate a migration from schema.ts after editing it
yarn schema:local    # apply pending migrations locally
yarn schema:remote   # apply pending migrations to production
```

---

## Stripe (local)

```bash
yarn stripe:listen
```

Copy the `whsec_...` signing secret it outputs into `.env` as `STRIPE_WEBHOOK_SECRET`. Swap back to the production webhook secret before deploying.
