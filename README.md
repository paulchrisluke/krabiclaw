# KrabiClaw

Multi-tenant platform SaaS. Nuxt 5 nightly + Nitro 3 + Cloudflare Workers + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Nuxt development server with HMR and locally emulated Cloudflare bindings at `http://localhost:3000`. |
| `yarn local:setup` | Apply local migrations, refresh all curated fixtures, provision the local developer login, and verify D1. |
| `yarn dev:worker` | Build and run the production-like Worker locally with Wrangler at `http://localhost:3000`. |
| `yarn dev:worker:start` | Run the existing `.output` Worker build locally without rebuilding it. |
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
corepack yarn install
```

The repository uses Node.js 24.18.1. Use the exact version declared in
`.nvmrc` before installing dependencies. When changing Node, follow the
[Node runtime upgrade runbook](docs/operations/node-runtime-upgrades.md) so
local development, CI, type definitions, and Worker builds move together.

Yarn accepts new direct and transitive package releases only after seven days.
Routine `yarn add` and `yarn up` commands apply this rule automatically. CI
installs both package graphs immutably and rechecks registry metadata in its
hardened job.

For an urgent reviewed security fix, update only the affected package:

```bash
corepack yarn up <package>@<fixed-version> --no-time-gate
```

For the independent inbound-email Worker graph, add
`--cwd workers/email-inbound` immediately after `yarn`.

Record the advisory and the reason for bypassing the wait in the pull request.
Do not add a package to `npmPreapprovedPackages` or disable the age gate in
`.yarnrc.yml`.

### 2. Environment

Copy `.env.example` to `.env` and fill in values. Required for local dev:

```env
BETTER_AUTH_SECRET=        # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
CRON_SECRET=               # openssl rand -base64 32
GOOGLE_CLIENT_ID=          # Google Cloud Console — OAuth client
GOOGLE_CLIENT_SECRET=
```

### 3. Prepare local development

```bash
corepack yarn local:setup
```

The command is safe to repeat. It leaves local D1 at the current migration,
fixture, credential, and foreign-key baseline, then prints the local login email
and a newly generated password.

Open the prefilled login page at
`http://localhost:3000/login?email=demo-owner%40playwright.example`. The demo
owner can access the `ember-slice-demo` organization and its demo site. Other
scoped fixture identities are declared in `config/e2e-auth-fixtures.ts` and use
the same local password.

Better Auth stores only the generated password's hash in local D1. Set
`E2E_TEST_PASSWORD` before `corepack yarn local:setup` when you need a stable
local credential. A repeated setup replaces fixture passwords and deletes their
existing sessions, so sign in again afterward.

### 4. Run

```bash
corepack yarn dev
```

App at `http://localhost:3000`.

`yarn dev` is the normal application-development loop. Nitro reads the bindings
declared in `wrangler.toml`, emulates local D1/KV/R2 resources, and preserves
Nuxt hot module replacement. It never seeds or resets D1. Run
`corepack yarn local:setup` when you want to restore the deterministic local
fixture baseline.

For production-runtime browser verification, use the generated Worker locally.
Wrangler reads `.env` and `.dev.vars` using its documented local-development
behavior.

```bash
yarn test:e2e:local tests/e2e/smoke.spec.ts
```

For a production-like local Worker:

```bash
yarn dev:worker
```

After a successful build, `yarn dev:worker:start` restarts that same `.output`
without rebuilding. Source edits are not compiled into `.output` automatically;
use `yarn dev` for the normal HMR editing loop.

Playwright applies the local D1 schema, clears disposable E2E artifacts, seeds
the curated sites and verified synthetic Better Auth accounts, builds the
Cloudflare Worker, and starts it under local workerd. Authenticated tests sign
in through Better Auth with a random password generated inside the Playwright
process; no email inbox or authentication bypass route is involved. That random
password is not a reusable manual-browser credential. Use the explicit
`corepack yarn local:setup` command above for manual browser work.

Local tenant tests use a shared-host routing contract: the browser targets
`localhost` and the test helper supplies `x-preview-tenant` for the selected
fixture. Deployed preview and staging use direct first-level tenant aliases
instead. This is the authoritative local browser path; do not rely on direct
`*.localhost` navigation for Worker browser verification.

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
2. Merges to `staging` deploy the staging Worker once, apply staging migrations,
   provision fixtures/auth once, and run the full Playwright suite with two workers.
3. The `staging` to `main` release PR reuses the checks attached to its exact
   staging head without another deployment or test cycle.
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

MCP reconnect triage and Cloudflare auth debugging are documented in [docs/observability.md](docs/observability.md).

The mandatory deployed-browser release gate and outage recovery rules are documented in [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md).

---

## Schema

Database schema changes must follow the canonical migration workflow in [docs/database/migrations.md](docs/database/migrations.md). `server/db/schema.ts` is the only schema source of truth.

---

## Stripe (local)

```bash
yarn stripe:listen
```

Copy the `whsec_...` signing secret it outputs into `.env` as `STRIPE_WEBHOOK_SECRET`. Swap back to the production webhook secret before deploying.
