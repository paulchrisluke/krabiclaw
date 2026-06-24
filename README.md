# KrabiClaw

Multi-tenant restaurant SaaS. Nuxt 4 + Cloudflare Pages + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server (localhost:3000). Full D1 + Cloudflare emulation via `nitro-cloudflare-dev`. |
| `yarn build` | Production build → `.output/` |
| `yarn deploy` | Build, patch Nitro shim, apply D1 migrations, deploy the Worker |
| `yarn schema:local` | Apply pending `migrations/*.sql` to local D1 |
| `yarn schema:remote` | Apply pending `migrations/*.sql` to production D1 |
| `yarn drizzle:check` | Verify `server/db/schema.ts` hasn't drifted from the live D1 schema |
| `yarn seed:local` | Seed demo data locally |
| `yarn stripe:listen` | Forward Stripe webhooks to localhost (local dev only) |
| `yarn canary:prod` | Production-safe authenticated browser canary (read-only checks). |
| `yarn canary:notifications` | Production provider-level email/WhatsApp notification canary. |
| `yarn rollback:prod` | Roll back Worker to previous version, then run smoke + auth canary checks. |

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

### macOS file limit fix

```bash
ulimit -n 65536
```

---

## Deployment

```bash
yarn deploy
```

Builds, patches the Nitro/Cloudflare process shim, applies pending D1 migrations (`wrangler d1 migrations apply DB --remote`), then deploys the Cloudflare Worker (`wrangler deploy`). **Never run `wrangler deploy` directly** — the shim patch and migration step will be skipped. In CI, this same sequence runs automatically on every push to `main` (`prod-deploy` job in `.github/workflows/ci.yml`).

Production secrets live in the Cloudflare dashboard → Workers & Pages → krabiclaw → Settings → Variables.

Set protected internal job secrets with Wrangler:

```bash
openssl rand -base64 32
yarn wrangler pages secret put CRON_SECRET
```

`CRON_SECRET` protects internal endpoints such as `/api/internal/translation-jobs/process`. Local `yarn dev` reads it from `.env`; `wrangler pages dev` reads it from `.dev.vars`.

CI + E2E auth/billing parity, tier intent, and staging-vs-production smoke rules are documented in [docs/ci-e2e-guardrails.md](docs/ci-e2e-guardrails.md).

---

## Schema

Schema changes go through hand-authored, numbered files in `migrations/`, applied via `wrangler d1 migrations apply` — not `drizzle-kit generate`/`migrate`. `server/db/schema.ts` (Drizzle ORM) is hand-maintained to mirror `migrations/` and is used for typed query access plus drift checking (`yarn drizzle:check`), not for generating migrations. Full workflow and the squashed-baseline (`migrations/0001_initial.sql`) caveats are documented in `CLAUDE.md`'s "Database Schema Workflow" section.

```bash
yarn schema:local    # apply pending migrations locally
yarn schema:remote   # apply pending migrations to production
```

---

## Stripe (local)

```bash
yarn stripe:listen
```

Copy the `whsec_...` signing secret it outputs into `.env` as `STRIPE_WEBHOOK_SECRET`. Swap back to the production webhook secret before deploying.
