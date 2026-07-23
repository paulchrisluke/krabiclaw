# MCP tool evolution runbook

Published ChatGPT MCP apps can keep using a frozen, admin-approved action catalog after the live server changes. Do not respond by adding more semantic aliases for every stale or hallucinated name. Prefer a small, standards-compliant tool surface: clear input/output schemas, widget details in `_meta`, and clean JSON-RPC recovery for unknown tools.

## Mandatory release sequence

1. Add the replacement tool or tighten the existing canonical tool.
2. Decide whether the old name is retained or retired:
   - retain only when there is a real historical production contract that can be adapted safely without changing semantics;
   - retire stale launchers, semantic variants, and hallucinated names, returning JSON-RPC `-32601` over HTTP 200.
3. Deploy the canonical contract.
4. Verify current production `tools/list` and `_meta["krabiclaw/catalogFingerprint"]`.
5. Enterprise/Edu: Workspace Settings -> Apps -> Action control -> Refresh -> review diff -> enable replacement actions -> publish.
6. Business: recreate and republish the custom app after incompatible changes.
7. Test a new chat and an existing stale chat/registration.
8. Monitor compatibility usage and unknown-tool telemetry.

## Endpoint version policy

`/api/mcp` and `/api/mcp/platform` keep tenant and platform surfaces separate. Hidden adapters are exceptions, not the default. A change that cannot be represented by a safe adapter and would break a high-value historical contract should use a new endpoint version, such as `/api/mcp/v2` or `/api/mcp/platform/v2`, plus a separate ChatGPT app registration and explicit migration.

Do not use `serverInfo.version` as the sole compatibility boundary. The endpoint path and `server/utils/mcp-released-tools.ts` manifest are authoritative.

## Compatibility controls

- Public catalogs are snapshotted in `server/utils/mcp-catalog-snapshots/`.
- `yarn mcp:compat` fails when a public tool lacks a manifest entry, a retained deprecated adapter is missing from dispatch, a retired tool remains dispatchable, an old name leaks into discovery, or snapshots drift.
- Run `yarn mcp:compat:write` only when intentionally updating public schemas, then review and commit the JSON diff.

## Incident queries

Use `mcp_tool_call_events` for stale-catalog review:

- unknown tools: group by `mcp_surface`, `unknown_tool_name`, `oauth_client_id_hash`, `catalog_fingerprint`, and `deployment_version`
- compatibility usage: filter `compatibility_alias_used = 1`
- repeated failures: group by `session_id_hash`, `method`, `tool_name`, `jsonrpc_error_code`
- transport regressions: find `jsonrpc_error_code IS NOT NULL AND http_status != 200 AND status != 'auth_required'`
- session termination signals: find MCP route events with `http_status = 404`

Telemetry stores hashed session/client identifiers only. Do not log raw `Mcp-Session-Id`, OAuth client ids, bearer tokens, authorization headers, full arguments, article bodies, or upload URLs.
