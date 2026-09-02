# KrabiClaw — LLM Working Rules

## Canonical operating contracts

Database and release work must follow:
- [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md)
- [docs/operations/release-flow.md](docs/operations/release-flow.md)

Do not invent alternative deployment, migration, rollback, or environment-management mechanisms.

- Fix the canonical API, schema, or domain source of truth. Do not add frontend fallbacks, guards, shadow models, compatibility branches, or silent empty success states unless nullable behavior is intentional and documented.
- Do not hand-mutate staging or production data or schema to mask application failures.
- Do not broaden the task to adjacent defects. Report them unless they directly block the requested change; if they block it, fix them through the same canonical path rather than creating another mechanism.

## Complexity control

Default order: delete, reuse, modify, add.

Before adding code, find the existing implementation of the behavior. There must be one canonical implementation, not parallel paths.

Do not add a helper, wrapper, service, repository, composable, endpoint, schema field/table, state model, compatibility path, dependency, or infrastructure resource when an existing path can be deleted or modified.

A refactor must remove the implementation it replaces in the same change. Do not leave dual reads, dual writes, aliases, temporary fallbacks, or "migration" compatibility code behind.

Do not implement adjacent cleanup, TODOs, "future work," roadmap ideas, or reviewer suggestions unless they are required to complete the requested task.

For cleanup/refactor work, net handwritten production code should decrease.

## Test discipline

Follow [docs/testing-strategy.md](docs/testing-strategy.md). Do not add a test by
default. Unit tests may not inspect production source text or mock internal
application modules. Prove UI, persistence, and MCP workflows through their real
runtime boundaries.

## Platform and authorization boundaries

KrabiClaw supports the ChatGPT MCP app, dashboard CMS, ChowBot in the dashboard, and ChowBot over WhatsApp where applicable. These surfaces must use shared server/domain utilities and the same canonical state. Do not fork business logic or create shadow data models.

Better Auth owns identity, sessions, OAuth provider state, organizations, members, roles, permissions, impersonation, and Teams.

- Use documented Better Auth Admin, Organization, Teams, impersonation, access-control, and OAuth resource-server APIs.
- Do not add direct SQL against Better Auth-owned auth tables in normal runtime code.
- Do not add custom role parsers, tenant bypasses, custom impersonation proxies, manual OAuth token verification, shadow membership or scope tables, or undocumented support principals or cookies.
- Tenant dashboard, ChowBot, WhatsApp, and tenant MCP access must use shared permission utilities backed by Better Auth organization permissions and Teams.
- Platform admin access is not tenant owner access unless the user is a tenant member or is impersonating one through Better Auth.

## Client-site integrity

Saya public surfaces render only validated tenant content. Missing content is omitted or shown as an explicit empty or error state; fabricated example content and tenant fallback copy are not rendered.

Use the approved client onboarding and import pipeline. Never manually seed or patch D1, invent client data, use stock images when client media exists, or leave tenant media on third-party hosts. A client site is not complete until `client:verify` passes and `client-handoff.md` is generated.

## Agent documentation

- Domain context and ADRs: root `CONTEXT.md` and `docs/adr/`

## Tenant CMS interface

Tenant CMS work must follow
[docs/design/cms-redesign-packet/prototype-decision.md](docs/design/cms-redesign-packet/prototype-decision.md).
Use one global primary route model in a desktop top bar and mobile bottom bar.
Do not add a persistent global sidebar beside route-owned CMS navigation.
Route owners must preview real content types rather than reducing every
destination to an icon row. Keep read views separate from focused field editors.
Avoid gradients, decorative helper copy, repeated titles, and nested card chrome.
