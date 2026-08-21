# Agent Development Workflow

Use this workflow when running Codex or Claude agents in parallel worktrees.

Before any user-facing change or release decision, read the mandatory
[release and outage prevention contract](../operations/release-and-outage-prevention.md).
The workflow below describes development mechanics; it does not replace the
deployed browser gate or the incident rules in that document.

## Worktrees And Branches

- Start each issue from current `staging` in its own worktree and focused branch.
- Do not reuse stale PR branches as implementation branches. Mine them for useful commits or UI ideas, then port onto fresh `staging`.
- Before opening a PR, fetch/rebase onto latest `origin/staging`.
- Keep one issue per PR unless the user explicitly approves a combined integration branch.
- Do not merge without explicit user approval.
- Do not treat a green check run as browser validation. For renderer, migration,
  CMS, public-route, auth, billing, or other user-visible changes, the exact
  deployed release must pass the full applicable browser matrix before
  promotion. A missing, timed-out, blank, broken-media, or partially inspected
  route is unverified and blocks release.

## Pull Requests

- Open regular PRs to `staging`, not drafts, so smoke tests run.
- CodeRabbit reviews normal PRs automatically on commits. Do not comment just to request a review unless the user asks.
- After opening or pushing a PR, do one immediate status check and report the PR URL plus current check state.
- Do not poll GitHub or CodeRabbit every few seconds. If checks or CodeRabbit are still pending, schedule or ask for a follow-up about 20 minutes later.
- When CodeRabbit or CI reports actionable feedback, address it in the same worktree, push once the fix is coherent, then do one immediate status check again.
- Treat CodeRabbit rate limiting as a blocked/pending review state, never as success. A status like "review rate limited" means the review did not happen yet, usually because too many PRs or commits are competing for CodeRabbit at once.
- When CodeRabbit is rate limited, do not push empty commits or ask for manual re-reviews. Reduce the active review queue where possible, wait for the cooldown window, then check once after about 20 minutes.

### CI scope

- `config/e2e-impact-map.mjs` is the executable source of truth for affected
  preview and staging browser coverage. Do not rely on a prose claim that a
  journey was affected; update the map when a new subsystem or dependency edge
  is introduced.
- Every runtime PR runs permanent core sentinels against a real preview Worker,
  then every mapped spec. A changed Playwright spec always runs itself.
- High-impact and unclassified runtime paths fail safe to the full inventory.
  Documentation-only changes skip Worker deployment.
- Do not broaden a narrow PR to unrelated browser suites merely to appear safe.
  Do not narrow the map to make a failing required journey disappear.
- Every push to `staging` runs the complete suite against that exact SHA. The
  `staging` to `main` release PR reuses those checks without another deployment
  or qualification cycle. That full qualification remains mandatory before
  production promotion.

## Local Dependencies

Fresh worktrees usually do not have `node_modules`.

1. Check first:

   ```bash
   test -d node_modules && printf yes || printf no
   ```

2. If absent, run:

   ```bash
   yarn install --frozen-lockfile
   ```

3. If the install fails because the sandbox cannot reach the package registry, rerun the same command with network approval instead of continuing with broken local validation.

## Local Runtime Baseline

Before installing dependencies or running validation, read
[the Node runtime upgrade runbook](../operations/node-runtime-upgrades.md) and
verify that the active Node runtime exactly matches `.nvmrc`:

```bash
which node
node -v
printf 'expected v%s\n' "$(tr -d '\n' < .nvmrc)"
node -e "console.log(v8.getHeapStatistics().heap_size_limit)" -r v8
```

Do not run validation until the reported and expected versions match. Codex
desktop sessions may inherit the machine's default shell `node` instead of the
workspace runtime. A bundled runtime is usable only when its version also
matches `.nvmrc`. If `yarn typecheck` or `yarn lint` then fails with V8 heap
exhaustion or the process is killed without a product error, keep the exact
runtime and give Node enough heap:

```bash
PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
NODE_OPTIONS=--max-old-space-size=8192 \
yarn typecheck
```

Use the same `PATH` and `NODE_OPTIONS` prefix for `yarn lint` and other heavy local checks. Production builds must run through `yarn build`, which configures its required heap itself. Do not invoke `nuxi build` directly or retry an initial default-heap failure. Scheduled jobs are exercised with `yarn test:scheduled-tasks` and the local `wrangler dev --test-scheduled` harness. Do this before describing a check as blocked; local validation is still required.

## Cloudflare Resource Readiness

When adding or changing `wrangler.toml` bindings, validate the remote
provisioning surface before opening or updating a PR:

```bash
yarn cloudflare:resources
```

For first-time provisioning of required Queues, run:

```bash
yarn cloudflare:resources --create
```

Durable Object classes are registered through Wrangler deploy migrations, so
also run `wrangler deploy --dry-run` for every affected environment
(`--env preview`, `--env staging`, and the top-level production config) after a
production build exists.

## Fresh Worktree Browser Setup

Do this before the first local browser/E2E run in a new worktree. Do not skip to selectors or app-code changes until this baseline is healthy.

```bash
yarn install --frozen-lockfile
yarn test:e2e:local tests/e2e/smoke.spec.ts
```

What each step prevents:

- `yarn install --frozen-lockfile`: avoids false failures such as `Cannot find package 'drizzle-orm'`.
- `yarn test:e2e:local`: applies the local schema, clears disposable E2E
  artifacts, seeds curated sites and verified synthetic Better Auth
  credentials, builds the production Worker, and runs it in local workerd.

If a browser test fails in a fresh worktree, check these setup symptoms first:

- `Process from config.webServer was not able to start`: run the documented
  preparation and built-Worker command visibly — `yarn e2e:local:prepare && yarn dev:worker:start` — and read the startup error.
- Better Auth reports `Invalid origin: http://krabiclaw.com` for a localhost
  request: stop the Worker and restart the documented command
  `yarn dev:worker:start`; do not repair this by changing application auth allowlists or by adding a production-origin override to `.env`.
- Better Auth returns `Failed to decrypt private key`: the local Worker and D1
  JWKS used different `BETTER_AUTH_SECRET` values. Use one Wrangler-native
  `.dev.vars` or `.env` value.
- MCP `create_site` returns `Failed to create site` and server logs show a foreign-key failure for `saya-theme-v1`: local seed has not been applied.
- Nuxt says it cannot bind `localhost` even when no process is listening: rerun the same dev/browser command outside the sandbox with approval. A sandbox socket failure is not product evidence.

For a focused local browser run:

```bash
PLAYWRIGHT_WORKERS=1 \
yarn test:e2e:local tests/e2e/onboarding-wizard.spec.ts \
  --project=chromium --workers=1 --grep "exact test name"
```

For dashboard, billing, or auth flows that touch Stripe-backed routes, also require the Stripe test values before running:

```bash
: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY to a Stripe test secret before dashboard E2E}"
: "${STRIPE_WEBHOOK_SECRET:?Set STRIPE_WEBHOOK_SECRET to a Stripe test webhook secret before dashboard E2E}"
: "${NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:?Set NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to a Stripe test publishable key before dashboard E2E}"
```

## Focused Testing

The repository's `yarn test:unit` script intentionally runs the whole `tests/unit/**/*.test.ts` suite. For focused validation in a worktree, use `yarn test:unit:file <path>` instead of expecting `yarn test:unit <file>` to narrow the suite.

Example:

```bash
yarn test:unit:file tests/unit/example.test.ts
```

Use full `yarn test:unit`, typecheck, lint, build, migration checks, and E2E suites when the PR scope or risk calls for them. In this repository, unit tests, lint, and typecheck are hygiene checks only. The large unit suite has repeatedly produced noise while missing the real product breakages; E2E and browser testing are the primary evidence that user-facing behavior works. See `docs/testing-strategy.md` for the repo taxonomy.

Do not add unit tests by default just to make a PR look tested. Add or update unit tests only when they protect a narrow pure contract, parser, mapper, permission predicate, schema guard, or regression boundary that browser tests cannot target directly. For product workflows, spend the testing budget on Playwright, browser checks, API contract checks exercised through the real route, and CI E2E smoke.

Any PR that changes a user-facing page, dashboard flow, CMS/editor behavior, auth navigation, MCP widget launch, or tenant public rendering needs real browser evidence before it is considered merge-ready. Prefer a relevant Playwright spec. If no spec exists, run the app and manually exercise the changed flow in a browser, then add the missing Playwright coverage when the workflow is important or likely to regress.

For the common browser-first paths, prefer:

```bash
yarn test:browser:smoke
yarn test:browser:dashboard
```

Report browser validation separately from unit/static validation:

- `Browser`: local Playwright pass, CI E2E smoke pass, manual browser check, or blocked with exact reason.
- `Static`: unit tests, lint, typecheck, guardrails, build, migration checks.

Do not summarize a PR as validated, ready, or safe to merge when browser validation is missing, pending, cancelled, or rate-limited. A local targeted Playwright pass is useful evidence; the PR-level `E2E smoke` check must still pass before merge confidence.

## Local E2E Environment

Local Playwright uses the production Worker build, local D1, and seeded Better
Auth credentials. Run the repository command instead of loading `.env` inside
Playwright or starting Nuxt's dev server:

```bash
yarn test:e2e:local tests/e2e/example.spec.ts --project=chromium --workers=1
```

Wrangler loads the repository's native local variable source for Worker
bindings. Playwright does not parse or mutate `.env`.

If an authenticated dashboard E2E reaches the right page but API calls return 500, check the response body before changing UI selectors. Missing local env such as `PREVIEW_SECRET` is a setup issue, not an app contract failure.

If Nuxt or Playwright cannot bind a local loopback port in the sandbox, verify no process is listening on that port, then rerun the exact same command with approval/outside the sandbox before declaring the E2E blocked. A sandbox socket failure is not evidence of a product regression.

Use `yarn dev` for the normal HMR application-development loop. Nitro emulates
the bindings declared in `wrangler.toml`, so dashboard/API work uses the same
local D1/KV/R2 state as Wrangler. A missing binding during a real inbound
`yarn dev` request is a local-runtime regression, not a supported limitation.

For manual browser inspection under the production Worker runtime, use:

```bash
yarn dev:worker
```

If `.output` was just built by another preparation command, use
`yarn dev:worker:start` to avoid rebuilding it. Wrangler watches the generated
Worker, not Nuxt source files; use `yarn dev` while editing.

Local tenant identity is carried by `x-preview-tenant` on the shared
`localhost` origin. For example, Blawby uses `x-preview-tenant: ncls` and its
menu routes are expected to return 404 because the service vertical has no
Saya menu module.

## Review Hygiene

- Do not call issues, bugs, or nearby failures "pre-existing" until you have opened the relevant files and know whether the fix is small.
- If a nearby issue is a small stale route, wrong link, dead fetch, or missing guard, fix it in the same pass.
- If it is genuinely larger, state why it is deferred and where it belongs.
