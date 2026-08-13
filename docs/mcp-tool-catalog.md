# MCP tool catalog

KrabiClaw exposes one canonical tool contract for each MCP surface:

- tenant: `/api/mcp`
- platform: `/api/mcp/platform`

Every tool name, input schema, output schema, and executor must agree. Unknown
tool names return JSON-RPC `-32601` over HTTP 200. Unknown arguments return an
invalid-params response and are never translated into another field.

## Release sequence

1. Update the canonical definition and executor together.
2. Update the owning invariant test.
3. Run `yarn mcp:catalog:write` and review the catalog snapshot diff.
4. Run `yarn mcp:catalog` and the affected MCP integration tests.
5. Deploy the preview Worker and verify `tools/list`, the changed tool call, and
   `_meta["krabiclaw/catalogFingerprint"]` through the real client.
6. Refresh and publish the ChatGPT app action catalog when its schema changed.
7. Verify the deployed staging MCP app before promoting to production.

Do not use `serverInfo.version` as a catalog boundary. The endpoint, live
`tools/list` response, and reviewed snapshot define the contract.

## Catalog enforcement

Public catalogs are snapshotted in `server/utils/mcp-catalog-snapshots/`.
`yarn mcp:catalog` requires every public tool to be dispatchable and rejects
snapshot drift.

## Incident queries

Use `mcp_tool_call_events` to find unknown tools and repeated failures:

- group unknown tools by `mcp_surface`, `unknown_tool_name`,
  `oauth_client_id_hash`, and `catalog_fingerprint`
- group repeated failures by `session_id_hash`, `method`, `tool_name`, and
  `jsonrpc_error_code`
- verify protocol errors use HTTP 200 unless authentication or authorization
  requires an HTTP error

Telemetry stores hashed session and client identifiers. Never log raw session
ids, OAuth client ids, bearer tokens, authorization headers, full arguments,
article bodies, or upload URLs.
