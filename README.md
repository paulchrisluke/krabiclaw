# KrabiClaw

Multi-tenant restaurant SaaS. Nuxt 4 + Cloudflare Pages + D1.

**Package manager: yarn only.** Never npm or pnpm.

---

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Dev server (localhost:3000) with local Cloudflare bindings for D1/R2/KV and tenant subdomain routing on `*.localhost`. |
| `yarn build` | Production build → `.output/` |
| `yarn deploy` | Intentionally blocked; production releases use the manifest-gated GitHub Actions workflow. |
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
yarn test:mcp:local:tunnel
```

The full env contract, tunnel setup, write-smoke mode, and ChatGPT handoff are
documented in [docs/local-mcp-harness.md](docs/local-mcp-harness.md).

### Performance validation

For page performance, build the Worker and measure the real browser journeys
against that artifact. Do not use the old dev-only isolation pages or run a
large benchmark while editing. Deterministic data-loading checks remain useful
when transport or query code changes:

```bash
yarn build:cf
yarn lint:data-loading
```

The current browser evidence and release-only benchmark policy are documented
in [docs/performance/performance-recovery-2026-08.md](docs/performance/performance-recovery-2026-08.md).

### macOS file limit fix

```bash
ulimit -n 65536
```

---

## Deployment

Direct staging and production deploy commands are intentionally blocked.

1. Dispatch **CI (Full Validation Lane)** from the exact candidate SHA. It
   builds once, locks staging, uploads one tagged Worker Version, applies and
   records staging migrations, verifies the 0% candidate by version override,
   runs the full browser lane and genuine 25-sample comparison, then verifies
   the promoted custom domain.
2. Review its `candidate-manifest.json` evidence.
3. Dispatch **Production release (manifest-gated)** with `operation=preflight`,
   that staging run ID, and the exact SHA. Review its read-only migration/build
   report.
4. Only then dispatch the same workflow with `operation=deploy` and the
   successful preflight run ID. This separate dispatch is the explicit
   post-report approval; the mutation job also names the protected
   `production` environment for its required-reviewer gate.

`yarn deploy`, `yarn deploy:staging`, and their direct Worker variants fail
closed so they cannot bypass the immutable-candidate evidence chain. Preview
remains an isolated PR environment. See
[docs/operations/release-candidate-contract.md](docs/operations/release-candidate-contract.md)
for the exact contract.

Production secrets live in the Cloudflare dashboard → Workers & Pages → krabiclaw → Settings → Variables.

Set protected internal job secrets with Wrangler:

```bash
openssl rand -base64 32
yarn wrangler pages secret put CRON_SECRET
```

`CRON_SECRET` protects internal scheduled endpoints. Local `yarn dev` reads it from `.env`; `wrangler pages dev` reads it from `.dev.vars`.

CI + E2E auth/billing parity, tier intent, and staging-vs-production smoke rules are documented in [docs/ci-e2e-guardrails.md](docs/ci-e2e-guardrails.md). MCP reconnect triage and Cloudflare auth debugging are documented in [docs/mcp-auth-debugging.md](docs/mcp-auth-debugging.md) and [docs/observability-debugging.md](docs/observability-debugging.md).

The mandatory deployed-browser release gate and outage recovery rules are documented in [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md).

---

## Schema

`server/db/schema.ts` (Drizzle ORM) is the source of truth for new schema changes. `migrations/0001_initial.sql`–`0007_*.sql` are historical and immutable (already applied everywhere) — from `0008` onward, schema changes start in `schema.ts`, then `yarn db:generate` (`drizzle-kit generate`) produces the matching additive `migrations/000N_*.sql` file. Use `yarn schema:local` locally; preview migrations belong to the required PR workflow, and staging/production migrations belong to their protected candidate workflows. Do not invoke a remote migration command as a substitute for release approval. `drizzle-kit generate` cannot emit triggers or CHECK constraints, so those required constraints must be hand-appended to the generated migration; indexes and uniques declared in `schema.ts` are generated normally. Full workflow, the constraint caveats, and the 2026-06-25 incident (a squashed baseline broke staging CI and silently dropped ~80 triggers/indexes — since reverted) are documented in `AGENTS.md`'s "Database Schema Workflow" section.

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
