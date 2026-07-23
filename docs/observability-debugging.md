# Debugging Production via Cloudflare's Observability APIs

Notes from live-debugging the MCP OAuth "session terminated" incident
(2026-07-02). This documents what actually worked, what didn't, and the
exact account/zone identifiers so the next debugging session doesn't have to
rediscover them.

For the compact reconnect triage flow, start with
[docs/mcp-auth-debugging.md](./mcp-auth-debugging.md).

## Credentials

`CLOUDFLARE_API_TOKEN` is in `.env` (not `CLOUDFLARE_ACCOUNT_ID` — that var is
present but empty in `.env`, use the hardcoded IDs below instead). Load it
with:

```bash
set -a; source .env; set +a
```

Do not use the OAuth token in `~/.wrangler/config/default.toml` for direct
API calls — it works for GraphQL Analytics but returned a bare
`{"code":10000,"message":"Authentication error"}` against the Workers
Observability endpoint. Use the `.env` token for everything below.

Known identifiers for this project:

| Name | Value |
| --- | --- |
| Account ID | `fa3dc6c06433f6b0ea78d95bce23ad91` |
| Zone ID (krabiclaw.com) | `aa15071ca5f1f3aaad7100d515745b78` |
| Worker script name | `krabiclaw` |

Zone ID lookup, if it's ever needed again for a different domain:

```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=krabiclaw.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -m json.tool
```

## What worked: GraphQL Analytics API

This is the reliable path for ad-hoc historical queries — no dashboard setup
required, just a POST to `https://api.cloudflare.com/client/v4/graphql`.

**Worker-level health** (`workersInvocationsAdaptive` — catches actual
runtime exceptions/crashes, but NOT application-level HTTP status like a
401/500 returned deliberately by your own code):

```bash
set -a; source .env; set +a
ACCT="fa3dc6c06433f6b0ea78d95bce23ad91"
FROM=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)   # macOS date syntax; use `date -u -d '-2 hours'` on Linux
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > /tmp/cf-query.json << EOF
{
  "query": "query(\$acct: String!, \$start: Time!, \$end: Time!) { viewer { accounts(filter: {accountTag: \$acct}) { workersInvocationsAdaptive(limit: 200, filter: {scriptName: \"krabiclaw\", datetime_geq: \$start, datetime_leq: \$end}, orderBy: [datetimeMinute_DESC]) { dimensions { datetimeMinute scriptName status } sum { requests errors subrequests } } } } }",
  "variables": { "acct": "$ACCT", "start": "$FROM", "end": "$NOW" }
}
EOF

curl -s -X POST "https://api.cloudflare.com/client/v4/graphql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/cf-query.json
```

Valid `dimensions` fields for this dataset: `datetime`, `datetimeMinute`,
`scriptName`, `status` (this is Cloudflare's own success/exception bucket,
**not** the HTTP status code your Worker returned). There is no `outcome`
field and no `outcome_neq` filter arg despite both appearing in some
Cloudflare docs/examples — they'll error with `unknown field`/`unknown arg`.

**HTTP-level status codes per path** (`httpRequestsAdaptiveGroups` — this is
the zone/CDN level, so it sees the actual HTTP status your Worker sent,
including deliberate 401s/403s/500s your own code returns):

```bash
set -a; source .env; set +a
ZONE="aa15071ca5f1f3aaad7100d515745b78"
FROM=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > /tmp/cf-query.json << EOF
{
  "query": "query(\$zone: String!, \$start: Time!, \$end: Time!) { viewer { zones(filter: {zoneTag: \$zone}) { httpRequestsAdaptiveGroups(limit: 500, filter: {datetime_geq: \$start, datetime_leq: \$end, clientRequestPath: \"/api/mcp\"}, orderBy: [datetimeMinute_DESC]) { dimensions { datetimeMinute clientRequestPath edgeResponseStatus } count } } } }",
  "variables": { "zone": "$ZONE", "start": "$FROM", "end": "$NOW" }
}
EOF

curl -s -X POST "https://api.cloudflare.com/client/v4/graphql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/cf-query.json
```

Change `clientRequestPath` to `/api/mcp/platform` (or drop the filter
entirely to see all paths) as needed.

Notes:
- `clientRequestMethod` is **not** a valid dimension on this dataset (errors
  with `unknown field`) — you can't filter/group by HTTP method here.
- `/api/mcp` (tenant/site-scoped tools) and `/api/mcp/platform`
  (platform-admin tools like `list_sites`) are **separate paths** — query
  them separately, don't assume one covers both. They can have completely
  different success/failure patterns (this is what led to finding the MCP
  connector issue was scoped to the tenant surface specifically).
- Prefer writing multi-line GraphQL queries to a JSON file and using
  `curl --data-binary @file.json` over inlining in `-d '...'` — nested quote
  escaping across bash + JSON + GraphQL breaks easily and produces confusing
  `Syntax Error GraphQL` messages that look like a query problem but are
  actually a quoting problem.

## What works: Workers Observability / Logs telemetry API

`POST /accounts/{account_id}/workers/observability/telemetry/query` is the
API behind the dashboard's "Logs" tab — use this for reading actual
`console.log`/`console.error` output (e.g. this codebase's structured
`[MCP_AUTH]` credential_rejected/accepted lines), not just status codes.

Earlier attempts in this doc concluded `queryId` must reference a query
pre-saved via the dashboard UI, based on `{"errors":[{"detail":"Query not
found"}]}` for every arbitrary `queryId` tried. **That conclusion was wrong
— the request body shape was wrong, not the queryId.** The two actual bugs:

- `dataSource: { source: "workers" }` at the top level does not exist in the
  schema — drop it entirely.
- Filters go under `parameters.filters` (flat array), **not** a top-level
  `filters` array, and **not** wrapped in a `{ kind: "group", ... }`
  structure. Each filter is `{ key, operation, type, value }` — `type` is
  required (`"string" | "number" | "boolean"`) alongside `operation`
  (`"eq"`, `"includes"`, etc.).
- `queryId` is still required on every call, but it does **not** need to
  reference anything pre-existing — any string works as an ad-hoc query ID
  when `parameters` is also provided. It's only used to load a *previously
  saved* query's parameters when `parameters` is omitted.

Working request:

```bash
set -a; source .env; set +a
ACCT="fa3dc6c06433f6b0ea78d95bce23ad91"
FROM_MS=$(($(date -u +%s) * 1000 - 3600000))   # 1 hour ago, epoch millis
TO_MS=$(($(date -u +%s) * 1000))

cat > /tmp/obs-query.json << EOF
{
  "queryId": "any-string-you-want-1",
  "timeframe": { "from": $FROM_MS, "to": $TO_MS },
  "parameters": {
    "filters": [
      { "key": "\$metadata.service", "operation": "includes", "type": "string", "value": "krabiclaw" },
      { "key": "\$metadata.level", "operation": "eq", "type": "string", "value": "error" }
    ]
  },
  "view": "events"
}
EOF

curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data-binary @/tmp/obs-query.json
```

Response shape: `result.events.events[]`, each with a `source` object
containing `level`, `message`, and (for Workers) `$workers.event.request`
(url/method/path) and `$workers.requestId`/`rayId` for cross-referencing
against `httpRequestsAdaptiveGroups`. `timeframe.from`/`to` **must** be
epoch milliseconds (integers), not ISO strings — the API 400s with a clear
Zod error if you pass a string there.

Useful `key` values for `filters`: `$metadata.service` (worker script
name), `$metadata.level` (`error`/`warn`/`info`), `message` (substring
match on the log line, works with `operation: "includes"`),
`$workers.event.request.path` (HTTP path).

## Correlating the two

`workersInvocationsAdaptive`/`httpRequestsAdaptiveGroups` tell you *when* and
*how many* requests failed and with what HTTP status, at 1-minute
granularity — enough to confirm "yes, something is really failing" and rule
out narrow theories (e.g. confirming `/api/mcp` had real 401s during a
specific demo window, not just the expected single OAuth-discovery
challenge). They cannot tell you *why* a specific request failed — for that,
use the telemetry `query` API above (or the dashboard Logs UI) to read the
actual log line.

`server/utils/mcp-auth.ts`'s `logMcpAuth()` calls are the source of truth
for the "why": every `credential_rejected` event logs `jwt_reason` /
`opaque_reason` (e.g. `jwt_expired`, `expiry_invalid`, `tenant_scope_missing`),
plus (as of this incident) `path`, `audiences_checked`, `required_scopes`,
and unverified `claimed_aud`/`claimed_iss`/`claimed_exp_iso`/etc. decoded
straight from a rejected JWT's payload — added specifically so an
audience/expiry/issuer mismatch is visible in the log line itself instead of
requiring a second round of guessing.

In parallel, `mcp_tool_call_events.error_message` now carries coarse auth
reason strings such as `credential_missing`, `credential_rejected:
invalid_token`, and `credential_rejected: insufficient_scope`, which makes D1
useful as the first-stop history before escalating to Logs UI.

## MCP tool compatibility

Use these D1 queries for stale ChatGPT app catalogs. The same fields are
populated for tenant (`mcp_surface = 'client'`) and platform
(`mcp_surface = 'platform'`) events.

```sql
SELECT mcp_surface, unknown_tool_name, oauth_client_id_hash,
       catalog_fingerprint, deployment_version, COUNT(*) AS failures
  FROM mcp_tool_call_events
 WHERE unknown_tool_name IS NOT NULL
 GROUP BY 1, 2, 3, 4, 5
 ORDER BY failures DESC;

SELECT mcp_surface, compatibility_tool_name, replacement_tool_names,
       catalog_fingerprint, COUNT(*) AS calls
  FROM mcp_tool_call_events
 WHERE compatibility_alias_used = 1
 GROUP BY 1, 2, 3, 4
 ORDER BY calls DESC;

SELECT session_id_hash, mcp_surface, method, tool_name,
       jsonrpc_error_code, jsonrpc_error_message, COUNT(*) AS repeats
  FROM mcp_tool_call_events
 WHERE status = 'error' AND session_id_hash IS NOT NULL
 GROUP BY 1, 2, 3, 4, 5, 6
HAVING repeats > 1
 ORDER BY repeats DESC;

SELECT created_at, mcp_surface, method, tool_name, http_status,
       jsonrpc_error_code, jsonrpc_error_message
  FROM mcp_tool_call_events
 WHERE jsonrpc_error_code IS NOT NULL
   AND http_status != 200
   AND status != 'auth_required';

SELECT created_at, mcp_surface, method, tool_name, session_id_hash, cf_ray_id
  FROM mcp_tool_call_events
 WHERE http_status = 404;
```

For release sequencing and OpenAI app refresh/republication, see
`docs/mcp-tool-evolution.md`.
