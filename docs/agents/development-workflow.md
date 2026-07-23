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

## Focused Testing

The repository's `yarn test:unit` script intentionally runs the whole `tests/unit/**/*.test.ts` suite. For focused validation in a worktree, call Node's test runner directly with the specific files instead of expecting `yarn test:unit <file>` to narrow the suite.

Example:

```bash
node --experimental-strip-types --experimental-test-module-mocks --import ./tests/unit/support/register-aliases.mjs --test tests/unit/example.test.ts
```

Use full `yarn test:unit`, typecheck, lint, build, migration checks, and E2E suites when the PR scope or risk calls for them. If a local E2E fails because the dev server, loopback host, secure cookies, or provider secrets are unavailable, document the exact blocker and use the closest meaningful browser/API verification rather than claiming the E2E passed.

## Local E2E Environment

Fresh worktrees usually do not have a local `.env`. Nuxt validates required public runtime vars at startup, and editor preview endpoints require `PREVIEW_SECRET`. If Playwright times out waiting for `/api/dev/ready`, start the same dev command visibly before assuming the browser test is broken.

For local Playwright runs that use dev login routes or editor previews, export the local-safe values in the same command so Playwright's `webServer` child receives them:

```bash
NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:3000 \
NUXT_PUBLIC_APP_NAME=KrabiClaw \
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
