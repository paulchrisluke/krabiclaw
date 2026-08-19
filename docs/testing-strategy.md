# Testing Strategy

Release and outage decisions follow the mandatory
[release and outage prevention contract](operations/release-and-outage-prevention.md).
This document defines test-layer responsibilities; it does not authorize a
release when the deployed browser matrix has not been inspected.

KrabiClaw treats browser and E2E validation as the product gate. Unit tests, lint, typecheck, and static guardrails are hygiene unless they protect a narrow pure contract that browser tests cannot exercise directly.

## CI feedback loop

Pull requests and staging pushes use `config/e2e-impact-map.mjs` to select
browser coverage from the actual diff. Every deployed preview runs a small
permanent core, including authenticated dashboard Pages and inbox hydration
regressions, followed by the affected subsystem specs. A narrow Saya
presentation change therefore runs Saya/public tenant coverage without paying
for MCP, billing, notification, or unrelated dashboard suites.

The selector fails safe: schema, migration, Worker, Playwright-harness, and
unclassified application-runtime changes run the full inventory. Any changed
E2E spec selects itself. Documentation-only changes do not deploy a Worker.
Selection behavior is protected by unit and workflow-contract tests.

The complete Playwright suite remains mandatory on the exact staging head of
the `staging` to `main` release PR. This separates fast change feedback from
exhaustive release qualification without reducing the production gate.

## Local and deployed parity

Local browser results are meaningful only when they exercise the same product
shape as CI: the exact Node version in `.nvmrc`, a frozen dependency install,
fresh local migrations, all four required tenant fixtures, a production
Nuxt/Nitro build, and `.output/server/index.mjs` through normal local Wrangler.
`yarn test:e2e:local <specs>` owns that preparation. Do not substitute
`nuxt dev`, a mock server, a header-only tenant shortcut, or a different Node
runtime and call it CI parity.

Preview and staging then prove the environment-specific parts that local
Wrangler cannot: the deployed Worker route, remote D1/R2/KV/AI/queue/DO
bindings, direct tenant aliases, and real environment secrets. A local pass and
a deployed pass are complementary evidence.

All browser lanes treat console warnings, console errors, page errors,
hydration mismatches, failed first-party assets, unexpected 4xx responses, and
all 5xx responses as failures. Do not suppress those signals or increase a
timeout before identifying what operation consumed the existing budget.

Demo, Pottery House, Kikuzuki, and NCLS are required test data. Missing fixture
data must fail preparation in local, preview, and staging; a fixture-dependent
spec must not turn that absence into a skip.

## Taxonomy

Use unit tests for narrow, deterministic contracts:

- parsers, mappers, formatters, and serializers
- schema guards and migration-safety checks
- permission predicates and access matrices that are easier to exhaust in-process
- API-contract helpers where the route itself is covered elsewhere
- regression boundaries around bug-prone pure utilities

Use Playwright, browser checks, or route-level API checks for product behavior:

- dashboard navigation, CMS/editor workflows, onboarding, billing, support, and auth flows
- tenant public pages, route resolution, SSR detail pages, hydration, and console health
- MCP/ChowBot/widget flows that depend on real request context
- notification, booking, contact, reservation, and review submissions
- anything whose failure would be visible to a user in the browser

Delete or do not add unit tests that primarily:

- scan source files for component names, removed imports, or past implementation choices
- assert mocked product workflows without exercising the real route or page
- duplicate a Playwright route/browser check with lower confidence
- pin incidental DOM copy, Nuxt UI internals, or one-off refactor history

Keep static guardrails when they encode a durable repository rule, such as migration safety, Better Auth boundaries, seed hygiene, or tool parity.

## Targeted Commands

Use these for focused local validation:

```bash
yarn test:unit:file tests/unit/dashboard-links.test.ts
yarn test:browser:smoke
yarn test:browser:dashboard
```

Use `yarn test:unit` only when the PR risk calls for the full unit glob. Passing the whole unit suite is not enough to call a user-facing change validated.

For a Node runtime upgrade, follow
[the Node runtime upgrade runbook](operations/node-runtime-upgrades.md); its
required full local Worker run is broader than these focused commands.

## First Reduction Pass

The first conservative pass removed `tests/unit/dashboard-nuxt-ui-consolidation.test.ts`. That file scanned source text for removed component names and implementation details from an old dashboard cleanup. The useful behavior is now covered through `tests/e2e/dashboard.spec.ts`, which exercises the real dashboard shell, search trigger, account menu, and responsive sidebar in a browser.
