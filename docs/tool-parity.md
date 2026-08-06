# ChowBot / Client MCP Conversational Tool Surface

This document tracks the customer-facing conversational surfaces:

- **Client MCP** — ChatGPT connector at `server/api/mcp.post.ts`
- **ChowBot** — dashboard and WhatsApp assistant driven by `server/utils/chowbot-agent.ts`
- **Dashboard/CMS** — full UI and API workflows that do not need a conversational tool equivalent

Platform Admin MCP is intentionally excluded because it is a separate internal-only surface. See `docs/mcp-surface-split.md`.

## Policy

Client MCP and ChowBot are not required to have identical tool names. They must share the same curated conversational capability policy:

- A workflow belongs on both conversational surfaces only when it is safe, natural, and tested as a chat turn.
- Dashboard/CMS remains the source for setup-heavy or OAuth-heavy workflows.
- New surface-specific tools need a documented reason in this file.
- Feature-flagged groups must be hidden from tool discovery and blocked at execution.
- Do not keep deprecated tools in the active registry. Remove stale definitions, executor cases, tests, and docs together.

The shared gate lives in `server/utils/conversational-tool-surface.ts`.

## Default Visible Surface

As of 2026-07-10:

| Surface | Raw tools | Default visible tools | Notes |
| --- | ---: | ---: | --- |
| Client MCP | 117 | 103 | Feature-flagged groups hidden (social/OAuth publishing 7, domains 5, managed service 2 = 14). Manual locale tools are visible by default. Raw/default counts include the Agent Skill guidance tools for blog and image workflows |
| ChowBot | 87 | 85 | Same feature-flag policy for social/OAuth publishing and managed service; manual locale tools are visible by default and WhatsApp-specific tools remain ChowBot-only |

Counts are checked by `yarn lint:tool-parity` (`scripts/lint-tool-parity.mjs`), which also verifies tool names stay in sync across definitions, executor dispatch, the confirm-required set, and feature-gate groups — update this table whenever those counts drift.

## Feature-Flagged Groups

These groups are hidden by default on both conversational surfaces where present.

| Group | Env flag | Client MCP tools | ChowBot tools |
| --- | --- | --- | --- |
| Social/OAuth publishing | `CONVERSATIONAL_TOOLS_SOCIAL_PUBLISHING_ENABLED=true` | `get_facebook_connection`, `publish_to_facebook`, `sync_facebook_page`, `get_google_business_connection`, `get_google_business_auth_url`, `list_google_business_accounts`, `sync_google_business_locations`; external `publish_post` channels are also blocked while disabled | None today; `publish_post` already publishes site-only |
| Domains | `CONVERSATIONAL_TOOLS_DOMAINS_ENABLED=true` | `get_site_domains`, `create_domain`, `set_canonical_domain`, `delete_domain`, `sync_domain` | None |
| Managed service | `CONVERSATIONAL_TOOLS_MANAGED_SERVICE_ENABLED=true` | `list_work_requests`, `create_work_request` | Same names |

## Intentional Differences

| ChowBot-only tool | Reason |
| --- | --- |
| `publish_menu` | ChowBot menu workflow step; Client MCP menu writes publish immediately through canonical APIs (via `update_menu`'s `status` field, same effect) |
| `generate_image` | ChowBot has one generic image tool; Client MCP uses ChatGPT native image generation plus `save_generated_image_file` |
| `get_site_stats` | ChowBot content-count helper; Client MCP has `get_site_analytics` for traffic/SEO analytics |
| `rename_site`, `set_default_currency`, `save_brand_description`, `update_site_social` | Narrow ChowBot aliases for owner-friendly chat turns; Client MCP uses `update_site_settings` plus specific tools where available |
| `resolve_pending_media` | WhatsApp pending-media flow only |
| `get_experience_availability`, `set_experience_slot_override`, `list_experience_slot_overrides` | ChowBot booking operations not yet exposed to Client MCP |

| Client MCP-only tool | Reason |
| --- | --- |
| `get_current_user`, `get_workspace_context`, `set_workspace_context` | ChatGPT connector workspace/session context |
| `list_sites`, `create_site`, `show_site_preview` | ChatGPT connector onboarding and site selection |
| `show_generated_images`, `save_generated_image`, `save_generated_image_file`, `upload_user_photo` | ChatGPT native image/file flow |
| `resolve_agent_guidance`, `review_agent_guidance_candidate` | Client MCP exposes scoped Agent Skill guidance and advisory review for ChatGPT blog/image workflows; ChowBot should call the same shared resolver/review service when its matching UX is added |
| `get_booking_policy`, `preview_booking_policy`, `update_booking_policy` | Structured booking-policy editing is currently exposed in Client MCP first; ChowBot should use the same backend resolver/formatter when a chat-safe editing flow is added |
| `get_site`, `update_site_settings`, `set_brand_color`, `copy_location_batch`, `get_site_analytics` | Client MCP-specific granularity or dashboard-backed utility not currently present in ChowBot |

## Verification

Before merging surface changes:

1. Run `yarn test:unit`.
2. Run `yarn typecheck`.
3. Confirm no removed tool names remain in code or docs with `rg`.
4. In staging, call `tools/list` and confirm default counts are lower than the raw registries.
5. In ChatGPT, reconnect the KrabiClaw connector and smoke-test:
   - update a menu item
   - update homepage content or hero image
   - create a post
   - create or update an experience
   - ask for domains/social publishing and confirm ChatGPT routes to the dashboard unless the relevant flag is enabled
