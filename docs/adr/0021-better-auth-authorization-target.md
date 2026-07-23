# ADR 0021: Better Auth Authorization Target

## Status

Accepted as the target architecture for issue #386. Implementation remains phased. This ADR is the canonical auth architecture reference until it is superseded by a later ADR.

## Context

KrabiClaw currently contains overlapping authentication and authorization systems: Better Auth admin roles, Better Auth organization roles, `member_access_scope`, dashboard path/header guards, custom impersonation proxy routes, platform-admin tenant bypasses, custom role parsing, direct SQL against Better Auth-owned tables, and custom OAuth token verification. Issue #386 exists to remove that drift.

This ADR intentionally does not migrate runtime behavior. It locks the target model before behavior migration PRs begin.

Installed Better Auth packages are pinned in `package.json` and `yarn.lock` to `1.7.0-beta.10`:

- `better-auth`
- `@better-auth/core`
- `@better-auth/oauth-provider`
- `@better-auth/cimd`

Official Better Auth documentation used for this target, retrieved 2026-07-23:

- Admin plugin for the installed beta line: https://better-auth.com/docs/beta/plugins/admin
- Organization plugin and Teams for the installed beta line: https://better-auth.com/docs/beta/plugins/organization
- Plugin API and `requireOrgRole` for the installed beta line: https://better-auth.com/docs/beta/concepts/plugins
- OAuth 2.1 Provider and resource-server helpers for the installed beta line: https://better-auth.com/docs/beta/plugins/oauth-provider

The relevant documented primitives are:

- Admin plugin user/session administration, role permissions, `authClient.admin.impersonateUser()`, `authClient.admin.stopImpersonating()`, and server-side `auth.api.*` admin actions.
- Admin plugin access control via `createAccessControl`, server plugin roles, client plugin roles, `authClient.admin.hasPermission()`, and `auth.api.userHasPermission()`.
- Organization plugin organizations, members, invitations, access-control statements, `hasPermission`, `checkRolePermission`, and Teams.
- Plugin middleware `sessionMiddleware` and `requireOrgRole` for Better Auth plugin endpoints where a plugin endpoint shape is appropriate.
- OAuth Provider resource-server helpers, including protected-resource metadata and `verifyAccessTokenRequest` with explicit audience checks.

## Decision

KrabiClaw auth architecture must converge on documented Better Auth primitives. Custom application code remains valid only for KrabiClaw business rules, resource ownership, content workflows, billing workflows, and tenant domain mutations. It must not recreate framework-owned identity, session, token, role, permission, membership, team-membership, or impersonation behavior.

When Better Auth lacks required behavior, stop and document the exact gap in issue #386 before implementing a replacement. Do not invent a hidden abstraction, support mode, synthetic principal, shadow role system, or compatibility layer inside a child PR.

## Platform Admin Permissions

Global platform administration uses the Better Auth Admin plugin with explicit custom permissions configured in both the Admin server plugin and Admin client plugin. The global platform role is for platform control-plane operations only.

Target platform permission resources:

- `platform`
- `users`
- `sessions`
- `billing`
- `fulfillment`
- `clients`
- `platform_content`
- `platform_analytics`
- `domains`

Platform routes and platform MCP tools must authorize against those declared Admin permissions. They must not parse comma-separated roles in application code. The only permitted global admin role interpretation is through Better Auth Admin plugin access-control APIs.

Direct SQL reads or mutations of Better Auth-owned user/session/account tables are prohibited in normal product workflows. User listing, user lookup, role changes, bans, session listing, session revocation, deletion, and impersonation must use documented Admin plugin client or server APIs. A direct-SQL emergency recovery procedure may exist only as an explicitly named break-glass document or script, outside normal runtime and CI paths.

`yarn platform-admin:break-glass-promote --email user@example.com --remote` is the retained emergency recovery path for restoring platform access when no working admin session exists. It mutates Better Auth's `user.role` column directly, so it must not be used for routine team management, tests, onboarding, or support workflows; normal platform team administration uses the Better Auth Admin plugin APIs through the dashboard.

## Organization Permissions

Tenant authorization uses the Better Auth Organization plugin and its access-control statements as the source of truth. The product roles are:

- `owner`
- `admin`
- `editor`

`member` may remain only as a non-operational/read-only role if the product still needs it. It must not silently inherit editor behavior.

Target organization permission resources:

- `organization`
- `members`
- `invitations`
- `sites`
- `locations`
- `content`
- `media`
- `blog`
- `menus`
- `experiences`
- `reservations`
- `orders`
- `reviews`
- `qa`
- `submissions`
- `notifications`
- `analytics`
- `domains`
- `billing`
- `settings`
- `integrations`

Every tenant operation must state the permission it requires. Server authorization and UI visibility must use the same permission contract. Role-name checks may remain only when the role itself is the business fact being displayed or edited; they must not replace action permission checks.

## Site And Location Teams

Site and location scoping moves to Better Auth Teams. `member_access_scope` is migration debt and must not be extended.

Target mapping:

- Every `sites` row has one Better Auth team identifier for site-wide editors.
- Every `business_locations` row that supports location-only access has one Better Auth team identifier.
- An organization owner or admin remains organization-wide and does not require team membership.
- An editor must belong to the site's team for site-wide operations.
- An editor may belong to one or more location teams for location-only operations.
- Site-team membership implies access to that site's locations.
- Location-team membership never implies access to site-wide settings, site-wide content, or other locations.

Store the Better Auth team IDs directly on `sites` and `business_locations`, or in one explicit resource-to-team mapping table if a separate mapping is required. Do not create another membership/scope table. All team creation, deletion, invitation, and membership mutation must use Better Auth Organization/Teams APIs.

The application may compare the authenticated user's Better Auth team membership with the team ID attached to a site or location. It must not maintain duplicate membership rows.

## Impersonation

Better Auth impersonation is the only cross-user client-workspace access mechanism for platform support.

A global platform administrator may use tenant dashboard or tenant MCP operations only when one of these states is true:

- The admin is an actual member of the target organization with sufficient organization/team permissions.
- The admin has entered a Better Auth impersonation session for a target user who has sufficient organization/team permissions.

Platform admin status alone is never tenant owner access. Do not implement a custom support session, support-mode cookie, acting-as principal, owner-equivalent override, or platform-admin membership bypass.

Platform admins start client-workspace support from the admin Clients/Users workflow with documented Better Auth impersonation APIs. A visible impersonation banner remains until `authClient.admin.stopImpersonating()` succeeds. Normal platform operations remain under `/admin` without impersonation.

## Dashboard And Admin Surfaces

`/admin` is the platform control plane. `/dashboard/:orgSlug/...` is the tenant workspace. They may remain separate route families because they represent different products and permission catalogs, but they must not fork tenant business logic or common dashboard UI primitives.

Tenant routes and APIs use explicit route/body/query resource identifiers plus Better Auth organization permission and team checks. Hidden dashboard context headers are migration debt and must not be extended. `activeOrganizationId` may remain only for Better Auth-supported UX state and routes that genuinely have no organization identifier; it must not override or silently repair an explicit route.

Post-login routing must be deterministic:

1. Honor a validated explicit internal redirect.
2. An impersonated session proceeds to the target tenant route.
3. A non-impersonated global platform admin with no explicit redirect goes to `/admin`.
4. A normal organization member goes to the canonical organization dashboard.
5. A guest/end-customer goes to the guest account surface.
6. A genuinely new user goes to onboarding.

No additional last-workspace database, hidden redirect preference, or custom surface-selection session state is part of this target.

## MCP Security Resources

KrabiClaw keeps two MCP resource endpoints:

- Tenant MCP: `/api/mcp`
- Platform MCP: `/api/mcp/platform`

They remain separate OAuth protected resources with separate audiences, scopes, consent, discovery metadata, and tool catalogs. Shared MCP protocol handling is allowed only when it does not weaken that boundary.

Tenant MCP:

- Uses tenant organization/team authorization.
- Does not grant platform admins arbitrary tenant access.
- Permits an impersonated browser/session caller only according to the impersonated user's tenant access.
- Shares tenant domain handlers with dashboard and ChowBot.

Platform MCP:

- Requires documented Better Auth platform-admin permission.
- Exposes only platform operations.
- Does not expose tenant tools.
- Keeps platform content in platform-owned tables.

A shared transport/runtime is allowed. A merged endpoint, merged OAuth protected resource, or tool-filter-only security boundary is prohibited.

OAuth access-token verification and protected-resource metadata must use documented Better Auth OAuth Provider/resource-server APIs such as `verifyAccessTokenRequest` or `serverClient.verifyAccessTokenRequest`, with `verifyBearerToken` only for paths that intentionally receive an already extracted bearer token and do not accept DPoP-bound tokens. Custom JWT/JWKS/opaque-token verification, direct OAuth table reads, custom protected-resource metadata, and custom OAuth challenges are migration debt unless retained as a thin MCP transport adapter documented as non-authentication formatting.

## Prohibited Drift Patterns

New auth work must not add:

- Direct SQL against Better Auth-owned identity/auth tables in normal application workflows.
- Custom role parsers or permission checks based on comma-separated global roles.
- Platform-admin tenant bypasses.
- Custom impersonation proxy routes or cookie relays.
- Manual JWT, JWKS, or opaque OAuth access-token verification.
- Shadow membership or scope tables alongside Better Auth Organization/Teams.
- Merged tenant/platform MCP security resources.
- Undocumented support-mode principals, support cookies, acting-as users, or owner-equivalent overrides.

## Consequences

- This ADR does not claim that issue #386 is complete.
- Current references to `member_access_scope`, custom platform-admin checks, custom OAuth verification, direct Better Auth table SQL, and dashboard context headers are known migration debt until their #386 child work lands.
- Each migration child must delete obsolete custom paths when the documented Better Auth API covers the behavior.
- Architecture checks should grow alongside each deletion so removed auth patterns cannot be reintroduced silently.
