# CI / E2E Guardrails

This is the source of truth for avoiding local-vs-CI auth and billing drift in E2E.

## Tier intent

- The required PR lane builds for and deploys only isolated preview. Its
  representative suite covers public routing and dashboard API behavior.
- A push to `staging` deploys the staging Worker normally, applies migrations,
  and then runs the full Playwright suite against that deployment.
- A push to `main` deploys production normally, applies migrations, and then
  runs read-only public browser smoke. There is no scheduled release lane.

## Recent staging lessons

- Staging-only fixes are acceptable when they restore parity with the real deployed path:
  - idempotent remote seeds
  - build steps that do not depend on third-party network fetches
  - per-spec timeout adjustments when the assertions are still required and the test is just longer on remote infrastructure
- Staging should not silently lose product coverage just to go green. If a test is removed, narrowed, or bypassed, document why it no longer represents intended production behavior.

## Better Auth fixture contract

- `config/e2e-auth-fixtures.ts` is the registry of synthetic browser-test
  identities. Do not attach a test password to a real client or operator email.
- `scripts/provision-e2e-auth.ts` marks those synthetic emails verified, writes
  credential accounts, and attaches only their declared fixture memberships.
  A real inbox is not part of E2E setup.
- Playwright generates a random `E2E_TEST_PASSWORD` in memory for each local
  run and passes it to the local preparation process. Preview and staging do
  the same in their GitHub Actions job, mask it immediately, provision it after
  the curated seed, and expose it only to that run's Playwright process. No
  test password is stored in the repository.
- Authenticated tests use `loginAs()` to call Better Auth's email sign-in API.
  If the fixture declares a membership, the helper then calls Better Auth's
  organization `set-active` endpoint; it never writes a session cookie itself.
- `/api/dev/login` does not exist. Tests and scripts must never mint sessions,
  sign cookies, or auto-create users through an application route.
- `E2E_ALLOW_DEV_ROUTES` and `E2E_DEV_ROUTE_SECRET` protect read-only fixture
  inspection and deterministic trigger routes. They are not authentication.
- In CI override mode, the dev-route secret is sent only through the
  `x-dev-route-secret` header, never a query parameter.

## CI env parity (required for dashboard E2E)

Remote preview and staging browser jobs that exercise dashboard/billing must include:

- `STRIPE_SECRET_KEY` (use test key in CI)
- `STRIPE_WEBHOOK_SECRET`
- `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `E2E_ALLOW_DEV_ROUTES=true`
- `E2E_DEV_ROUTE_SECRET`

Without Stripe keys, dashboard load can emit server errors from billing APIs and fail strict console-error assertions.

## Cloudflare local bindings in CI

For local Miniflare-backed tests, keep bindings with `remote = false` in `wrangler.toml`:

- `[[d1_databases]]`
- `[[r2_buckets]]`
- `[[kv_namespaces]]`
- `[ai]`

Local Playwright runs build the production bundle and start it with
`wrangler dev --local` with the built Nitro Worker at
`.output/server/index.mjs`;
without it Wrangler derives the upstream from the production route and rewrites
local `Host` and same-origin `Origin` headers to `krabiclaw.com`. Local tenant
tests use the same shared-host `x-preview-tenant` routing contract as preview
and staging.

## Triage checklist when CI fails but local passes

1. Confirm `gh secret list` contains all expected secrets.
2. Confirm workflow `env:` passes required secrets into the failing job.
3. Confirm the failing user exists in `config/e2e-auth-fixtures.ts` and was provisioned after the curated seed.
4. Confirm its declared organization/team membership matches the permission the test is proving.
5. Confirm remote seeds are idempotent on repeated runs, especially for unique fields like `sites.subdomain`.
6. Confirm production smoke targets are still intentionally active customer/platform domains.

## PR execution and guardrails

- Draft pull requests do not deploy or run remote E2E. Marking a PR ready, or pushing a new commit after it is ready, starts the preview deployment and smoke suite.
- PR descriptions must include filled `Browser:` and `Static:` validation lines. `Browser` is for Playwright, CI E2E, or manual browser evidence; `Static` is for unit, lint, typecheck, build, and guardrail evidence.
- Preview seeds are generated into one SQL bundle and applied with one remote D1 operation. The bundle remains idempotent and uses the same real preview D1, migration flow, fixed secrets, and deployed Worker as before.
- Required preview coverage is one representative browser suite.
- The full `yarn test:e2e:full` suite runs after every successful staging
  deployment. Production runs only the read-only public rendering sentinel.
- CI defaults to two Playwright workers. Stateful notification, MCP, and client suites explicitly use one worker against shared remote D1.
- The seed, migration, tool-parity, and script-syntax checks run together in one Node-only job, avoiding redundant dependency installations.
