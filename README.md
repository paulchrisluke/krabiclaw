# KrabiClaw

Multi-tenant restaurant SaaS. Nuxt 4 + Cloudflare Pages + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server (localhost:3000). Full D1 + Cloudflare emulation via `nitro-cloudflare-dev`. |
| `yarn build` | Production build → `dist/` |
| `yarn deploy` | Build, patch Nitro shim, deploy to Cloudflare Pages |
| `yarn schema:local` | Apply `schema.sql` to local D1 |
| `yarn schema:remote` | Apply `schema.sql` to production D1 |
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

Builds, patches the Nitro/Cloudflare process shim, and deploys. **Never run `wrangler pages deploy` directly** — the shim patch will be skipped.

Production secrets live in Cloudflare Pages → Settings → Environment variables.

Set protected internal job secrets with Wrangler:

```bash
openssl rand -base64 32
yarn wrangler pages secret put CRON_SECRET
```

`CRON_SECRET` protects internal endpoints such as `/api/internal/translation-jobs/process`. Local `yarn dev` reads it from `.env`; `wrangler pages dev` reads it from `.dev.vars`.

Production canary/rollback setup and secret requirements are documented in [docs/prod-canary-and-rollback.md](docs/prod-canary-and-rollback.md).

---

## Schema

`schema.sql` is the single source of truth. Edit it directly — no numbered migration files.

```bash
yarn schema:local    # local
yarn schema:remote   # production
```

---

## Stripe (local)

```bash
yarn stripe:listen
```

Copy the `whsec_...` signing secret it outputs into `.env` as `STRIPE_WEBHOOK_SECRET`. Swap back to the production webhook secret before deploying.
