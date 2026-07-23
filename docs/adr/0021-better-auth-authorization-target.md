# ADR 0021: Better Auth Authorization Target

## Status

Accepted as the target architecture for issue #386. Implementation remains phased.

## Context

The repository currently contains several overlapping auth and authorization mechanisms:
Better Auth admin roles, Better Auth organization roles, `member_access_scope`,
dashboard path/header guards, custom impersonation proxy routes, platform-admin tenant
bypasses, and custom OAuth token verification. Issue #386 defines the cleanup epic.

Installed Better Auth packages are pinned to `1.7.0-beta.10`:

- `better-auth`
- `@better-auth/core`
- `@better-auth/oauth-provider`
- `@better-auth/cimd`

Official Better Auth documentation used for this target:

- Admin plugin: https://better-auth.com/docs/plugins/admin
- Organization plugin and Teams: https://better-auth.com/docs/beta/plugins/organization
- Plugin API and `requireOrgRole`: https://better-auth.com/docs/beta/concepts/plugins
- OAuth 2.1 Provider and resource-server helpers: https://better-auth.com/docs/plugins/oauth-provider

## Decision

KrabiClaw auth architecture must converge on documented Better Auth primitives:

- Global platform administration uses the Better Auth Admin plugin, including documented
  admin permissions, user management, session management, and impersonation APIs.
- Tenant organization authorization uses the Better Auth Organization plugin access-control
  model. Tenant operations should require declared organization permissions rather than
  route regexes or role-name shortcuts.
- Site and location scoping moves to Better Auth Teams. A site or location may store the
  Better Auth team identifier that grants access, but application code must not maintain a
  duplicate membership/scope system after migration.
- Platform admins may enter tenant workspaces only as actual organization members or through
  Better Auth impersonation. Platform admin status alone is not tenant owner access.
- Tenant MCP and platform MCP remain separate OAuth protected resources with separate
  audiences, scopes, consent, discovery metadata, and tool catalogs.
- OAuth access-token verification and protected-resource metadata should use documented
  Better Auth OAuth Provider/resource-server APIs such as `verifyAccessToken` and protected
  resource metadata helpers. Custom JWT/JWKS/opaque-token verification is migration debt.

## Immediate Deletion Rule

New auth work must delete obsolete custom paths when the documented Better Auth API already
covers the behavior. In particular, custom impersonation proxy routes are not valid because
Better Auth documents `authClient.admin.impersonateUser()` and
`authClient.admin.stopImpersonating()`.

## Consequences

- This ADR does not claim that #386 is complete.
- Current references to `member_access_scope`, `isPlatformAdmin`, custom OAuth verification,
  and dashboard context headers are known migration debt until their #386 child work lands.
- No child PR may add a hidden support principal, custom impersonation cookie, platform-admin
  tenant bypass, custom role parser, or duplicate membership table as a shortcut.
- Architecture tests should grow alongside each deletion so removed auth patterns cannot be
  reintroduced silently.
