# Local MCP Harness

This is the supported **local-but-public** test mode for exercising KrabiClaw
the way ChatGPT does: through a real HTTPS connector URL, Better Auth OAuth,
Cloudflare-backed dependencies, and the existing MCP smoke scripts.

Recommended default: **hybrid local mode using a `trycloudflare.com` quick tunnel**

- the app and tunnel are owned by `yarn test:mcp:local:tunnel`
- public HTTPS comes from `cloudflared tunnel --url http://127.0.0.1:<allocated-port>` (a quick,
  account-less tunnel — see "Tunnel contract" below for why the named
  `krabiclaw-local` tunnel in [tunnel.yml](../tunnel.yml) does not currently work)
- Better Auth, MCP, and the ChatGPT connector all point at the same public origin
- `/api/dev/*` routes stay protected by `E2E_DEV_ROUTE_SECRET`
- Cloudflare-backed behavior stays real where the connector depends on it

## Mandatory gates

Run the automated HTTPS/API/Playwright gate from the checkout under test:

```bash
yarn test:mcp:local:tunnel
```

This is the default MCP acceptance command. It starts and owns the quick
tunnel and Nuxt processes, captures the generated `trycloudflare.com` origin,
allocates a private local port so an existing `yarn dev` on port 3000 is left
untouched,
builds the versioned widget, applies migrations, seeds local D1, and runs both
the authenticated API/write harness and `yarn test:e2e:mcp` with one worker
against the public HTTPS origin. It writes non-secret evidence under
`.wrangler/mcp-harness/<run-id>/`, removes its temporary env file, and stops
both child processes on success, failure, or Ctrl-C.

Run the real host gate as the second mandatory command:

```bash
yarn test:mcp:chatgpt
```

This command owns its quick tunnel and Nuxt lifecycle too. It first reruns the
automated API/Playwright prerequisites against that tunnel, then keeps the same
origin alive for the actual ChatGPT run. Configure `devkrabiclaw` in your
normal, human-controlled ChatGPT browser with the exact
`https://<generated-origin>.trycloudflare.com/api/mcp` URL printed by the
command. Do not use a Playwright-launched browser for ChatGPT or Google login;
those hosts detect and block the automated browser. The terminal prints each
golden prompt and independently polls KrabiClaw telemetry after you send it.

The dedicated default fixture is `site-mcp-managed`; override it with
`MCP_CHATGPT_SITE_ID` and `MCP_CHATGPT_USER_ID` together when intentionally
testing another local fixture. This gate fails on a user-reported ChatGPT
connection error, missing/errored telemetry, wrong site arguments, wrong
persisted/public state, a missing widget, a failed real video upload, or a
failed assignment. A sanitized prompt/telemetry transcript is written under
`.wrangler/chatgpt-connector/<run-id>/`. Browser screenshots are not automated;
capture one manually only when the ChatGPT UI itself shows a failure that server
telemetry cannot describe.

Neither command reports unit-test counts as MCP acceptance evidence.

## Environment contract

Keep private development credentials in `.dev.vars`, but do not edit its origin
values for MCP testing. `scripts/test-mcp-local-tunnel.mjs` copies it to an
untracked, mode-0600 file under `.wrangler/`, replaces the three origin values
there, and supplies that path through `NUXT_CF_ENV_FILE`. The Cloudflare binding
loader passes the explicit file to Wrangler's `getPlatformProxy({ envFiles })`.
The generated file is deleted on exit.

The generated test environment contains:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `NUXT_PUBLIC_FREE_SITE_DOMAIN`
- `NUXT_PUBLIC_APP_NAME`
- `MCP_BASE_URL`
- `MEDIA_BASE_URL=<origin>/__media`
- `E2E_ALLOW_DEV_ROUTES=true`
- `E2E_DEV_ROUTE_SECRET`
- either `MCP_DEV_LOGIN=1` or `MCP_BEARER_TOKEN`

The orchestrator exports `E2E_ALLOW_DEV_ROUTES` and `E2E_DEV_ROUTE_SECRET` to
the Nuxt process as well as placing them in the generated Wrangler env file.
That detail matters: `assertDevRouteAllowed` reads `process.env`, while Better
Auth reads the Cloudflare-bound env. The old manual setup commonly set only one
side and produced a misleading `/api/dev/login` or telemetry `403`.

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

### Plain local dev remains unchanged

The automated gate never changes `.dev.vars`, so plain `yarn dev` can keep the
localhost values below and needs no post-test restore:

Plain dashboard/CMS local dev (`yarn dev` against `http://localhost:3000`, no
tunnel) requires these three set back to the localhost origin:

```env
BETTER_AUTH_URL=http://localhost:3000
NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000
MCP_BASE_URL=http://localhost:3000
```

If these values were changed manually during an older MCP session, restore them
once; future gate runs will not touch them.

The MCP harness is for MCP/connector testing specifically. Its first real
ChatGPT authorization needs a human for login/consent; day-to-day dashboard/CMS
development should stay on plain `yarn dev` at `http://localhost:3000`.

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

This prints a URL like `https://<random-words>.trycloudflare.com`.
`yarn test:mcp:local:tunnel` captures it and creates the matching temporary env
automatically. The URL is random per run, so a real ChatGPT connector must be
refreshed or recreated for the current run.

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

## Automated startup and acceptance

`yarn test:mcp:local:tunnel` performs this sequence in order:

1. apply local D1 migrations and seed fixtures;
2. build `public/mcp-assets/video-upload-widget.v1.js`;
3. allocate a private local port, start `cloudflared tunnel --url` against it,
   and capture the public URL;
4. create the private temporary env file with matching `BETTER_AUTH_URL`,
   `NUXT_PUBLIC_PLATFORM_DOMAIN`, and `MCP_BASE_URL`;
5. start Nuxt with that file and wait for OAuth discovery;
6. run `check-local-mcp-harness.mjs --write-smoke` through the tunnel;
7. run `PLAYWRIGHT_PREVIEW_URL=<tunnel> PLAYWRIGHT_WORKERS=1 yarn test:e2e:mcp`;
8. when invoked by `yarn test:mcp:chatgpt`, pause for the normal-browser ChatGPT
   actions and verify each expected call through telemetry before the origin is stopped;
9. remove the env file and terminate its child processes.

For manual inspection, all three discovery requests must return `200`, and
every advertised URL must use the same quick-tunnel origin:

   ```bash
   curl -i "$MCP_BASE_URL/.well-known/oauth-protected-resource"
   curl -i "$MCP_BASE_URL/.well-known/oauth-authorization-server"
   curl -i "$MCP_BASE_URL/.well-known/openid-configuration"
   ```

In ChatGPT Developer Mode, create the connector with the MCP route, not just
   the origin:

   ```text
   https://<random-words>.trycloudflare.com/api/mcp
   ```

   The connector URL changes whenever the quick tunnel is restarted. Delete and
   recreate a failed connector if ChatGPT cached an earlier failed OAuth
   registration; retrying the cached connector may fail before any request
   reaches the tunnel.

When widget code changes, follow the host refresh loop from the OpenAI deployment
guide: rebuild the widget, restart the MCP server, and refresh/recreate the
Developer Mode connector so ChatGPT does not keep the prior resource catalog.
See [OpenAI Apps SDK deployment](https://developers.openai.com/apps-sdk/deploy/).

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

Do not treat a partial or skipped run as a pass. In particular, OAuth discovery succeeding
does not prove that authorization-code exchange, authenticated MCP initialize,
or `tools/list` works.

## Proving a real ChatGPT connection

After completing OAuth in ChatGPT, verify the server-side sequence instead of
relying only on ChatGPT's generic success/error message. A healthy connection
has all of these signals:

1. `[OAUTH_TOKEN]` reports `status: 200`, with access, refresh, and ID tokens
   issued.
2. `[MCP_AUTH]` reports `credential_accepted` for user agent `openai-mcp/...`.
3. MCP `initialize` returns `200`.
4. `notifications/initialized` returns `202`.
5. `tools/list` or a first `tools/call` succeeds.
6. `/api/dev/mcp-telemetry` records the tool call as `success`.

ChatGPT may send an early probe without `mcp-protocol-version`; a single
`400 Missing MCP protocol version` is harmless when it immediately retries
with a successful `initialize`.

### OAuth/CIMD failure signatures

- `oauthClient.scopes = ''` followed by `Unexpected end of JSON input`: the
  OAuth client schema/default is incompatible with Better Auth's JSON-array
  contract. Fix the source schema/registration path; valid stored values are
  JSON arrays, not empty strings.
- `invalid_scope` in the ChatGPT callback: the registered client's allowed
  scopes do not include the resource's requested scope (`tenant` for
  `/api/mcp`, `platform_admin` for `/api/mcp/platform`).
- `invalid_client` during token exchange when ChatGPT uses
  `private_key_jwt`: inspect the CIMD client record's token authentication
  method and JWKS URI. ChatGPT publishes its keys at the `jwks_uri` in its
  client metadata document.
- `oauthClientAssertion was not found in the schema object`: the Better Auth
  OAuth replay-protection model/table is missing. Add it to `server/db/schema.ts`,
  generate a migration, and apply it locally before retrying.
- OAuth token exchange succeeds but no `/api/mcp` request follows: ChatGPT
  rejected or cached the connector after OAuth. Check tunnel/server access logs;
  if there is genuinely no request, remove and recreate the connector before
  changing MCP tools.
- Auth is accepted and `tools/list` succeeds, then the connection fails: inspect
  catalog response size and MCP App resources. The local harness must catch
  missing widget assets such as a declared script returning `404`.

For low-level debugging, the inner harness can still be run against an already
running correctly configured server:

```bash
yarn test:mcp:local -- --write-smoke --base-url https://<tunnel>.trycloudflare.com
```

That runs:

- `scripts/check-mcp-edit-flow.mjs`
- `scripts/check-mcp-ops-flow.mjs`
- `scripts/check-mcp-image-flow.mjs`

The mandatory orchestration command always enables these write flows. If you do
not pass `MCP_SITE_ID`, they create `e2e-`-marked scratch data for the next seed
sweep.

## Reusable test login for the ChatGPT consent screen

`MCP_DEV_LOGIN`/`MCP_BEARER_TOKEN` bypass login entirely for the headless smoke
scripts. They do not help with the one step that still requires a human: the
real Better Auth OAuth consent screen ChatGPT shows during connector setup and
on reconnect.

Add dedicated test credentials to your local `.env` as
`LOCAL_MCP_TEST_EMAIL` / `LOCAL_MCP_TEST_PASSWORD` (see
[.env.mcp.local.example](../.env.mcp.local.example)).
`yarn test:mcp:chatgpt` hashes the password and provisions a credential account
for the freshly seeded `user-mcp-managed` fixture in local D1. The OAuth login
page then accepts those credentials through Better Auth's real email/password
sign-in flow. The generated SQL file is mode `0600`, is always deleted, and the
command never prints the email, password, or password hash. Never commit the
values; the provisioning script is deliberately local-only and always invokes
Wrangler with `--local`.

## Tool catalog shape and `tools/list`

`/api/mcp` and `/api/mcp/platform` return standards-compliant tool descriptors
to ChatGPT and non-ChatGPT clients alike. Do not special-case the
`openai-mcp/...` user agent by dropping `outputSchema` or annotations; clients
use those fields to validate tool results and reason about follow-up calls.

If a connector shows a stream/connection error right after auth succeeds
(bearer token accepted, `tools/list` telemetry present) rather than during
OAuth itself, inspect catalog size as a product/tool-sprawl problem. Prefer
removing duplicate semantic launchers, retiring stale names with JSON-RPC
`-32601`, and keeping canonical tools well named over adding hidden adapters
or stripping schema metadata from ChatGPT's view.

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

## Human + agent handoff

The agent can fully drive:

- MCP contract checks
- edit/ops/image smoke scripts
- D1 telemetry reads
- Cloudflare GraphQL status inspection
- local tunnel preflight verification
- Cloudflare tunnel contract verification against the real `krabiclaw-local` tunnel

The human controls the ChatGPT UI in a normal browser:

1. create or refresh the connector with the printed quick-tunnel MCP URL;
2. sign in with the provisioned local test credentials and approve OAuth;
3. open a new connector-enabled chat;
4. copy each deterministic prompt printed by the terminal;
5. choose the printed tiny-video fixture path when the widget opens.

After each Enter press, the terminal gate polls sanitized MCP telemetry for the
expected tool, arguments, status, user, and site, then checks persisted/public
state. It never controls or inspects ChatGPT's browser. On success or failure it
records evidence and attempts to clean up the created post/blog/video.
