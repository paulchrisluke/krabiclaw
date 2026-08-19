# CI / E2E Guardrails

This is the source of truth for avoiding local-vs-CI auth and billing drift in E2E.

## Tier intent

- The required PR lane builds for and deploys only isolated preview. Permanent
  core sentinels cover public routing, dashboard API behavior, the authenticated
  Pages lifecycle, and authenticated inbox hydration. The executable impact map
  adds the Playwright specs affected by the PR diff.
- A push to `staging` deploys the stable staging Worker normally, applies
  migrations, provisions deterministic review fixtures, and restores the durable
  staging-review identity. It does not reset the human-review database for E2E.
- The ordinary `staging` to `main` pull request builds its exact head once and
  fans the same artifact out to four isolated deployed Workers. Each lane runs
  one Playwright shard with `workers=1`; all four shards are required before
  production promotion.
- A push to `main` deploys production normally, applies migrations, and then
  runs read-only public browser smoke. There is no scheduled release lane.

## Recent staging lessons

- Staging-only fixes are acceptable when they restore parity with the real deployed path:
  - idempotent remote seeds
  - build steps that do not depend on third-party network fetches
  - environment routing, bindings, credentials, and fixture corrections proven
    against the normal deployed Worker
- Staging should not silently lose product coverage just to go green. If a test is removed, narrowed, or bypassed, document why it no longer represents intended production behavior.
- Do not add or increase timeouts as the first response to a remote failure.
  Locate the operation consuming the current budget, reproduce it through the
  production build and normal Wrangler path, and fix the application, fixture,
  or environment contract that was actually demonstrated.

## Better Auth fixture contract

- `config/e2e-auth-fixtures.ts` is the registry of synthetic browser-test
  identities. Do not attach a test password to a real client or operator email.
- `scripts/provision-e2e-auth.ts` marks those synthetic emails verified, writes
  credential accounts, and attaches only their declared fixture memberships.
  A real inbox is not part of E2E setup.
- Playwright generates a random `E2E_TEST_PASSWORD` in memory for each local
  run and passes it to the local preparation process. Preview and each isolated
  release-E2E lane do the same in their GitHub Actions job, mask it immediately,
  provision it after the curated seed, and expose it only to that run's
  Playwright process. No test password is stored in the repository.
- Authenticated tests use `loginAs()` to call Better Auth's email sign-in API.
  If the fixture declares a membership, the helper then calls Better Auth's
  organization `set-active` endpoint; it never writes a session cookie itself.
- `/api/dev/login` does not exist. Tests and scripts must never mint sessions,
  sign cookies, or auto-create users through an application route.
- `E2E_ALLOW_DEV_ROUTES` and `E2E_DEV_ROUTE_SECRET` protect read-only fixture
  inspection and deterministic trigger routes. They are not authentication.
- In CI override mode, the dev-route secret is sent only through the
  `x-dev-route-secret` header, never a query parameter.

### Durable staging-review identity

- The fixed synthetic identity is defined in `config/staging-review-auth.ts`,
  not in `E2E_AUTH_FIXTURES`.
- Its organization role is `editor` for Pottery House, Kikuzuki, and NCLS, with
  explicit site-team membership for those three sites. It has no platform-admin
  role.
- `scripts/provision-staging-review-auth.ts --staging` refuses preview, E2E, and
  unscoped targets. It preserves the existing credential and sessions unless
  `--rotate-password` is explicitly supplied.
- The password lives in the team password manager and is mirrored only as the
  GitHub Environment secret `STAGING_REVIEW_PASSWORD`. It is never committed,
  placed in `.env.example`, emitted in logs, or written to D1 in plaintext.
- `scripts/reset-e2e-artifacts.ts` explicitly excludes `user-staging-review`.

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

The deployed release lanes are separate from this local contract. The canonical
lane inventory is `config/e2e-lanes.json`; the generated Wrangler blocks are
checked by `yarn lint:e2e-environments`. Each lane has unique D1, KV, R2, queue,
and AI Search resources, explicit Durable Object bindings/migrations, and
`crons = []`. Workers AI remains shared because the suite treats it as a
read-only inference service; Stripe remains a shared test-mode provider and
all app-owned mutable state is lane-scoped.

Local Playwright runs build the production bundle and start it with
`wrangler dev --local` with the built Nitro Worker at
`.output/server/index.mjs`;
without it Wrangler derives the upstream from the production route and rewrites
local `Host` and same-origin `Origin` headers to `krabiclaw.com`. Local and raw
`workers.dev` tenant tests carry `x-preview-tenant`; deployed preview and
staging tests use direct first-level aliases such as
`pottery-house-preview.krabiclaw.com` and
`pottery-house-staging.krabiclaw.com`.

## Triage checklist when CI fails but local passes

1. Confirm `node -v` exactly matches `.nvmrc`; a different runtime is not a valid local comparison.
2. Confirm the local run used `yarn test:e2e:local`, the production build, `.output/server/index.mjs`, and normal local Wrangler.
3. Confirm `gh secret list` contains all expected secrets.
4. Confirm workflow `env:` passes required secrets into the failing job.
5. Confirm the failing user exists in `config/e2e-auth-fixtures.ts` and was provisioned after the curated seed.
6. Confirm its declared organization/team membership matches the permission the test is proving.
7. Confirm Demo, Pottery House, Kikuzuki, and NCLS were provisioned from their current typed definitions. Missing required fixtures are failures, not skips.
8. Confirm remote seeds are idempotent on repeated runs, especially for unique fields like `sites.subdomain`.
9. Confirm the deployed test used the direct environment tenant alias and did not depend on `x-preview-tenant`.
10. Confirm production smoke targets are still intentionally active customer/platform domains.

## PR execution and guardrails

- Draft pull requests do not deploy or run remote E2E. Marking a PR ready, or pushing a new commit after it is ready, starts the preview deployment and smoke suite.
- PR descriptions must include filled `Browser:` and `Static:` validation lines. `Browser` is for Playwright, CI E2E, or manual browser evidence; `Static` is for unit, lint, typecheck, build, and guardrail evidence.
- Preview seeds are generated into one SQL bundle and applied with one remote D1 operation. The bundle remains idempotent and uses the same real preview D1, migration flow, fixed secrets, and deployed Worker as before.
- `config/e2e-impact-map.mjs` maps product paths to explicit specs. A changed
  E2E spec selects itself, high-impact and unclassified runtime paths select the
  full inventory, and documentation-only changes skip Worker deployment.
- Required preview coverage is the permanent core plus every spec selected by
  that impact map. Reporting only the core check is not affected-flow evidence.
- The full `yarn test:e2e:full` suite runs as four shards on the exact staging
  head during the `staging` to `main` release PR. Production runs only the
  read-only public rendering sentinel.
- Preview remains one-worker and staging is the stable human-review deployment.
  Release qualification uses Playwright sharding across four isolated deployed
  Workers instead of multiple workers sharing remote state. Do not raise
  per-lane parallelism until that lane's mutable state is independently proven
  safe.
- Seed, migration, and tool-parity checks run in the shared checks job, avoiding
  redundant dependency installations.
