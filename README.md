# KrabiClaw

Multi-tenant platform SaaS. Nuxt 5 nightly + Nitro 3 + Cloudflare Workers + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Nuxt development server for platform/UI work at `http://localhost:3000`. |
| `yarn wrangler dev .output/server/index.mjs --assets .output/public --local --port 3000` | Run the built Worker locally with Wrangler. |
| `yarn build` | Production build → `.output/` |
| `yarn db:generate` | Generate a new `migrations/*.sql` file from `server/db/schema.ts` |
| `yarn schema:local` | Apply pending `migrations/*.sql` to local D1 |
| `yarn drizzle:check` | Verify `server/db/schema.ts` hasn't drifted from the live D1 schema |
| `yarn seed:local` | Reset all local demo and client test fixtures |
| `yarn stripe:listen` | Forward Stripe webhooks to localhost (local dev only) |
| `yarn canary:prod` | Production-safe authenticated browser canary (read-only checks). |
| `yarn canary:notifications` | Production provider-level email/WhatsApp notification canary. |
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

The repository uses Node.js 24.18.1. Use the exact version declared in
`.nvmrc` before installing dependencies.

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
yarn seed:local             # optional — loads local demo and client test fixtures
```

### 4. Run

```bash
yarn dev
```

App at `http://localhost:3000`.

For browser verification, use the generated Worker locally. Wrangler reads
`.env` and `.dev.vars` using its
documented local-development behavior.

```bash
yarn test:e2e:local tests/e2e/smoke.spec.ts
```

For a manually running built Worker:

```bash
yarn build
yarn wrangler dev .output/server/index.mjs --assets .output/public --local --port 3000
```

Playwright applies the local D1 schema, clears disposable E2E artifacts, seeds
the curated sites and verified synthetic Better Auth accounts, builds the
Cloudflare Worker, and starts it under local workerd. Authenticated tests sign
in through Better Auth with those credentials; no email inbox or authentication
bypass route is involved.

Tenant sites use the same shared-host routing contract as preview and staging:
the browser targets `localhost` and the test helper supplies
`x-preview-tenant` for the selected fixture. This is the authoritative local
browser path; do not rely on direct `*.localhost` navigation for Worker browser
verification.

```text
http://localhost:3000/                  (x-preview-tenant: ncls)
http://localhost:3000/services          (x-preview-tenant: ncls)
http://localhost:3000/experiences       (x-preview-tenant: pottery-house)
http://localhost:3000/reservations      (x-preview-tenant: kikuzuki-krabi-thailand)
```

### Local ChatGPT MCP harness

For local-but-public connector testing through a real HTTPS origin, use the
hybrid local harness instead of plain localhost:

```bash
yarn test:mcp:local:tunnel
```

The full env contract, tunnel setup, write-smoke mode, and ChatGPT handoff are
documented in [docs/local-mcp-harness.md](docs/local-mcp-harness.md).

### macOS file limit fix

```bash
ulimit -n 65536
```

---

## Deployment

Deployment follows the branches in `.github/workflows/ci.yml`:

1. Runtime pull requests deploy the isolated preview Worker and run permanent
   core plus diff-selected affected E2E coverage.
2. Merges to `staging` deploy the staging Worker, apply staging migrations, and
   run the same core plus affected coverage.
3. The `staging` to `main` release PR runs the full Playwright suite against its
   exact staging head.
4. A reviewed `staging` to `main` merge deploys the production Worker, applies
   production migrations, and runs read-only production browser smoke.

CI invokes native Wrangler commands only in the matching branch job. See
[docs/operations/release-flow.md](docs/operations/release-flow.md).

The **Zaraz GA4 Backfill Plan** workflow is read-only and accepts only preview or
staging targets. It reads the target D1 connections and the current zone-level
Zaraz configuration, then emits a plan; it never applies a Zaraz `PUT` and has
no production operator path.

During an incident, use Cloudflare's deployment history to restore the last
known-good production deployment without changing D1 data. Then land the source
fix through `staging` and `main` and repeat the browser gates.

Production secrets live in the Cloudflare dashboard → Workers & Pages → krabiclaw → Settings → Variables.

Set protected internal job secrets with Wrangler:

```bash
openssl rand -base64 32
yarn wrangler secret put CRON_SECRET
```

`CRON_SECRET` protects internal scheduled endpoints. Local commands read their configuration from `.env`; deployed Workers use Cloudflare secrets and the variables in `wrangler.toml`.

CI + E2E auth/billing parity, tier intent, and staging-vs-production smoke rules are documented in [docs/ci-e2e-guardrails.md](docs/ci-e2e-guardrails.md). MCP reconnect triage and Cloudflare auth debugging are documented in [docs/mcp-auth-debugging.md](docs/mcp-auth-debugging.md) and [docs/observability-debugging.md](docs/observability-debugging.md).

The mandatory deployed-browser release gate and outage recovery rules are documented in [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md).

---

## Schema

`server/db/schema.ts` (Drizzle ORM) is the source of truth for new schema changes. `migrations/0001_initial.sql`–`0007_*.sql` are historical and hand-authored; from `0008` onward, schema changes start in `schema.ts`, then `yarn db:generate` (`drizzle-kit generate`) produces the matching `migrations/000N_*.sql` file. Every migration becomes immutable as soon as any shared environment applies it. Use `yarn schema:local` locally; preview migrations belong to the required PR workflow, and staging/production migrations run in their branch deployment jobs. Never rebuild a referenced parent table with `DROP TABLE`; a verified obsolete unreferenced table may be removed normally. Do not invoke a remote migration command as a substitute for release approval. `drizzle-kit generate` cannot emit triggers or CHECK constraints, so those required constraints must be hand-appended to the generated migration; indexes and uniques declared in `schema.ts` are generated normally. Full workflow and constraint caveats are documented in `AGENTS.md`'s "Database Schema Workflow" section.

```bash
yarn db:generate     # generate a migration from schema.ts after editing it
yarn schema:local    # apply pending migrations locally
```

---

## Stripe (local)

```bash
yarn stripe:listen
```

Copy the `whsec_...` signing secret it outputs into `.env` as `STRIPE_WEBHOOK_SECRET`. Swap back to the production webhook secret before deploying.
