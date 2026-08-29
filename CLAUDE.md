# KrabiClaw — LLM Working Rules

## Canonical operating contracts

The mandatory release, incident, migration-safety, browser-verification, and deployment contract is [docs/operations/release-and-outage-prevention.md](docs/operations/release-and-outage-prevention.md). Release gates and environment behavior are documented in [docs/operations/release-flow.md](docs/operations/release-flow.md).

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

## Database invariants

`server/db/schema.ts` is the source of truth for new schema changes. Migrations `0001` through `0007` are historical; migrations from `0008` onward are generated from `schema.ts`.

- Any migration applied to staging or production is immutable by filename and content. Never rename, edit, renumber, or re-squash it.
- Never create replacement preview resources, edit `d1_migrations`, hand-patch shared schema, or use ad hoc SQL files for schema changes.
- Follow the migration-safety contract linked above and ensure `yarn lint:migrations` passes before applying migrations.

## Client-site integrity

Saya public surfaces render only validated tenant content. Missing content is omitted or shown as an explicit empty or error state; fabricated example content and tenant fallback copy are not rendered.

Use the approved client onboarding and import pipeline. Never manually seed or patch D1, invent client data, use stock images when client media exists, or leave tenant media on third-party hosts. A client site is not complete until `client:verify` passes and `client-handoff.md` is generated.

## Agent documentation

- Issue tracker: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- Triage labels: [docs/agents/triage-labels.md](docs/agents/triage-labels.md)
- Domain context and ADRs: [docs/agents/domain.md](docs/agents/domain.md), root `CONTEXT.md`, and `docs/adr/`
- Development workflow: [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
