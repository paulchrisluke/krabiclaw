# MCP Auth Debugging

Use this when ChatGPT says “reconnect”, “always allow” does not stick, or the
connector appears connected but tool calls still fail.

Detailed Cloudflare API notes live in [observability-debugging.md](./observability-debugging.md).
This page is the compact operational playbook.

## What to read first

### 1. D1 telemetry (`mcp_tool_call_events`)

This is the fastest coarse history for MCP auth outcomes.

Look at:

- `status`
- `tool_name`
- `error_message`
- `created_at`

Useful `error_message` patterns now include:

- `credential_missing: missing bearer token or cookie`
- `credential_rejected: invalid_token: Token missing, expired, invalid, or not issued for this MCP resource`
- `credential_rejected: insufficient_scope: <scope> scope required`

Interpretation:

- `credential_missing` usually means ChatGPT did not attach a usable bearer token at all
- `invalid_token` means a token was presented but the app rejected it
- `insufficient_scope` means the token exists but the expected OAuth scope is missing

### 2. Cloudflare GraphQL analytics

Use GraphQL analytics when you need request-level status patterns for:

- `/api/mcp`
- `/api/mcp/platform`

Use the commands in [observability-debugging.md](./observability-debugging.md) to confirm:

- whether `/api/mcp` is returning real 401s
- whether failures are isolated to tenant MCP or platform MCP
- whether the reconnect issue aligns to a specific demo window

### 3. Cloudflare dashboard Logs UI

Use dashboard Logs for raw `[MCP_AUTH]` lines from `server/utils/mcp-auth.ts`.

These lines include the richer rejection reasons that are not visible from HTTP
status codes alone, such as:

- `jwt_expired`
- `jwt_claim_aud_invalid`
- `jwt_claim_iss_invalid`
- `tenant_scope_missing`

## Reconnect bug decision tree

### Missing token

Signals:

- D1 `error_message` starts with `credential_missing`
- `tools/call` returns JSON-RPC auth challenge
- one manual “Allow” click works, but later calls ask to reconnect again

Likely cause:

- ChatGPT did not send a bearer token for that call

### Expired token

Signals:

- D1 shows `credential_rejected: invalid_token`
- dashboard Logs show `jwt_expired`

Likely cause:

- ChatGPT reused a stale connector token and did not refresh cleanly

### Wrong audience or resource

Signals:

- D1 shows `credential_rejected: invalid_token`
- dashboard Logs show `jwt_claim_aud_invalid`
- the connector was created against one origin but the app now advertises another

Likely cause:

- `BETTER_AUTH_URL`, MCP resource metadata, and the connector’s registered resource are out of sync

### Insufficient scope

Signals:

- D1 shows `credential_rejected: insufficient_scope`

Likely cause:

- token was minted without the required MCP scope for that surface

### Connected, but tools/list or the first tool call breaks the stream

Signals:

- D1 telemetry shows a successful, authenticated `tools/list` (or `tools/call`)
- token exchange and bearer-token acceptance both look normal in logs
- ChatGPT still shows a generic connection/stream error to the user

Likely cause:

- not an auth problem — the `tools/list` response is large enough that
  ChatGPT's client-side handling of it fails after a real 200. See
  [local-mcp-harness.md](./local-mcp-harness.md#tool-catalog-size-and-toolslist)
  for the lean-catalog behavior already in place for `openai-mcp/` user agents.

Check:

- compare `tools/list` payload size for the real ChatGPT user agent vs. a
  manual request without it
- confirm the lean-catalog path in `server/api/mcp.post.ts` /
  `server/api/mcp/platform.post.ts` is actually matching that user agent

### Host mismatch

Signals:

- local or staging connector connects, then reconnects repeatedly
- `/.well-known/oauth-protected-resource` and `issuer` do not line up with the connector URL

Check:

- `BETTER_AUTH_URL`
- `NUXT_PUBLIC_PLATFORM_DOMAIN`
- `MCP_BASE_URL`
- `tunnel.yml` hostname
- ChatGPT connector URL used during setup

All of them must point at the same origin for the current harness session.
