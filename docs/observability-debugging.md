# Debugging Production via Cloudflare's Observability APIs

Notes from live-debugging the MCP OAuth "session terminated" incident
(2026-07-02). This documents what actually worked, what didn't, and the
exact account/zone identifiers so the next debugging session doesn't have to
rediscover them.

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

## What didn't work: Workers Observability / Logs telemetry API

`POST /accounts/{account_id}/workers/observability/telemetry/query` is the
newer API behind the dashboard's "Logs" tab — this is what you'd want for
reading actual `console.log` output (e.g. this codebase's structured
`[MCP_AUTH]` credential_rejected/accepted lines), not just status codes.

It did **not** work via direct API calls in this session:

- Omitting `queryId` → `{"issues":[{"path":["queryId"],"message":"Required"}]}`
- Providing an arbitrary `queryId` string (top-level or nested under a
  `queries` array) → `{"errors":[{"message":"Bad Request","detail":"Query not found"}]}`

This strongly suggests `queryId` must reference a query already saved via
the dashboard's Logs Explorer UI, not an ad-hoc identifier you can invent
per-request. **Until someone figures out the correct flow (possibly:
create/save a query in the dashboard once, then reference its real ID),
use the dashboard directly**: Cloudflare dashboard → Workers & Pages →
`krabiclaw` → Logs, filter by path/status/time range, and read the
`[MCP_AUTH]` JSON log lines directly.

If you get this working via the API, replace this section with the working
request shape and remove this warning.

## Correlating the two

`workersInvocationsAdaptive`/`httpRequestsAdaptiveGroups` tell you *when* and
*how many* requests failed and with what HTTP status, at 1-minute
granularity — enough to confirm "yes, something is really failing" and rule
out narrow theories (e.g. confirming `/api/mcp` had real 401s during a
specific demo window, not just the expected single OAuth-discovery
challenge). They cannot tell you *why* a specific request failed — for that,
you need the actual log line, which requires the dashboard Logs UI per the
limitation above.

`server/utils/mcp-auth.ts`'s `logMcpAuth()` calls are the source of truth
for the "why": every `credential_rejected` event logs `jwt_reason` /
`opaque_reason` (e.g. `jwt_expired`, `expiry_invalid`, `tenant_scope_missing`),
plus (as of this incident) `path`, `audiences_checked`, `required_scopes`,
and unverified `claimed_aud`/`claimed_iss`/`claimed_exp_iso`/etc. decoded
straight from a rejected JWT's payload — added specifically so an
audience/expiry/issuer mismatch is visible in the log line itself instead of
requiring a second round of guessing.
