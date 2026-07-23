# MCP tool evolution runbook

Published ChatGPT MCP apps can keep using a frozen, admin-approved action catalog after the live server changes. Treat every name that has appeared in production `tools/list` as a durable external API identifier for that endpoint version.

## Mandatory release sequence

1. Add replacement tools.
2. Add or retain hidden compatibility adapters for every released old name.
3. Deploy replacements and adapters together.
4. Verify current production `tools/list` and `_meta["krabiclaw/catalogFingerprint"]`.
5. Enterprise/Edu: Workspace Settings -> Apps -> Action control -> Refresh -> review diff -> enable replacement actions -> publish.
6. Business: recreate and republish the custom app after incompatible changes.
7. Test a new chat and an existing stale chat/registration.
8. Monitor compatibility usage and unknown-tool telemetry.
9. Never remove the adapter from the same endpoint version.

## Endpoint version policy

`/api/mcp` and `/api/mcp/platform` retain every released dispatch identifier through their endpoint lifetime. A change that cannot be represented by a safe adapter requires a new endpoint version, such as `/api/mcp/v2` or `/api/mcp/platform/v2`, plus a separate ChatGPT app registration and explicit migration.

Do not use `serverInfo.version` as the sole compatibility boundary. The endpoint path and `server/utils/mcp-released-tools.ts` manifest are authoritative.

## Compatibility controls

- Public catalogs are snapshotted in `server/utils/mcp-catalog-snapshots/`.
- `yarn mcp:compat` fails when a public tool lacks a manifest entry, a deprecated tool is missing from dispatch, a deprecated tool leaks into discovery, or snapshots drift.
- Run `yarn mcp:compat:write` only when intentionally updating public schemas, then review and commit the JSON diff.

## Incident queries

Use `mcp_tool_call_events` for stale-catalog review:

- unknown tools: group by `mcp_surface`, `unknown_tool_name`, `oauth_client_id_hash`, `catalog_fingerprint`, and `deployment_version`
- compatibility usage: filter `compatibility_alias_used = 1`
- repeated failures: group by `session_id_hash`, `method`, `tool_name`, `jsonrpc_error_code`
- transport regressions: find `jsonrpc_error_code IS NOT NULL AND http_status != 200`
- session termination signals: find MCP route events with `http_status = 404`

Telemetry stores hashed session/client identifiers only. Do not log raw `Mcp-Session-Id`, OAuth client ids, bearer tokens, authorization headers, full arguments, article bodies, or upload URLs.
