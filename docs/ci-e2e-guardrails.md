# CI / E2E Guardrails

This is the source of truth for avoiding local-vs-CI auth and billing drift in E2E.

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

`e2e-smoke` and `e2e-full` must include:

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

## Triage checklist when CI fails but local passes

1. Confirm `gh secret list` contains all expected secrets.
2. Confirm workflow `env:` passes required secrets into the failing job.
3. Confirm no dev login query secret usage remains in tests.
4. Confirm dev login selected user is non-admin, non-platform-owner, and has org membership.
