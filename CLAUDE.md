# KrabiClaw — LLM Working Rules

## Canonical operating contracts

Database and release work must follow:
- [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md)
- [docs/operations/release-flow.md](docs/operations/release-flow.md)

Do not invent alternative deployment, migration, rollback, or environment-management mechanisms.

- Fix the canonical API, schema, or domain source of truth. Do not add frontend fallbacks, guards, shadow models, compatibility branches, or silent empty success states unless nullable behavior is intentional and documented.
- Do not hand-mutate staging or production data or schema to mask application failures.
- Inspect violations found in an affected path. Fix adjacent small defects in the same pass; defer only work that is genuinely larger and state the reason.

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
