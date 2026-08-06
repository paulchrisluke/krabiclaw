# CI / E2E Guardrails

This is the source of truth for avoiding local-vs-CI auth and billing drift in E2E.

## Tier intent

- `e2e-smoke` on preview proves the app still deploys and basic public, tenant, auth, write, billing, and deployment contracts work on a live Cloudflare Worker.
- `e2e-staging` always runs the same minimal smoke after deployment, then runs subsystem and client suites selected from the staging push's changed paths.
- `E2E full regression` runs nightly and on manual dispatch against staging. It owns exhaustive browser/client verification and does not block ordinary PRs or staging pushes.
- `prod-smoke` on `main` should probe only domains and routes we deliberately keep live in production. Intentionally disabled customer domains are not valid production smoke targets.

## Recent staging lessons

- Staging-only fixes are acceptable when they restore parity with the real deployed path:
  - idempotent remote seeds
  - build steps that do not depend on third-party network fetches
  - per-spec timeout adjustments when the assertions are still required and the test is just longer on remote infrastructure
- Staging should not silently lose product coverage just to go green. If a test is removed, narrowed, or bypassed, document why it no longer represents intended production behavior.

## Dev login route rules

- `GET /api/dev/login` is dev-only unless `E2E_ALLOW_DEV_ROUTES=true`.
- In CI override mode, the secret must be sent only via `x-dev-route-secret` header.
- Do not pass dev-route secret in query params (no `?secret=...`).

## E2E helper contract

- Use `devLoginUrl(baseURL, userId?)` for URL only.
- Use `devLoginHeaders()` for secret header injection.
- Any test calling dev login must pass:
  - `request.get(devLoginUrl(baseURL), { headers: devLoginHeaders() })`

## CI env parity (required for dashboard E2E)

`e2e-smoke`, `e2e-staging`, and `e2e-full` must include:

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

`yarn dev` also disables Wrangler remote bindings at the bridge layer by default (`NUXT_CF_REMOTE_BINDINGS` must be explicitly set to `true` to opt back in). Without that, Wrangler can try to open a remote Workers AI proxy session before attaching local tenant bindings, which makes seeded `*.localhost` tenant routes fail as `Site Not Found`.

## Triage checklist when CI fails but local passes

1. Confirm `gh secret list` contains all expected secrets.
2. Confirm workflow `env:` passes required secrets into the failing job.
3. Confirm no dev login query secret usage remains in tests.
4. Confirm dev login selected user is non-admin, non-platform-owner, and has org membership.
5. Confirm remote seeds are idempotent on repeated runs, especially for unique fields like `sites.subdomain`.
6. Confirm production smoke targets are still intentionally active customer/platform domains.

## PR execution and guardrails

- Draft pull requests do not deploy or run remote E2E. Marking a PR ready, or pushing a new commit after it is ready, starts the preview deployment and smoke suite.
- PR descriptions must include filled `Browser:` and `Static:` validation lines. `Browser` is for Playwright, CI E2E, or manual browser evidence; `Static` is for unit, lint, typecheck, build, and guardrail evidence.
- Preview seeds are generated into one SQL bundle and applied with one remote D1 operation. The bundle remains idempotent and uses the same real preview D1, migration flow, fixed secrets, and deployed Worker as before.
- `e2e-smoke` and every staging deployment run `yarn test:e2e:smoke`. Staging adds path-gated `auth`, `dashboard`, `billing`, `notifications`, `mcp`, `seo`, Pottery House, and Blawby suites.
- The full `yarn test:e2e:full` suite and exhaustive client verifiers run in `.github/workflows/e2e-full.yml`. Failures retain Playwright reports/screenshots and are reported in the workflow summary, but are not a required development gate.
- CI defaults to two Playwright workers. Stateful notification, MCP, and client suites explicitly use one worker against shared remote D1.
- The seed, migration, tool-parity, and script-syntax checks run together in one Node-only job, avoiding redundant dependency installations.
