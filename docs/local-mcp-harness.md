# Local MCP Harness

This is the supported **local-but-public** test mode for exercising KrabiClaw
the way ChatGPT does: through a real HTTPS connector URL, Better Auth OAuth,
Cloudflare-backed dependencies, and the existing MCP smoke scripts.

Recommended default: **hybrid local mode**

- the app runs locally with `yarn dev:tunnel`
- public HTTPS comes from the Cloudflare tunnel in [tunnel.yml](../tunnel.yml)
- Better Auth, MCP, and the ChatGPT connector all point at the same public origin
- `/api/dev/*` routes stay protected by `E2E_DEV_ROUTE_SECRET`
- Cloudflare-backed behavior stays real where the connector depends on it

## Environment contract

Copy the MCP-specific values from [.env.mcp.local.example](../.env.mcp.local.example)
into your real `.env`.

Required values:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `MCP_BASE_URL`
- `E2E_ALLOW_DEV_ROUTES=true`
- `E2E_DEV_ROUTE_SECRET`
- either `MCP_DEV_LOGIN=1` or `MCP_BEARER_TOKEN`

Canonical local origin:

- `https://local.krabiclaw.com`

These three must match exactly:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `MCP_BASE_URL`

If they drift, ChatGPT connector auth will look like a reconnect or issuer/resource
problem even when the app itself is healthy.

## Tunnel contract

`yarn tunnel` reads [tunnel.yml](../tunnel.yml). Before first use:

1. download the `krabiclaw-local` tunnel credentials JSON from Cloudflare Zero Trust
2. place it at the `credentials-file` path in [tunnel.yml](../tunnel.yml), or update that path for your machine
3. keep `hostname: local.krabiclaw.com` unless you are intentionally using a different local harness host

The tunnel hostname is part of the auth contract, not just a convenience URL.

Current Cloudflare-side source of truth:

- tunnel name: `krabiclaw-local`
- tunnel id: `ba36c78c-9e7d-4312-be92-63a58d96baba`
- hostname: `local.krabiclaw.com`
- origin service: `http://localhost:3000`

## Dependency policy

Use the real Cloudflare-backed path for:

- Better Auth OAuth and MCP resource metadata
- `/api/mcp` and `/api/mcp/platform`
- D1, R2, and KV behavior that the connector depends on
- AI Gateway flows that fetch ChatGPT-uploaded files or generated-image references

Use the dev-login shortcut when the goal is product behavior rather than OAuth correctness:

- `scripts/check-mcp-edit-flow.mjs`
- `scripts/check-mcp-ops-flow.mjs`
- `scripts/check-mcp-image-flow.mjs`

Use the OAuth-true path when the bug involves:

- reconnect loops
- token attachment
- issuer/resource mismatch
- file reference handling from ChatGPT
- “works in one click, fails on reconnect” behavior

## Startup

In terminal 1:

```bash
yarn dev:tunnel
```

In terminal 2:

```bash
yarn tunnel
```

Then run the preflight harness:

```bash
yarn test:mcp:local
```

What it checks:

1. required env vars are present
2. `BETTER_AUTH_URL`, `NUXT_PUBLIC_PLATFORM_DOMAIN`, and `MCP_BASE_URL` match
3. `tunnel.yml` hostname matches the auth origin
4. `tunnel.yml` tunnel id matches the canonical `krabiclaw-local` tunnel
5. remote Cloudflare tunnel config still matches the checked-in local contract when `CF_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are available
6. `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` are healthy
7. unauthenticated `server/discover` and `tools/call` behave correctly
8. `/api/dev/login` and `/api/dev/mcp-telemetry` are reachable with the dev secret
9. `scripts/check-mcp-app-contract.mjs` passes

By default this is **non-destructive**.

To run the authenticated write-smoke flows too:

```bash
yarn test:mcp:local -- --write-smoke
```

That runs:

- `scripts/check-mcp-edit-flow.mjs`
- `scripts/check-mcp-ops-flow.mjs`
- `scripts/check-mcp-image-flow.mjs`

If you do not pass `MCP_SITE_ID`, the write-smoke scripts may create scratch data.

## Reusable test login for the ChatGPT consent screen

`MCP_DEV_LOGIN`/`MCP_BEARER_TOKEN` bypass login entirely for the headless smoke
scripts. They do not help with the one step that still requires a human: the
real Better Auth OAuth consent screen ChatGPT shows during connector setup and
on reconnect.

To avoid re-signing-up every time, add a standing test account's credentials
to your local `.env` as `LOCAL_MCP_TEST_EMAIL` / `LOCAL_MCP_TEST_PASSWORD`
(see [.env.mcp.local.example](../.env.mcp.local.example)) and reuse it at the
real `/login` page when ChatGPT redirects there. Never commit real values for
these — they stay local-only, same as any other `.env` secret.

## Tool catalog size and `tools/list`

`/api/mcp` and `/api/mcp/platform` detect the ChatGPT connector's user agent
(`openai-mcp/...`) and send a leaner `tools/list` payload to it — dropping
`outputSchema`, `annotations`, and the duplicate top-level `securitySchemes`
per tool, since those aren't needed for tool selection and materially bloat
the catalog. Everything else (`inspector`, curl, the local harness scripts)
still gets the full catalog for debugging.

If a connector shows a stream/connection error right after auth succeeds
(bearer token accepted, `tools/list` telemetry present) rather than during
OAuth itself, suspect catalog size before suspecting auth — compare the
`tools/list` response size for a real `openai-mcp/` user agent against a
manual request without that header.

## Human + LLM handoff

The LLM can fully drive:

- MCP contract checks
- edit/ops/image smoke scripts
- D1 telemetry reads
- Cloudflare GraphQL status inspection
- local tunnel preflight verification
- Cloudflare tunnel contract verification against the real `krabiclaw-local` tunnel

The human is still required for the ChatGPT-hosted part:

1. start the app and tunnel
2. confirm the tunnel hostname matches the auth origin
3. connect the app in ChatGPT Developer Mode
4. approve OAuth in the browser
5. optionally capture a fresh `MCP_BEARER_TOKEN`

After that handoff, the LLM can rerun the harness, replay bearer-token flows,
and compare telemetry before/after the manual ChatGPT step.
