# ChatGPT MCP Usage Telemetry

Durable logging of ChatGPT MCP protocol requests,
for understanding tool discovery/adoption, stale catalogs, and fuzzy-intent flows
("change the big photo", "help me get more bookings").

## What is captured

MCP requests against `server/api/mcp.post.ts` (tenant surface) and
`server/api/mcp/platform.post.ts` (platform surface) write rows to `mcp_tool_call_events`
(`server/db/schema.ts`) via `logMcpToolCallEvent()` in
`server/utils/mcp-telemetry.ts`. Writes are fire-and-forget — wrapped in
Cloudflare's `waitUntil` when available, or a detached promise otherwise —
so telemetry can never add latency to, or fail, an MCP response. A DB write
failure is swallowed and `console.warn`'d, never thrown.

Captured per row: surface, organization/site/location/user id (best-effort),
request id, method, tool name + domain, HTTP status, JSON-RPC error code/message,
protocol version, hashed session id, hashed OAuth client id, user agent,
Cloudflare ray id, deployment version, catalog fingerprint, redacted summaries
of arguments and result, compatibility/unknown-tool fields, status
(`success` / `error` / `auth_required` / `blocked`), and duration in ms.

## Redaction

`summarizeForTelemetry()` in `server/utils/mcp-telemetry.ts` is a single
generic redactor applied uniformly to every tool's arguments and result —
there is no per-tool allowlist to maintain. It:

- Replaces any field whose **key** matches a sensitive pattern (token,
  secret, password, credential, cookie, base64/file/image data, download
  URLs) with `[redacted]`.
- Replaces PII-shaped keys (email, phone, address, guest_name, full_name,
  first_name, last_name) with a length marker, e.g. `[redacted:len=23]`,
  instead of the value.
- Detects base64-shaped strings by content (not just key name) and stores
  only their length.
- Truncates any other string over 200 characters to a short excerpt plus a
  length marker.
- Caps array length and object depth to bound row size.
- Caps the final JSON at 4000 characters.

Error messages are separately truncated to 500 characters before storage
(`truncateText()`), since DB/validation error messages can otherwise leak
argument values verbatim.

## Important limitation: no raw user message

ChatGPT's `tools/call` payload contains only the tool name and its
structured arguments — the natural-language sentence the user actually
typed is generally **not** present, unless the model happens to pass it
through as a free-text argument value on a specific tool. Do not assume
this telemetry can answer "what did the user type" for fuzzy-intent
analysis. Where that matters, use ChowBot/dashboard conversation data
(`chowbot_conversations` / `chowbot_messages`), which does persist raw
message text, or add an explicit guided tool/prompt that carries user
intent text as a consented argument.

## Querying

No admin UI yet. Query via `wrangler d1 execute` locally, or the read-only
admin JSON endpoint:

```text
GET /api/admin/mcp-usage?days=7&site_id=<optional>
```

Returns `top_tools`, `failures_by_tool`, `blocked_or_auth_required`,
`by_site`, and `recent_errors` for the requested window (platform-admin
gated, same pattern as `server/api/admin/work-requests.get.ts`).

Ad-hoc SQL examples:

```sql
-- Most-called tools in the last 7 days
SELECT tool_name, tool_domain, COUNT(*) AS calls
FROM mcp_tool_call_events
WHERE method = 'tools/call' AND created_at >= datetime('now', '-7 days')
GROUP BY tool_name, tool_domain
ORDER BY calls DESC;

-- Which tools fail most, and why
SELECT tool_name, error_code, error_message, COUNT(*) AS occurrences
FROM mcp_tool_call_events
WHERE status = 'error' AND created_at >= datetime('now', '-7 days')
GROUP BY tool_name, error_code, error_message
ORDER BY occurrences DESC;

-- Feature-flag-gated tools ChatGPT tried to call but couldn't
SELECT tool_name, COUNT(*) AS occurrences
FROM mcp_tool_call_events
WHERE status IN ('blocked', 'auth_required')
GROUP BY tool_name
ORDER BY occurrences DESC;
```

## Adding a new mutating/read tool

Nothing to wire up manually — every tool routed through
`executeMcpToolCall()` in `mcp.post.ts`'s `tools/call` handler is logged
automatically, using its existing `domain` and `annotations.readOnlyHint`
from `server/utils/mcp-tools.ts`. There is no separate telemetry
registration step.
For tool catalog changes, stale-client adapters, and OpenAI app refresh steps,
see `docs/mcp-tool-evolution.md`.
