# MCP

KrabiClaw ships two separate MCP surfaces with strict security boundaries.

## Surfaces

### Client MCP

- Purpose: customer-facing site and workspace management
- Endpoint: `/api/mcp`
- Protected resource: `/.well-known/oauth-protected-resource`
- Server entrypoint: `server/api/mcp.post.ts`
- Scope: `tenant`
- Exposes by default: site setup, menus, experiences, posts, media, reviews, submissions, notifications, content, QA, analytics
- Feature-flagged conversational groups: social/OAuth publishing, domains, managed-service work requests. Manual locale management remains available as ordinary content editing.

### Platform Admin MCP

- Purpose: internal KrabiClaw platform operations
- Endpoint: `/api/mcp/platform`
- Protected resource: `/.well-known/oauth-protected-resource/platform-mcp`
- Server entrypoint: `server/api/mcp/platform.post.ts`
- Scope: `platform_admin`
- Exposes: platform blog and docs operations for `krabiclaw.com/blog` and `krabiclaw.com/docs`, plus read-only categorized release data from merged GitHub pull requests

## Separation Rules

- Never expose client and platform tools from the same MCP endpoint.
- Never rely on tool filtering alone to separate internal and external capabilities.
- Do not rely on scope presence alone to separate these surfaces. Dynamic client registration currently gives registered MCP clients both custom scopes by default.
- The real runtime boundary is the token `aud` claim bound to the MCP resource URL, plus the server-side DB checks for site membership or platform-admin role.
- Platform blog/docs content must stay on `platform_blog_posts` and `platform_docs`; do not route it through tenant site content tables.

## Auth Model

- AGENTS.md's "Better Auth Boundary Rules" is the canonical statement of Better Auth authorization scope.
- Platform MCP requires documented Better Auth Admin plugin platform permissions.
- Tenant MCP requires Better Auth Organization permissions and, for scoped editors, the matching Better Auth Team membership.
- Org member roles (`owner`, `admin`, `editor`, optional read-only `member`) remain tenant-scoped only and do not grant platform access.
- Platform admins do not receive tenant MCP access from global role status alone. Tenant access requires real organization/team membership or a Better Auth impersonation session for a tenant member.

## User-Facing URLs

- Client MCP app URL: `https://krabiclaw.com/api/mcp`
- Platform Admin MCP app URL: `https://krabiclaw.com/api/mcp/platform`

Only internal KrabiClaw operators should connect the Platform Admin MCP app.

## Tool catalog

KrabiClaw exposes one canonical tool contract for each MCP surface. Every tool name, input schema, output schema, and executor must agree. Unknown tool names return JSON-RPC `-32601` over HTTP 200. Unknown arguments return an invalid-params response and are never translated into another field.

### Release sequence

1. Update the canonical definition and executor together.
2. Update the owning invariant test.
3. Run `yarn mcp:catalog:write` and review the catalog snapshot diff.
4. Run `yarn mcp:catalog` and the affected MCP integration tests.
5. Deploy the preview Worker and verify `tools/list`, the changed tool call, and `_meta["krabiclaw/catalogFingerprint"]` through the real client.
6. Refresh and publish the ChatGPT app action catalog when its schema changed.
7. Verify the deployed staging MCP app before promoting to production.

Do not use `serverInfo.version` as a catalog boundary. The endpoint, live `tools/list` response, and reviewed snapshot define the contract.

### Catalog enforcement

Public catalogs are snapshotted in `server/utils/mcp-catalog-snapshots/`. `yarn mcp:catalog` requires every public tool to be dispatchable and rejects snapshot drift.

### Incident queries

Use `mcp_tool_call_events` to find unknown tools and repeated failures:

- group unknown tools by `mcp_surface`, `unknown_tool_name`, `oauth_client_id_hash`, and `catalog_fingerprint`
- group repeated failures by `session_id_hash`, `method`, `tool_name`, and `jsonrpc_error_code`
- verify protocol errors use HTTP 200 unless authentication or authorization requires an HTTP error

Telemetry stores hashed session and client identifiers. Never log raw session ids, OAuth client ids, bearer tokens, authorization headers, full arguments, article bodies, or upload URLs.