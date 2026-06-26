# MCP Surface Split

KrabiClaw now ships two separate MCP surfaces. They must stay separate in auth, discovery, consent, and tool exposure.

## Surfaces

### Client MCP

- Purpose: customer-facing site and workspace management
- Endpoint: `/api/mcp`
- Protected resource: `/.well-known/oauth-protected-resource`
- Server entrypoint: `server/api/mcp.post.ts`
- Scope: `tenant`
- Exposes: site setup, menus, experiences, posts, media, translation, reviews, analytics, work requests

### Platform Admin MCP

- Purpose: internal KrabiClaw platform operations
- Endpoint: `/api/mcp/platform`
- Protected resource: `/.well-known/oauth-protected-resource/platform-mcp`
- Server entrypoint: `server/api/mcp/platform.post.ts`
- Scope: `platform_admin`
- Exposes: platform blog and docs operations for `krabiclaw.com/blog` and `krabiclaw.com/docs`

## Separation Rules

- Never expose client and platform tools from the same MCP endpoint.
- Never rely on tool filtering alone to separate internal and external capabilities.
- Do not rely on scope presence alone to separate these surfaces. Dynamic client registration currently gives registered MCP clients both custom scopes by default.
- The real runtime boundary is the token `aud` claim bound to the MCP resource URL, plus the server-side DB checks for site membership or platform-admin role.
- Platform blog/docs content must stay on `platform_blog_posts` and `platform_docs`; do not route it through tenant site content tables.

## Auth Model

- Better Auth `admin` is the canonical platform-admin role.
- Org member roles (`owner`, `admin`, `member`) remain tenant-scoped only and do not grant platform access.
- Runtime platform access checks go through `server/utils/platform-auth.ts`.
- Grant platform access by setting `user.role = 'admin'`, for example with `yarn platform-admin:promote --email user@example.com --remote`.

## User-Facing URLs

- Client MCP app URL: `https://krabiclaw.com/api/mcp`
- Platform Admin MCP app URL: `https://krabiclaw.com/api/mcp/platform`

Only internal KrabiClaw operators should connect the Platform Admin MCP app.
