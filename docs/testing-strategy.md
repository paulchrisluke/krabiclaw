# Testing Strategy

KrabiClaw treats browser and E2E validation as the product gate. Unit tests, lint, typecheck, and static guardrails are hygiene unless they protect a narrow pure contract that browser tests cannot exercise directly.

## Current Inventory

As of the issue #418 audit on staging:

- `tests/unit`: 108 files before this pass.
- `tests/e2e`: 32 Playwright specs.
- `yarn test:unit` intentionally runs the whole unit glob.
- PR and staging E2E run against deployed Cloudflare Workers, seeded D1, and real route behavior.

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

## PR Evidence

Every PR description must include filled validation lines:

```text
Browser: Playwright dashboard smoke passed locally; PR E2E smoke pending.
Static: yarn check:pr-validation passed; targeted unit file passed.
```

If browser validation is blocked, state the exact blocker. Do not describe the PR as ready to merge until Browser evidence is present and the PR-level E2E gate is green.

## First Reduction Pass

The first conservative pass removed `tests/unit/dashboard-nuxt-ui-consolidation.test.ts`. That file scanned source text for removed component names and implementation details from an old dashboard cleanup. The useful behavior is now covered through `tests/e2e/dashboard.spec.ts`, which exercises the real dashboard shell, search trigger, account menu, and responsive sidebar in a browser.
