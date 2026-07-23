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

## Review Hygiene

- Do not call issues, bugs, or nearby failures "pre-existing" until you have opened the relevant files and know whether the fix is small.
- If a nearby issue is a small stale route, wrong link, dead fetch, or missing guard, fix it in the same pass.
- If it is genuinely larger, state why it is deferred and where it belongs.
