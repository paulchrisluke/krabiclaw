# Local MCP Harness

This is the supported **local-but-public** test mode for exercising KrabiClaw
the way ChatGPT does: through a real HTTPS connector URL, Better Auth OAuth,
Cloudflare-backed dependencies, and the existing MCP smoke scripts.

Recommended default: **hybrid local mode using a `trycloudflare.com` quick tunnel**

- the app runs locally with `yarn dev:tunnel`
- public HTTPS comes from `cloudflared tunnel --url http://localhost:3000` (a quick,
  account-less tunnel — see "Tunnel contract" below for why the named
  `krabiclaw-local` tunnel in [tunnel.yml](../tunnel.yml) does not currently work)
- Better Auth, MCP, and the ChatGPT connector all point at the same public origin
- `/api/dev/*` routes stay protected by `E2E_DEV_ROUTE_SECRET`
- Cloudflare-backed behavior stays real where the connector depends on it

## Environment contract

Copy the MCP-specific values from [.env.mcp.local.example](../.env.mcp.local.example)
into `.dev.vars` — **not** `.env`. `BETTER_AUTH_URL`, `NUXT_PUBLIC_PLATFORM_DOMAIN`,
and `MCP_BASE_URL` are read from the Cloudflare-bound env (`server/utils/auth.ts`'s
`CloudflareEnv`, sourced from wrangler's `getPlatformProxy` in
`build/runtime/cloudflare-bindings-dev.ts`), which only ever loads `.dev.vars`.
Putting them in `.env` silently does nothing for Better Auth's origin check.

Required values:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `MCP_BASE_URL`
- `E2E_ALLOW_DEV_ROUTES=true`
- `E2E_DEV_ROUTE_SECRET`
- either `MCP_DEV_LOGIN=1` or `MCP_BEARER_TOKEN`

`E2E_ALLOW_DEV_ROUTES` and `E2E_DEV_ROUTE_SECRET` are read directly from
`process.env` by `assertDevRouteAllowed` in `server/utils/dev-route-auth.ts` —
unlike `BETTER_AUTH_URL`/`NUXT_PUBLIC_PLATFORM_DOMAIN`/`MCP_BASE_URL`, putting
them in `.dev.vars` alone is **not** enough once the dev server is exposed
through a real tunnel hostname (it works on plain `localhost` because
`assertDevRouteAllowed` short-circuits for local hostnames). Export both into
the actual shell that runs `yarn dev:tunnel` before starting it, e.g.:

```bash
export E2E_ALLOW_DEV_ROUTES=true
export E2E_DEV_ROUTE_SECRET=<same value as in .dev.vars>
yarn dev:tunnel
```

Otherwise `/api/dev/login` and `/api/dev/mcp-telemetry` 403 even with a
correct `x-dev-route-secret` header, because the server process never saw the
expected secret.

Canonical local origin (once the named-tunnel route conflict below is fixed):

- `https://local.krabiclaw.com`

Until then, use a `trycloudflare.com` quick tunnel URL as the base origin
instead (see "Tunnel contract").

These three must match exactly:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `MCP_BASE_URL`

If they drift, ChatGPT connector auth will look like a reconnect or issuer/resource
problem even when the app itself is healthy.

### Switching back to plain local dev

`.dev.vars` is shared — plain `yarn dev` and `yarn dev:tunnel` both read the same
file, and `yarn dev:tunnel`'s inline `BETTER_AUTH_URL=... NUXT_PUBLIC_PLATFORM_DOMAIN=...`
prefix only sets `process.env` for the Nuxt/Node process; it does **not** reach
the Cloudflare-bound `env` object the origin check reads, so it can't override
`.dev.vars` for you.

Plain dashboard/CMS local dev (`yarn dev` against `http://localhost:3000`, no
tunnel) requires these three set back to the localhost origin:

```env
BETTER_AUTH_URL=http://localhost:3000
NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000
MCP_BASE_URL=http://localhost:3000
```

If you leave the tunnel origin (`https://local.krabiclaw.com` or a
`trycloudflare.com` URL) in `.dev.vars` after an MCP session, plain `yarn dev`
login breaks with `403 Invalid origin` on `POST /api/auth/sign-in/email` — the
request's actual origin (`http://localhost:3000`) no longer matches
`BETTER_AUTH_URL`. Restart `yarn dev` after editing `.dev.vars`; the wrangler
platform proxy only reads it at boot.

The MCP harness (`yarn dev:tunnel` + `cloudflared tunnel --url http://localhost:3000`
+ `yarn test:mcp:local`) is for MCP/connector testing specifically, and its OAuth-true path always needs a
human in the loop for the ChatGPT consent screen (see "Human + LLM handoff"
below) — it is not a substitute for day-to-day dashboard/CMS dev, which should
stay on plain `yarn dev` at `http://localhost:3000`.

## Tunnel contract

**`yarn tunnel` (the named `krabiclaw-local` tunnel at `local.krabiclaw.com`)
does not currently reach the local machine.** `wrangler.toml` has a
`pattern = "*/*"` Worker route on `zone_name = "krabiclaw.com"` (required for
the `customers.krabiclaw.com` SaaS-fallback origin — see "Custom Domains" in
`CLAUDE.md`). That route intercepts every hostname in the `krabiclaw.com` zone
at Cloudflare's edge, including `local.krabiclaw.com`, before Cloudflare ever
consults the DNS record pointing at the tunnel. Verified by killing both the
local dev server and `cloudflared` entirely and confirming `local.krabiclaw.com`
still returned the exact same response (served by the deployed production
Worker's tenant-resolution 404, not the tunnel). Until the route is scoped to
exclude `local.krabiclaw.com` (or the tunnel hostname moves outside the
`krabiclaw.com` zone permanently), do not rely on `yarn tunnel` /
[tunnel.yml](../tunnel.yml) for connector testing.

### Working alternative: `trycloudflare.com` quick tunnel

Use an account-less quick tunnel instead — it gets a random hostname outside
the `krabiclaw.com` zone, so the `*/*` route never sees it:

```bash
cloudflared tunnel --url http://localhost:3000
```

This prints a URL like `https://<random-words>.trycloudflare.com`. Set
`BETTER_AUTH_URL`, `NUXT_PUBLIC_PLATFORM_DOMAIN`, and `MCP_BASE_URL` in
`.dev.vars` to that URL, export `E2E_ALLOW_DEV_ROUTES`/`E2E_DEV_ROUTE_SECRET`
into the shell as described above, then start (or restart) `yarn dev:tunnel`.
The quick-tunnel URL is random per run — there is no standing hostname to keep
in sync anywhere else, unlike the named tunnel.

`scripts/check-local-mcp-harness.mjs` `skip`s a "non-canonical MCP base URL"
check and a "tunnel.yml hostname mismatch" check when `BASE_URL` is a
`*.trycloudflare.com` quick tunnel — tunnel.yml always describes the named
`krabiclaw-local` tunnel, so a mismatch against a random quick-tunnel hostname
is expected, not a misconfiguration. `yarn test:mcp:local` exits `0` in this
case as long as every functional check (OAuth discovery, unauthenticated auth
challenges, authenticated `tools/list`/`tools/call`, resources, and
`--write-smoke`) passes. The hostname mismatch stays fatal for any other
`BASE_URL`, i.e. actual named-tunnel usage, where tunnel.yml should match.

### Named tunnel reference (currently non-functional end-to-end)

Current Cloudflare-side source of truth, kept for when the route conflict is
fixed:

- tunnel name: `krabiclaw-local`
- tunnel id: `ba36c78c-9e7d-4312-be92-63a58d96baba`
- hostname: `local.krabiclaw.com`
- origin service: `http://localhost:3000`

`yarn tunnel` reads [tunnel.yml](../tunnel.yml)'s `credentials-file` path,
which is a placeholder (`/Users/you/.cloudflared/...`) — update it to your own
machine's path to the downloaded `krabiclaw-local` credentials JSON before
running it, but expect the request to still be swallowed by the `*/*` Worker
route as described above.

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

Tested sequence — the tunnel must start first because its URL doesn't exist
until it prints one, and that URL is what you set in `.dev.vars` before
starting the dev server:

1. In terminal 1, start the quick tunnel and copy the printed
   `https://<random-words>.trycloudflare.com` URL:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

2. Set `BETTER_AUTH_URL`, `NUXT_PUBLIC_PLATFORM_DOMAIN`, and `MCP_BASE_URL` in
   `.dev.vars` to that URL (see "Working alternative: `trycloudflare.com`
   quick tunnel" above).

3. In terminal 2, export the dev-route secret into the shell and start the dev
   server:

   ```bash
   export E2E_ALLOW_DEV_ROUTES=true
   export E2E_DEV_ROUTE_SECRET=<same value as in .dev.vars>
   yarn dev:tunnel
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

## Known gap: CIMD self-fetch on deployed Cloudflare Workers

`tests/e2e/oauth-discovery.spec.ts`'s "repeat authorize skips consent after
remembered approval for the same CIMD client" test is skipped in `e2e-smoke`/
`e2e-staging` (see `isDeployedWorkerTarget` in `tests/e2e/test-env.ts`). The
CIMD client_id document it exercises (`server/api/auth/oauth2/test-client-metadata.get.ts`)
is served by this same app/origin, so `@better-auth/cimd`'s server-side fetch
of it is a same-zone Worker self-fetch. That self-fetch fails deterministically
once deployed to Cloudflare (reproduced directly via `curl` against
`preview.krabiclaw.com/api/auth/oauth2/authorize`, unauthenticated, in under a
second — not the library's 5s fetch timeout) with
`{"error":"invalid_client","error_description":"Failed to fetch metadata document (network error or redirect blocked)"}`,
while an external client fetching the exact same metadata URL gets a normal
200. The same flow passes reliably against a local dev server exposed through
a real public quick tunnel (per "Startup" above) — the named tunnel doesn't
reach the local machine at all yet (see "Tunnel contract"), so it isn't a
verified path for this either. The self-fetch failure is specific to a
deployed Worker fetching its own zone/route, not app
logic. Verify this flow locally via the tunnel harness; do not rely on
`e2e-smoke`/`e2e-staging` for it until the CIMD test fixture is hosted off-zone
or the platform restriction is otherwise worked around.

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
