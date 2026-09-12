# MCP

KrabiClaw ships one MCP surface. Every site, KrabiClaw's own included, is managed
through it with the same tools.

## Surface

- Endpoint: `/api/mcp`
- Protected resource: `/.well-known/oauth-protected-resource`
- Server entrypoint: `server/api/mcp.post.ts`
- Scope: `tenant`
- Exposes: existing-site content management, menus, experiences, posts, articles
  (blog and, on KrabiClaw's own site, documentation), media, reviews,
  submissions, notifications, Q&A, analytics
- Site creation and location creation, copying, and deletion are CMS-only. MCP
  retains daily content operations, including media asset and experience deletion.
- Google Places lookup and domain setup are CMS-only. Social/OAuth publishing is feature-flagged.
  Manual locale management remains available as ordinary content editing.

KrabiClaw's marketing site is an ordinary site row running the platform
template. Its blog and documentation are article collections on that site and
are edited with the same tools as any tenant's articles, using its `site_id`.

## Auth Model

- AGENTS.md's "Platform and authorization boundaries" is the canonical statement
  of Better Auth authorization scope.
- MCP requires Better Auth Organization permissions and, for scoped editors, the
  matching Better Auth Team membership.
- Org member roles (`owner`, `admin`, `editor`, optional read-only `member`) are
  tenant-scoped only.
- A Better Auth admin (impersonation rights) does not receive MCP access to a
  site from that role alone. Access requires real organization/team membership or
  a Better Auth impersonation session for a member of that organization.
- The real runtime boundary is the token `aud` claim bound to the MCP resource
  URL, plus the server-side membership checks. Never rely on scope presence or
  tool filtering alone.

## User-Facing URL

- MCP app URL: `https://krabiclaw.com/api/mcp`

## Tool catalog

KrabiClaw exposes one canonical tool contract. Every tool name, input schema,
output schema, and executor must agree. Unknown tool names return JSON-RPC
`-32601` over HTTP 200.

### Operation names

- `list_*` discovers a collection; `get_*` reads a selected record or aggregate.
- `preview_*` computes a proposal without saving; `update_*` saves supplied changes.
- `reconcile_products` is one atomic create/update operation for an explicitly selected location, not an ongoing sync. Each row supplies its intended Price or null. `set_missing_unavailable: true` explicitly makes omitted products unavailable.
- `replace_product_localizations` replaces only the submitted products’ translations for one locale; omitted products are untouched.

MCP names map to shared domain functions. REST uses HTTP methods on the same resources; it does not need duplicate verb-named endpoints. `get_site`, `list_sites`, and workspace context expose the canonical public site URL; publishing a post returns its full public URL. DNS setup remains in the CMS.

### Release sequence

1. Update the canonical definition and executor together.
2. Update the owning invariant test.
3. Run `yarn mcp:catalog:write` and review the catalog snapshot diff.
4. Run `yarn mcp:catalog` and the affected MCP integration tests.
5. Deploy the preview Worker and verify `tools/list`, the changed tool call, and
   `_meta["krabiclaw/catalogFingerprint"]` through the real client.
6. Refresh and publish the ChatGPT app action catalog when its schema changed
   (`yarn chatgpt:submission:write`).
7. Verify the deployed staging MCP app before promoting to production.

Do not use `serverInfo.version` as a catalog boundary. The endpoint, live
`tools/list` response, and reviewed snapshot define the contract.

### Catalog enforcement

The public catalog is snapshotted in `server/utils/mcp-catalog-snapshots/`.
`yarn mcp:catalog` requires every public tool to be dispatchable and rejects
snapshot drift.

### Incident queries

Use `mcp_tool_call_events` to find unknown tools and repeated failures:

- group unknown tools by `unknown_tool_name`, `oauth_client_id_hash`, and `catalog_fingerprint`
- group repeated failures by `session_id_hash`, `method`, `tool_name`, and `jsonrpc_error_code`
- verify protocol errors use HTTP 200 unless authentication or authorization requires an HTTP error

Telemetry stores hashed session and client identifiers. Never log raw session
ids, OAuth client ids, bearer tokens, authorization headers, full arguments,
article bodies, or upload URLs.
