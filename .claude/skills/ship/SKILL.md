---
name: ship
description: "The one path from a code change to staging in this repo: local CodeRabbit CLI, the exact Checks gates, affected local e2e, browser proof, a draft PR flipped to ready once, merge on green, close and board the issues. Invoke for any change that will become a PR, whether you are implementing or orchestrating."
---

# Ship

KrabiClaw has one shared preview deployment, so every PR's E2E job runs
serially behind every other PR's. A ready PR costs 5 minutes when its changed
files are classified and 13 when they are not, and every push to a ready PR
pays again. CodeRabbit's local CLI and web review are both rate-limited. The
whole procedure below exists to spend each of those exactly once per PR.

Read `AGENTS.md` first. It says what must be true; this file says the order.

## 0. Worktree

One worktree per PR, cut from `origin/staging`, under `.tmp/wt-<topic>`.
Copy `.env` in. `nuxt dev` runs once per machine, so a second worktree serves
its built worker instead:

```bash
corepack yarn build && corepack yarn wrangler dev .output/server/index.mjs --assets .output/public --local --port <N>
```

Never `git stash`; other sessions share the stash stack.

## 1. Implement, then prove it in the browser

Nothing is done until it is measured. A surface claim comes from loading the
surface; a data claim from a query; a behaviour claim from running it. Sign in
locally as `developer@playwright.example` with `LOCAL_DEVELOPER_PASSWORD` from
`.env`. For production reads, drive an already-open krabiclaw.com tab through
AppleScript `execute tab javascript`; never sign in for the user.

Open the issue's checklist and prove each item. Then run an adversarial pass:
boundary values, rows persisted by the previous schema, real latency. Write
"not checked" only for what genuinely needs the deployed preview.

## 2. CodeRabbit, once per commit, through the gate

```bash
node scripts/coderabbit-gate.mjs review
```

Never call the CLI directly and never pass `--use-credits`. The gate refuses a
dirty tree, refuses when the rolling hour is spent (`status` says when the next
slot opens), refuses a diff over the plan's files-per-review cap, and reviews
committed HEAD against `staging`. Fix every finding, commit, and run it again
on the new HEAD. A finding you believe is wrong stays a finding until the
re-review agrees; say why in the PR body if it does not.

A review belongs to one commit SHA. A committed PreToolUse hook runs
`coderabbit-gate.mjs check` before `gh pr ready`, `gh pr merge` and any push
to staging, and blocks unless the exact commit being shipped has a completed
review in the CLI's own store with zero open findings. There is no flag to skip
it. Budget accordingly: the plan allows a few reviews per developer per rolling
hour, so run the change to completion before spending one.

## 3. The Checks job, step for step

Run exactly what `.github/workflows/ci.yml` runs in `Checks`, in order. Lint
and typecheck alone have shipped two red pushes.

```bash
corepack yarn quality && corepack yarn test:unit && corepack yarn test:d1 && corepack yarn mcp:catalog && corepack yarn chatgpt:submission:check && corepack yarn lint:migrations && corepack yarn lint:schema-drift && corepack yarn test:migrations
```

If an MCP tool schema changed, `corepack yarn mcp:catalog:write` first; the
catalog check fails on drift. If the ChatGPT submission changed,
`chatgpt:submission:write`.

## 4. Affected e2e, locally

Ask the selector what CI will run and run the same specs against the worktree's
worker:

```bash
node scripts/select-preview-e2e.mjs --base $(git merge-base origin/staging HEAD) --head HEAD --github-output /dev/stdout
PLAYWRIGHT_PORT=<N> corepack yarn playwright test <specs it named> --project=chromium --workers=1
```

If it prints `Unclassified runtime files promoted to full coverage`, classify
those files in `scripts/select-preview-e2e.mjs` in this PR. Every unclassified
file turns a 5-minute E2E job into a 13-minute one for every PR that touches
it afterwards.

## 5. Open the PR as a draft

Drafts run `Checks` only. They skip the shared preview E2E and skip web
CodeRabbit. Push as often as you like while it is a draft.

```bash
gh pr create --draft --base staging --assignee paulchrisluke --title "<what changes, in the repo's voice>" --body-file <body>
```

The body says what was measured, how, and what is "not checked". It names the
issues it closes. Add the PR to the project board when the token has the
`project` scope (`gh project item-add`); otherwise say so in the handoff.

## 6. Ready once

Flip to ready only when steps 1 to 4 are all green on the exact HEAD you are
about to qualify:

```bash
gh pr ready <number>
```

Then stop. Do not poll, do not `gh run watch`, do not schedule a wakeup, do not
write "still running". The owner watches CI. Act when the check notification
arrives. Every push after ready re-queues the shared preview, so a fix after
ready goes back through steps 2 to 4 first.

## 7. Green: merge, close, board

CI green on the exact SHA is the only gate for staging.

```bash
gh pr merge <number> --merge --delete-branch
```

PRs target `staging`, so GitHub's `Closes #N` does not fire. Close each issue
yourself with one comment that links the PR and quotes the measurement that
proves each checklist item, or says which item is still open and why. Move the
board card. Remove the worktree.

A staging fix that is not a feature goes straight to `staging` with no PR,
after steps 2 and 3.

## Orchestrating several PRs

- One issue plan, larger PRs grouped by surface so parallel worktrees do not
  edit the same files.
- Implementers run steps 0 to 5 and hand back the draft PR URL plus the
  measured claim list. The orchestrator does step 2's review of that list and
  the adversarial pass before step 6, because that is where the 40-minute
  mistakes come from.
- Flip PRs to ready as they qualify and merge each on green immediately. The
  preview queue only exists while several PRs are ready at once.
- Handoffs are one short block: what landed, what was measured, what is not
  checked. No status tables, no restating, no offers of more work.
