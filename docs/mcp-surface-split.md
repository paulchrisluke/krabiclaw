# MCP Surface Split

KrabiClaw now ships two separate MCP surfaces. They must stay separate in auth, discovery, consent, and tool exposure.

## Surfaces

### Client MCP

- Purpose: customer-facing site and workspace management
- Endpoint: `/api/mcp`
- Protected resource: `/.well-known/oauth-protected-resource`
- Server entrypoint: `server/api/mcp.post.ts`
- Scope: `tenant`
- Exposes by default: site setup, menus, experiences, posts, media, reviews, submissions, notifications, content, QA, analytics
- Feature-flagged conversational groups: translations/locales, social/OAuth publishing, domains, managed-service work requests. See `docs/tool-parity.md`.

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

- ADR 0021 is the canonical target for Better Auth authorization: `docs/adr/0021-better-auth-authorization-target.md`.
- Platform MCP requires documented Better Auth Admin plugin platform permissions.
- Tenant MCP requires Better Auth Organization permissions and, for scoped editors, the matching Better Auth Team membership.
- Org member roles (`owner`, `admin`, `editor`, optional read-only `member`) remain tenant-scoped only and do not grant platform access.
- Platform admins do not receive tenant MCP access from global role status alone. Tenant access requires real organization/team membership or a Better Auth impersonation session for a tenant member.

## User-Facing URLs

- Client MCP app URL: `https://krabiclaw.com/api/mcp`
- Platform Admin MCP app URL: `https://krabiclaw.com/api/mcp/platform`

Only internal KrabiClaw operators should connect the Platform Admin MCP app.
