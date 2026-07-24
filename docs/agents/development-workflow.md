# Agent Development Workflow

Use this workflow when running Codex or Claude agents in parallel worktrees.

## Worktrees And Branches

- Start each issue from current `staging` in its own worktree and focused branch.
- Do not reuse stale PR branches as implementation branches. Mine them for useful commits or UI ideas, then port onto fresh `staging`.
- Before opening a PR, fetch/rebase onto latest `origin/staging`.
- Keep one issue per PR unless the user explicitly approves a combined integration branch.
- Do not merge without explicit user approval.

## Pull Requests

- Open regular PRs to `staging`, not drafts, so smoke tests run.
- CodeRabbit reviews normal PRs automatically on commits. Do not comment just to request a review unless the user asks.
- After opening or pushing a PR, do one immediate status check and report the PR URL plus current check state.
- Do not poll GitHub or CodeRabbit every few seconds. If checks or CodeRabbit are still pending, schedule or ask for a follow-up about 20 minutes later.
- When CodeRabbit or CI reports actionable feedback, address it in the same worktree, push once the fix is coherent, then do one immediate status check again.
- Treat CodeRabbit rate limiting as a blocked/pending review state, never as success. A status like "review rate limited" means the review did not happen yet, usually because too many PRs or commits are competing for CodeRabbit at once.
- When CodeRabbit is rate limited, do not push empty commits or ask for manual re-reviews. Reduce the active review queue where possible, wait for the cooldown window, then check once after about 20 minutes.

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

## Fresh Worktree Browser Setup

Do this before the first local browser/E2E run in a new worktree. Do not skip to selectors or app-code changes until this baseline is healthy.

```bash
yarn install --frozen-lockfile
yarn schema:local
yarn seed:local
```

What each step prevents:

- `yarn install --frozen-lockfile`: avoids false failures such as `Cannot find package 'drizzle-orm'`.
- `yarn schema:local`: creates current local D1 tables. Without it, Better Auth initialization can 500 on routes like `/api/dev/login` with `no such table: oauthResource`.
- `yarn seed:local`: inserts required local fixtures such as `saya-theme-v1`. Without it, flows like MCP `create_site` can fail with foreign-key errors when inserting a site.

If a browser test fails in a fresh worktree, check these setup symptoms first:

- `Process from config.webServer was not able to start`: run the same `yarn dev` command visibly and read the startup error.
- `/api/dev/login` returns 500 with `oauthResource`: local schema has not been applied.
- MCP `create_site` returns `Failed to create site` and server logs show a foreign-key failure for `saya-theme-v1`: local seed has not been applied.
- Nuxt says it cannot bind `localhost` even when no process is listening: rerun the same dev/browser command outside the sandbox with approval. A sandbox socket failure is not product evidence.

For MCP-focused local browser validation after the setup above:

```bash
NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_APP_NAME=KrabiClaw \
PREVIEW_SECRET=ci-preview-secret \
E2E_DEV_ROUTE_SECRET=ci-dev-route-secret \
EMAIL_DELIVERY_MODE=log_only \
WHATSAPP_DELIVERY_MODE=log_only \
PLAYWRIGHT_WORKERS=1 \
npx playwright test tests/e2e/mcp.spec.ts --project=chromium --workers=1 --grep "exact test name"
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

Fresh worktrees usually do not have a local `.env`. Nuxt validates required public runtime vars at startup, and editor preview endpoints require `PREVIEW_SECRET`. If Playwright times out waiting for `/api/dev/ready`, start the same dev command visibly before assuming the browser test is broken.

For local Playwright runs that use dev login routes, editor previews, dashboard pages, or billing/auth flows, first run the Fresh Worktree Browser Setup above. Then export the local-safe values and real Stripe test values in the same command so Playwright's `webServer` child receives them:

```bash
: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY to a Stripe test secret before dashboard E2E}"
: "${STRIPE_WEBHOOK_SECRET:?Set STRIPE_WEBHOOK_SECRET to a Stripe test webhook secret before dashboard E2E}"
: "${NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:?Set NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to a Stripe test publishable key before dashboard E2E}"

NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_APP_NAME=KrabiClaw \
STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" \
PREVIEW_SECRET=ci-preview-secret \
E2E_ALLOW_DEV_ROUTES=true \
E2E_DEV_ROUTE_SECRET=ci-dev-route-secret \
EMAIL_DELIVERY_MODE=log_only \
WHATSAPP_DELIVERY_MODE=log_only \
npx playwright test tests/e2e/example.spec.ts --project=chromium --workers=1
```

If an authenticated dashboard E2E reaches the right page but API calls return 500, check the response body before changing UI selectors. Missing local env such as `PREVIEW_SECRET` is a setup issue, not an app contract failure.

If Nuxt or Playwright cannot bind a local loopback port in the sandbox, verify no process is listening on that port, then rerun the exact same command with approval/outside the sandbox before declaring the E2E blocked. A sandbox socket failure is not evidence of a product regression.

## Review Hygiene

- Do not call issues, bugs, or nearby failures "pre-existing" until you have opened the relevant files and know whether the fix is small.
- If a nearby issue is a small stale route, wrong link, dead fetch, or missing guard, fix it in the same pass.
- If it is genuinely larger, state why it is deferred and where it belongs.
