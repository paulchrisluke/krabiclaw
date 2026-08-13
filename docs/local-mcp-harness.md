# Local MCP testing

The local MCP gate runs the production Worker build against local Cloudflare
bindings and exposes it through the existing `krabiclaw-local` Cloudflare
tunnel at `https://local.krabiclaw.com`.

## Configuration

`.env` is the only local environment file. Copy `.env.example` to `.env` and
set the required credentials. Wrangler, Nuxt, Playwright, and the MCP harness
all use that file.

Local development uses:

```env
BETTER_AUTH_URL=http://localhost:3000
NUXT_PUBLIC_PLATFORM_DOMAIN=http://localhost:3000
NUXT_PUBLIC_FREE_SITE_DOMAIN=http://localhost:3000
MCP_BASE_URL=https://local.krabiclaw.com
E2E_ALLOW_DEV_ROUTES=true
E2E_DEV_ROUTE_SECRET=<local-secret>
MCP_DEV_LOGIN=1
EMAIL_DELIVERY_MODE=log_only
WHATSAPP_DELIVERY_MODE=log_only
```

Do not change those origins for tunnel testing. The harness passes its public
origin directly to the build, Worker, and test processes for that run.

## Automated gate

```bash
yarn test:mcp:local:tunnel
```

The command:

1. applies local migrations and seeds local D1;
2. builds the Cloudflare Worker with the stable tunnel origin;
3. starts `wrangler dev --local` on an available local port;
4. starts the existing `krabiclaw-local` tunnel;
5. runs OAuth authorization and token exchange;
6. runs authenticated MCP initialize, discovery, read, and write checks;
7. runs the focused MCP Playwright suite;
8. browser-tests Pottery House, Kikuzuki, and NCLS through the tunnel;
9. verifies platform and tenant favicon/manifest isolation;
10. stops the Worker and tunnel.

No environment file or Wrangler configuration is generated. Successful-run
logs are removed. Failure logs remain under `.wrangler/mcp-harness/<run-id>/`.

Cloudflared reads the existing tunnel credential from the user's standard
`~/.cloudflared` directory. There is no repo-specific tunnel config file.

## Real ChatGPT gate

Add the dedicated local test account to `.env`:

```env
LOCAL_MCP_TEST_EMAIL=<test-email>
LOCAL_MCP_TEST_PASSWORD=<test-password>
```

Then run:

```bash
yarn test:mcp:chatgpt
```

The command runs the automated gate first, provisions the local Better Auth
credential account, and prints the connector URL:

```text
https://local.krabiclaw.com/api/mcp
```

Complete login and consent in the normal ChatGPT browser. The harness checks
server-side telemetry for each expected tool call and verifies the resulting
local state.

## Acceptance requirements

An MCP auth pass requires all of the following:

- OAuth protected-resource and authorization-server discovery return `200`.
- Authorization redirects to Better Auth consent.
- PKCE token exchange returns access, refresh, and ID tokens.
- Bearer-authenticated MCP `initialize` succeeds.
- `tools/list`, `get_current_user`, and `list_sites` succeed.
- The affected write or media flow succeeds when applicable.
- The real ChatGPT gate passes when the defect involves ChatGPT connection,
  tool selection, attachment delivery, or host-provided file arguments.

OAuth discovery alone is not an MCP pass.
