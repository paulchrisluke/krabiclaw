# API CRUD Audit And MCP Build Guide

## Summary

This document is the build guide for shifting KrabiClaw toward a chat-first, MCP-ready product. Its scope is the **customer-facing API surface**, not dashboard page parity.

As of June 11, 2026, the right readiness question is:

- does each user-facing business object have a callable API surface for CRUD and required workflow actions?
- are permissions enforceable without relying on dashboard-only assumptions?
- is ChowBot already using canonical APIs/services, or is it bypassing them with private logic that MCP would later have to duplicate?

Current product direction:

- ChatGPT + remote MCP is the long-term primary surface.
- ChowBot remains the first-party web chat shell.
- The current CMS/dashboard should shrink over time to a minimal admin shell for account, billing, domains, OAuth/app connections, and fallback operations.
- No backward-compatibility constraints are assumed for this re-architecture.

### Platform goals this guide must preserve

- A brand-new user should be able to create a free site end to end.
- A customer should be able to upgrade and unlock paid capabilities such as custom domains and managed-service features.
- A platform admin should be able to perform the same operational actions across all sites, plus global/admin-only workflows.
- Transfer flows must remain functional for client handoff.
- Vertical-specific sites must be generated and verified correctly, not just restaurant sites.
- Seed, fixture, and E2E systems must remain strong enough to validate the migration continuously.

## Current API Inventory

This audit is based on the actual route inventory under `server/api`, with `server/utils/chowbot-agent.ts` used as a secondary lens for tool coverage. All tool case handlers were read directly; all claims about route behavior were verified against the actual handler files.

### Route families in scope

- `server/api/sites/...`
  Site-scoped customer APIs for settings, locations, domains, analytics, setup progress, and location reviews.
- `server/api/editor/sites/...`
  Site-scoped editing and workflow APIs for posts, menus, media, content drafts/publish, locales, translations, experiences, notifications, and submission triage.
- `server/api/ai/[siteId]/...`
  Site-scoped AI/session APIs for ChowBot conversations, agent execution, image generation, prompt enhancement, and menu extraction. Also includes `server/api/ai/[siteId]/posts/generate.post.ts` for AI-assisted post drafting.
- `server/api/dashboard/[...path].ts`
  Proxy layer that forwards dashboard calls into `sites`, `editor`, and `ai` APIs. This is a client convenience layer, not a canonical product contract.
- `server/api/admin/...`
  Platform-admin APIs for global client operations, domains, work queue management, transfer flows, platform content, invites, users, analytics, impersonation, and admin-scoped AI generation (`admin/ai/`).
- `server/api/billing/...`
  Plan catalog, checkout, portal, credit, auto-topup, and subscription status APIs.
- `server/api/site-transfer/...`
  Public/authenticated transfer acceptance flow used for handoff to a new owner.
- `server/api/integrations/...`
  Third-party OAuth and sync routes: `facebook-pages/` (auth, callback, pages, publish, sync) and `google-business/` (auth, callback, accounts, locations.sync) and `google-places/` (sync). All managed-service-entitlement-gated or google_business-entitlement-gated.
- `server/api/whatsapp/...`
  WhatsApp webhook in/out. Used as a notification channel (draft_published, site transfer reminders) and as a `work_requests` source.
- `server/api/internal/...`
  Worker-internal async processors: `instagram-sync/process.post.ts` and `translation-jobs/process.post.ts`. Not customer-facing but part of managed-service and translation workflows.
- `server/api/places/...`
  Google Places proxy routes (`search.post.ts`, `[placeId]/index.get.ts`). Backs ChowBot's `lookup_maps_url` tool.
- `server/api/user/...`
  User lifecycle: `billing-items.get.ts`, `delete-account.post.ts`.
- `server/api/public/sites/[siteId]/...`
  Customer-facing public tenant API: bootstrap, config, contact, experiences, menus, posts, reservations, locations, reviews, Q&A, locales. Read-only from the editor perspective; relevant if MCP ever needs to read what a visitor sees.

### Auth and permission patterns in scope

- Most site-level APIs require Better Auth session auth plus organization membership checks.
- Location-owned resources often use stricter helpers such as `requireLocationAccess(...)` in [server/utils/location-access.ts](server/utils/location-access.ts).
- Dashboard-origin flows frequently resolve the active site through [server/utils/dashboard-context.ts](server/utils/dashboard-context.ts), then proxy into site APIs.
- ChowBot currently mixes canonical route-backed behavior with direct utility logic in [server/utils/chowbot-agent.ts](server/utils/chowbot-agent.ts). Several tool cases run raw `UPDATE` SQL against the `sites` table rather than calling the settings API, bypassing side-effect logic such as subdomain registration.

## Domain Audit Matrix

| Domain                                  | Canonical routes today                                                                                                                                                                                                | CRUD state                                              | Publish / workflow actions                                                                                                                                                     | Auth / permission model                                                      | ChowBot today                                                                                                                                                                  | MCP status                          | Gaps / normalization needed                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site creation / onboarding              | `POST /api/sites`, `POST /api/dashboard/restaurant`, `POST /api/dashboard/restaurant/validate-subdomain`, `POST /api/dashboard/onboarding/complete`, `GET /api/sites`, `GET /api/sites/[siteId]`                      | `create+read ready; update/delete intentionally absent` | onboarding completion, subdomain validation                                                                                                                                    | session + org/member creation flow                                           | setup flow can create/rename via tools                                                                                                                                         | usable now                          | canonical create route exists in `server/api/sites.post.ts`; `vertical` is required, the dashboard route is a thin wrapper, and seeding is now vertical-aware. Remaining work is verification depth, not route absence.                                                                                                         |
| Site settings                           | `GET/PATCH /api/sites/[siteId]/settings`                                                                                                                                                                              | `ready` for read/update, no delete expected             | setup progress via `GET /api/sites/[siteId]/setup-progress`                                                                                                                    | session + org owner/admin role                                               | ChowBot rename/currency/brand-description tools now call the shared `updateSiteSettingsFields(...)` utility used by the settings route; socials still use `setConfig` directly | usable now                          | Phase 4 completed the route/utility normalization for site-row mutations, including Cloudflare rollback protection for renames                                                                                                                                                                                                  |
| Locations                               | `GET/POST /api/sites/[siteId]/locations`, `GET/PATCH/DELETE /api/sites/[siteId]/locations/[locationId]`                                                                                                               | `ready`                                                 | Google Business auth/index routes, maps lookup lives in ChowBot utility path                                                                                                   | session + org member role; stricter location checks where needed             | full create/update/delete coverage                                                                                                                                             | usable now                          | low-risk candidate for MCP-first exposure; document Google Maps lookup as workflow helper rather than core CRUD                                                                                                                                                                                                                 |
| Menus / items / sections                | `GET/POST /api/editor/sites/[siteId]/menus`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/menus/[menuId]`, item and section subroutes                                                                                 | `ready` including publish                               | publish via `PATCH /menus/[menuId]` with `{status: 'published'}` — `UpdateMenuRequest.status` is supported and implemented in `menu-management.ts:483`; reorder via `/reorder` | session + site member role                                                   | broad tool coverage including create/update/delete/sync and `publish_menu`                                                                                                     | usable now                          | Phase 4 completed the cleanup: `publish_menu` now calls the same `updateMenu()` utility as the canonical PATCH route                                                                                                                                                                                                            |
| Posts                                   | `GET/POST /api/editor/sites/[siteId]/posts`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/posts/[postId]`, `POST /publish`                                                                                            | `ready`                                                 | publish to site/social channels                                                                                                                                                | session + site member role; publish tighter than edit                        | tools now expose get/create/update/delete/publish; delete remains owner/admin-gated                                                                                            | usable now                          | Phase 4 closed the ChowBot parity gap; future MCP tooling can mirror the same utility surface and permission split                                                                                                                                                                                                              |
| Reviews / replies                       | `GET /api/sites/[siteId]/locations/[locationId]/reviews`, `PATCH /api/editor/sites/[siteId]/reviews/[reviewId]`, `POST /api/integrations/google-places/sync`, `POST /api/integrations/google-business/locations.sync` | `read+reply ready; manual CRUD intentionally removed`   | owner reply / moderation status; Google Places sync; GBP review sync                                                                                                           | session + site member role; editor reply is owner/admin only                 | `get_reviews`, `reply_to_review` only                                                                                                                                          | `usable now`                        | Manual create/edit/delete routes and ChowBot tools are removed. Template review seeding is removed from `seedNewSite`. The editor reply route now uses `requireSiteAccess(...)`. Google Places and Google Business review syncs now cover the ingestion story. Facebook reviews remain unavailable — API deprecated April 2020. |
| Media                                   | `GET /api/editor/sites/[siteId]/media`, `PATCH/DELETE /api/editor/sites/[siteId]/media/[assetId]`, upload/request-upload/confirm routes                                                                               | `workflow-complete by design`                           | upload, confirm, AI image generation, menu extraction                                                                                                                          | session + site member role                                                   | list/delete/generate/import from media supported                                                                                                                               | usable with care                    | media is intentionally workflow-based rather than CRUD-shaped. The canonical contract is documented in `docs/media-workflow-contract.md`; MCP should mirror that workflow instead of inventing `create media` semantics.                                                                                                        |
| Q&A                                     | `GET/POST /api/editor/sites/[siteId]/locations/[locationId]/qa`, `PATCH/DELETE` item routes, `POST /reorder`                                                                                                          | `ready`                                                 | reorder                                                                                                                                                                        | session + location/site member role                                          | get/add/delete tools exist                                                                                                                                                     | usable now                          | ~~route shadow between flat `qa.[id].patch.ts` and `qa/[qaId].patch.ts`~~ fixed — flat file deleted, only the properly-authenticated directory route remains                                                                                                                                                                    |
| Reservation policies                    | managed through `site_content` on the `reservations` page                                                                                                                                                             | `resolved via content workflow`                         | draft, publish, discard, delete-field                                                                                                                                          | session + site member role                                                   | dedicated reservation-policy ChowBot tools removed; use site-content tools                                                                                                     | usable now                          | this is not a separate domain anymore. Reservation policies are edited through `get_site_content_page` / `save_site_content_field` / `delete_site_content_field` with `page: 'reservations'`.                                                                                                                                   |
| Site content                            | `GET /api/editor/sites/[siteId]/content/[page]`, `POST /draft`, `POST /publish`, `POST /discard`, `POST /delete-field`, `GET /status`                                                                                 | `workflow-complete by design`                           | draft, publish, discard, delete-field                                                                                                                                          | session + owner/admin/editor role                                            | get/save/publish/discard/delete-field tools                                                                                                                                    | usable now                          | route family is workflow-centric rather than CRUD-centric, and that is the canonical contract. `GET content` now allows editors, `publish all` and `discard all` are correctly scoped, and `delete-field` closes the last route gap. Remaining work is regression coverage, not API shape.                                      |
| Locales / translations                  | `GET/POST /api/editor/sites/[siteId]/locales`, `PATCH/DELETE /locales/[locale]`, translation inventory/job/review/publish routes                                                                                      | locales `ready`; translations are workflow APIs         | estimate, queue, run batch, review, publish                                                                                                                                    | session + site member role                                                   | strong tool coverage                                                                                                                                                           | usable with care                    | locale CRUD is good; translation lifecycle is intentionally workflow-heavy and should remain so, but must be documented as canonical workflow rather than missing CRUD                                                                                                                                                          |
| Experiences / bookings                  | `GET/POST /api/editor/sites/[siteId]/experiences`, `PATCH/DELETE /experiences/[experienceId]`, bookings get/patch                                                                                                     | `ready`                                                 | guest booking management                                                                                                                                                       | session + site member role                                                   | create/update/delete/list booking tools exist                                                                                                                                  | usable now                          | strong candidate for MCP exposure with existing route family                                                                                                                                                                                                                                                                    |
| Domains                                 | `GET/POST /api/sites/[siteId]/domains`, `PATCH/DELETE /domains/[domainId]`, `POST /sync`                                                                                                                              | `ready`                                                 | DNS sync and lifecycle notifications                                                                                                                                           | session + owner/admin; paid-plan entitlement                                 | no ChowBot tool surface today                                                                                                                                                  | intentionally out of chat/MCP scope | canonical API exists, but the product decision is to keep domains in the dashboard/admin control plane rather than expose them through conversational tools                                                                                                                                                                     |
| Facebook / Instagram integration        | `server/api/integrations/facebook-pages/` (auth, callback, pages, publish, sync)                                                                                                                                      | `ready` for OAuth + publish flow                        | publish post to Facebook page, sync                                                                                                                                            | session + owner/admin; `managed_service` entitlement enforced at route level | no ChowBot tool surface today                                                                                                                                                  | later MCP-only candidate            | fully implemented and entitlement-gated; product direction keeps this out of ChowBot and reserves it for a future managed-service-gated MCP surface if opened at all                                                                                                                                                            |
| Google Business integration             | `server/api/integrations/google-business/` (auth, callback, accounts, locations.sync), `server/api/sites/[siteId]/locations/[locationId]/integrations/google-business/`                                               | `ready` for OAuth + sync                                | sync GBP location data                                                                                                                                                         | session + owner/admin; `google_business` entitlement                         | location-level GBP auth surfaces in ChowBot                                                                                                                                    | usable with care                    | entitlement enforcement must be preserved; canonicalize the two route families (site-level integration vs location-level GBP auth)                                                                                                                                                                                              |
| Notifications                           | `GET/PATCH /api/editor/sites/[siteId]/notifications`                                                                                                                                                                  | `missing CRUD`                                          | update WhatsApp notification phone                                                                                                                                             | session + owner/admin                                                        | not clearly exposed as dedicated tool                                                                                                                                          | blocked                             | this is a settings/workflow surface, not full CRUD; keep in residual admin shell unless a stronger chat use case emerges                                                                                                                                                                                                        |
| Contact / reservation submission triage | `GET /contact-submissions`, `PATCH /contact-submissions/[submissionId]`, `GET /reservation-submissions`, `PATCH /reservation-submissions/[submissionId]`, public submission creation routes                           | `missing CRUD` by design                                | triage/status updates                                                                                                                                                          | session + site member role; public create is anonymous/site-facing           | read tools exist                                                                                                                                                               | usable with care                    | should be modeled as workflow APIs, not forced into artificial CRUD expectations                                                                                                                                                                                                                                                |
| AI conversations / sessions             | `POST /api/ai/[siteId]/agent`, `GET/POST /conversations`, `GET/DELETE /conversations/[conversationId]`, credits/generate-image/enhance/menu-extract routes                                                            | `ready` for session lifecycle                           | agent run, credits, prompt/image helpers                                                                                                                                       | session + site member role                                                   | primary ChowBot surface                                                                                                                                                        | usable now                          | keep as enabling infrastructure, not a substitute for canonical business-object APIs                                                                                                                                                                                                                                            |
| Staff profiles / awards                 | no canonical API route                                                                                                                                                                                                | `removed`                                               | none                                                                                                                                                                           | none                                                                         | no ChowBot tools                                                                                                                                                               | intentionally out of scope          | dead-code tables were dropped in migration `0008_drop_staff_awards.sql`. If this domain returns in the future, it should come back as a complete routed feature, not speculative schema.                                                                                                                                        |

### Domains that already look strongest

- locations
- posts
- experiences/bookings
- locales

### Domains that are most likely to block CMS deprecation

- site creation / onboarding verification depth
- site content workflow regression coverage
- media workflow MCP contract consumption
- transfer + domain restoration regression coverage
- post tool parity ~~(routes exist; update/delete tools missing)~~ **resolved in Phase 4**

## ChowBot Tool Classification

**Updated after Phase 4 implementation.** Tool classifications below reflect the current `server/utils/chowbot-agent.ts` state.

### Canonical — calls named domain utility functions, org+site scoped correctly

These tools call the same underlying domain utilities that the route handlers call. They do not bypass authorization or side-effect logic that exists in the utilities.

| Tool                                                                                                                                                                                                      | Domain                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `get_posts`, `create_post`, `update_post`, `delete_post`, `publish_post`                                                                                                                                  | Posts                                                                                             |
| `get_menu`, `create_menu`, `rename_menu`, `rename_menu_section`, `delete_menu_section`, `add_menu_items_batch`, `sync_menu_items`, `add_menu_item`, `update_menu_item`, `delete_menu_item`, `delete_menu` | Menus                                                                                             |
| `get_locations`, `create_location`, `update_location`, `delete_location`                                                                                                                                  | Locations                                                                                         |
| `get_reviews`, `reply_to_review`                                                                                                                                                                          | Reviews (read + owner reply — manual create/update/delete tools removed per deprecation decision) |
| `get_location_media`, `delete_media_asset`, `generate_image`                                                                                                                                              | Media / AI                                                                                        |
| `get_location_qa`, `add_qa`, `delete_qa`                                                                                                                                                                  | Q&A                                                                                               |
| `get_contact_submissions`, `get_reservation_submissions`                                                                                                                                                  | Submission triage                                                                                 |
| `get_site_content_page`, `save_site_content_field`, `publish_site_content_page`, `discard_site_content_page`, `delete_site_content_field`                                                                 | Site content lifecycle                                                                            |
| `get_site_stats`                                                                                                                                                                                          | Analytics                                                                                         |
| `update_site_social`                                                                                                                                                                                      | Site config (calls `setConfig` utility)                                                           |
| `list_site_languages`, `save_site_language`, `delete_site_language`                                                                                                                                       | Locales                                                                                           |
| `estimate_site_translation`, `start_site_translation_job`, `list_translation_jobs`, `get_translation_job`, `run_translation_job_batch`, `publish_site_translations`                                       | Translations                                                                                      |
| `list_experiences`, `create_experience`, `update_experience`, `delete_experience`, `list_experience_bookings`, `update_experience_booking_status`                                                         | Experiences                                                                                       |
| `create_work_request`                                                                                                                                                                                     | Managed service queue                                                                             |

### Workflow utility — intentional orchestration with no direct CRUD route equivalent

These tools are correctly scoped to their domain but perform workflow operations that span multiple steps or proxy external APIs. Appropriate to keep as workflow helpers.

| Tool                             | Behavior                                                           |
| -------------------------------- | ------------------------------------------------------------------ |
| `lookup_maps_url`                | Proxies Google Places API; backs the location maps-URL workflow    |
| `import_menu_from_pending_media` | Extracts menu data from a pending media asset; multi-step workflow |
| `resolve_pending_media`          | Confirms a pending media upload and links the asset                |

### Private SQL — Phase 4 result

No write SQL remains inside ChowBot tool handlers. `publish_menu` now calls `updateMenu()`, and `rename_site` / `save_brand_description` / `set_default_currency` now call the shared `updateSiteSettingsFields()` utility used by the canonical settings route.

### Private logic — Phase 3 result

Reservation-policy-specific tools were removed. That domain now routes through the canonical site-content workflow instead of bespoke ChowBot logic.

| Tool | Behavior | Gap                                                                              |
| ---- | -------- | -------------------------------------------------------------------------------- |
| none | n/a      | no known private-logic write domains remain in ChowBot after the Phase 3 cleanup |

### Missing tool parity — canonical routes exist but no ChowBot tool

| Missing tool               | Existing canonical route                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| Facebook/Instagram publish | `POST /api/integrations/facebook-pages/publish` (managed_service-gated) |
| update notifications phone | `PATCH /api/editor/sites/[siteId]/notifications`                        |

## Admin Route Classification

Admin routes classified into the three buckets required before MCP export decisions can be made.

### Tenant-domain support operations

These are admin-scoped views into the same tenant domains. They do not own content; they supervise or unblock tenant workflows.

- `GET /api/admin/work-requests`, `PATCH /api/admin/work-requests/[id]` — managed-service request queue
- `GET /api/admin/fulfillment`, `POST /api/admin/fulfillment/[id]/done` — fulfillment queue (separate from work_requests)
- `GET/POST/DELETE /api/admin/sites/[siteId]/transfer` — site transfer initiation/cancellation/inspection
- `GET /api/admin/domains`, `POST /api/admin/domains/reconcile`, `POST /api/admin/domains/[domainId]/sync` — global domain health and reconciliation
- `admin/invites/...`, `admin/members/...`, `admin/clients/...` — org and member management
- `admin/impersonation/...` — session impersonation for support

### Platform-content operations

These manage the platform's own website content (blog, docs, static pages). Completely separate from tenant site content. Must never appear in any tenant MCP tool surface.

- `server/api/admin/content/...` — platform static content CRUD
- `server/api/admin/blog/...` — platform blog CRUD
- `server/api/admin/docs/...` — platform documentation CRUD

### Internal team / security operations

Used by the platform owner and engineering team. Not appropriate for any external MCP surface.

- `admin/users/...` — user role management and lookup
- `admin/analytics/...` — platform-wide analytics
- `server/api/admin/ai/generate.post.ts`, `server/api/admin/ai/generate-image.post.ts` — admin AI generation (platform operator use only)

## Platform-Level Systems Outside Editor CRUD

These systems materially affect whether the product can migrate to a chat-first / MCP-first model without breaking the business.

### Admin-wide operations

Current admin route families include:

- work queue: `GET /api/admin/work-requests`, `PATCH /api/admin/work-requests/[id]`
- fulfillment queue: `GET /api/admin/fulfillment`, `POST /api/admin/fulfillment/[id]/done` — this is a **separate queue** from `work_requests`, not the same surface
- global domains: `GET /api/admin/domains`, `POST /api/admin/domains/reconcile`, `POST /api/admin/domains/[domainId]/sync`
- site transfer management: `GET/POST/DELETE /api/admin/sites/[siteId]/transfer`
- platform content/blog/docs: `server/api/admin/content/...`, `server/api/admin/blog/...`, `server/api/admin/docs/...`
- admin-scoped AI generation: `server/api/admin/ai/generate.post.ts`, `server/api/admin/ai/generate-image.post.ts`
- invites, users, members, clients, impersonation, analytics
- **Historical ChowBot boundary violation (resolved in Phase 1):** `get_platform_content_page`, `save_platform_content_page`, and `delete_platform_content_page` were removed from the tenant ChowBot tool surface. Keep this boundary explicit so future MCP exports do not reintroduce platform-content editing into tenant tool bundles.

Audit conclusion:

- Admin is a first-class product surface, not just a debugging backdoor.
- `work_requests` and `fulfillment` are two distinct queues; do not conflate them.
- The migration guide must preserve a distinction between:
  - customer-editable site operations
  - admin-global operations across all sites
  - platform-content operations unrelated to tenant MCP
- For the long-term architecture, admin should consume the same canonical tenant-domain services where possible, but it will still need a separate global control plane.
- ChowBot's platform content tools must be removed from the tenant tool surface before any MCP export.

### Billing, entitlements, and feature unlocks

Current billing model:

- plan catalog is served by [server/api/billing/plans.get.ts](server/api/billing/plans.get.ts)
- organization billing state is served by [server/api/billing/status.get.ts](server/api/billing/status.get.ts)
- checkout starts at [server/api/billing/checkout.post.ts](server/api/billing/checkout.post.ts)
- entitlements are enforced at API level in [server/utils/billing.ts](server/utils/billing.ts)

Key current entitlements:

- `custom_domains`
- `google_business`
- `translation`
- `translation_languages`
- `ai_credits`
- `managed_service`
- `seo_accelerator`
- `api_access` exists in plan metadata parsing, even if not yet broadly exposed

Audit conclusion:

- Feature unlocks are already modeled as API-level entitlements, which is the right foundation for MCP.
- The migration guide must treat "upgrade to unlock capability" as part of the product contract, not just billing UI.
- Domains, Google Business, translations, Facebook/Instagram integration, and managed-service flows must explicitly remain entitlement-gated when moved into MCP/chat surfaces.

### Site transfer / handoff flows

Current handoff system spans:

- admin initiation/cancel/read under `server/api/admin/sites/[siteId]/transfer...`
- public transfer preview under `GET /api/site-transfer/[token]`
- authenticated transfer acceptance under `POST /api/site-transfer/[token]/accept`
- organization/site/table reparenting in [server/utils/site-transfer.ts](server/utils/site-transfer.ts)
- dedicated E2E coverage in [tests/e2e/site-transfer.spec.ts](tests/e2e/site-transfer.spec.ts)

Audit conclusion:

- Transfer flow is a major platform workflow and must remain outside any "just CRUD" simplification.
- Paid handoff is coupled to checkout completion, custom-domain snapshots, and organization reassignment.
- Any future MCP/admin rewrite must preserve:
  - transfer initiation
  - pending-state inspection
  - checkout-gated acceptance
  - domain deletion/restoration behavior
  - cross-table reparenting

### Vertical-aware site generation

KrabiClaw is not restaurant-only. The repo currently supports at least:

- `restaurant`
- `experience`
- `retail`
- `wellness`
- `service`

The vertical model is visible in:

- [utils/vertical-copy.ts](utils/vertical-copy.ts)
- typed fixture contracts in [seed-definitions/contracts.ts](seed-definitions/contracts.ts)
- client onboarding scripts and verification tooling
- regression tests such as [tests/e2e/pottery-house.spec.ts](tests/e2e/pottery-house.spec.ts)

Audit conclusion:

- New-site generation is now vertical-aware. [server/utils/site-template.ts](server/utils/site-template.ts) takes `seedNewSite(db, { organizationId, siteId, name, vertical })` and selects vertical-specific defaults for menus (restaurant-only), Q&A, posts, and `site_content`.
- Non-restaurant verticals no longer receive restaurant-specific copy (for example, "Come dine with us" / "Come hungry") from default seeding.
- Vertical-correct site bootstrapping is now part of the canonical creation flow and should remain covered by fixture and E2E regression tests.

### Seed, fixture, import, and verification system

Current source-of-truth system already includes:

- typed tenant definitions in `seed-definitions/`
- generated bundle artifacts for demo
- client import / replay / verify scripts
- local fixture scripts
- unit tests for compiled typed fixtures
- E2E coverage for dashboard, public site, translations, billing, notifications, role matrix, and site transfer

Typed fixture contracts in [seed-definitions/contracts.ts](seed-definitions/contracts.ts) already model:

- site identity and site vertical
- domains and locales
- locations
- media assets
- site content
- experiences
- reviews
- menus
- Q&A
- posts
- translations
- AI credits
- organization billing

Audit conclusion:

- The migration must preserve typed fixture truth, approved-import replay, and CI verification as first-class systems.
- This is not just documentation hygiene; it is how we will safely refactor toward MCP without losing real product coverage.
- The build guide must therefore include not only runtime APIs, but also the verification infrastructure that proves the product still works.

### Test-system findings

Current automated coverage already proves several product contracts:

- dashboard smoke and content publish flow: [tests/e2e/dashboard.spec.ts](tests/e2e/dashboard.spec.ts)
- public tenant rendering and booking/reservation flows: [tests/e2e/public.spec.ts](tests/e2e/public.spec.ts)
- experience-vertical regressions and forbidden restaurant copy: [tests/e2e/pottery-house.spec.ts](tests/e2e/pottery-house.spec.ts)
- role and permission behavior: [tests/e2e/role-matrix.spec.ts](tests/e2e/role-matrix.spec.ts)
- translations lifecycle: [tests/e2e/translations.spec.ts](tests/e2e/translations.spec.ts)
- transfer lifecycle: [tests/e2e/site-transfer.spec.ts](tests/e2e/site-transfer.spec.ts)
- notification record creation across submissions: [tests/e2e/notifications.spec.ts](tests/e2e/notifications.spec.ts)
- typed fixture determinism: [tests/unit/demo-fixture.test.ts](tests/unit/demo-fixture.test.ts), [tests/unit/pottery-house-fixture.test.ts](tests/unit/pottery-house-fixture.test.ts)

Audit conclusion:

- The migration should explicitly map each major capability change to existing test coverage or to a required new regression.
- If a capability is absent from the test system, it should be treated as under-protected during refactor.

## Canonical Domain Surface Required

Before CMS deprecation starts, the minimum required surface is:

### Must have clean canonical APIs

- site creation and site settings
- locations
- menus, items, sections, and publish lifecycle
- posts and publish lifecycle
- reviews and owner replies
- media management workflow
- Q&A
- site content editing lifecycle
- locales and translation workflow
- experiences and booking triage
- domains
- reservation policies (currently zero canonical routes)

### Can remain workflow-oriented rather than pure CRUD

- content draft/publish/discard
- translation estimate/queue/run/review/publish
- media upload/confirm/generate/import
- submission triage
- onboarding completion
- Facebook/Instagram publish (workflow, entitlement-gated)

## Architectural Decisions

These are resolved calls, not open questions. Each one has a rationale. Revisit only if product direction changes.

### Decision: Drop `staff_profiles` and `awards_recognition` tables

**Do:** Create a migration to drop both tables and delete the six utilities in `content-management.ts` (`getStaffProfiles`, `upsertStaffProfile`, `deleteStaffProfile`, `getAwardsRecognition`, `upsertAwardRecognition`, `deleteAwardRecognition`).

**Why:** Zero callers anywhere in `server/`. Speculative schema with no runtime path is technical debt that misleads anyone reading migrations and creates false confidence about domain coverage. If staff profiles are ever needed — likely for the wellness or experience vertical — add the table, utilities, and routes together in one clean domain unit at that time.

**Do not** keep the tables "just in case." That is the exact pattern this migration is designed to avoid.

---

### Decision: Reservation policies are a content field, not a route domain

**Do not** add `GET/PATCH/DELETE /editor/sites/[siteId]/reservation-policies` routes.

**Do:** Remove the three ChowBot tools `get_reservation_policies`, `save_reservation_policies`, `delete_reservation_policies`. Reservation policies are already a named field in the existing site content system — `RESERVATIONS_PAGE` / `RESERVATION_POLICIES_FIELD` — and the content tools already handle them correctly once the content field deletion route exists (see below). Adding a dedicated route family would create a redundant abstraction over a field that already belongs to the content domain.

After removing the tools, the correct ChowBot operations for reservation policies are:

- **Read:** `get_site_content_page` with `{ page: 'reservations' }`
- **Write:** `save_site_content_field` with `{ page: 'reservations', field: 'reservation_policies', value: ... }` — this correctly goes through the draft lifecycle
- **Delete:** `delete_site_content_field` with `{ page: 'reservations', field: 'reservation_policies' }` — this requires the new route below

The current `save_reservation_policies` bug (writing live, bypassing draft) is eliminated by this approach, not fixed within the existing tool.

---

### Decision: Add one content field deletion route to complete the content lifecycle

**Do:** Add `POST /editor/sites/[siteId]/content/delete-field` accepting `{ page, field, location_id? }`. This is the only missing operation in the site content lifecycle. After this route exists, the full content domain is route-complete:

| Operation    | Route                                                             |
| ------------ | ----------------------------------------------------------------- |
| Read         | `GET /editor/sites/[siteId]/content/[page]`                       |
| Draft        | `POST /editor/sites/[siteId]/content/draft`                       |
| Publish      | `POST /editor/sites/[siteId]/content/publish`                     |
| Discard      | `POST /editor/sites/[siteId]/content/discard`                     |
| Delete field | `POST /editor/sites/[siteId]/content/delete-field` ← **add this** |

Auth: `owner | admin | editor` consistent with draft/discard.

---

### Decision: Fix site content GET permission — extend to editor role

**Do:** Change `GET /editor/sites/[siteId]/content/[page]` to allow `owner | admin | editor`. Currently it is owner-only, which means editors can draft and discard content they cannot read. This is an oversight, not a deliberate access policy. The read/write split the owner-only gate creates is incoherent.

Publish remains `owner | admin` only. That is the correct boundary.

---

### Decision: Deprecate the manual review system — import from Google, not from the owner

**The product does not need a first-party review creation/edit/delete system.** Owner-entered reviews have no trust signal and add complexity. Reviews should come from Google only.

#### What already works

`syncPlaceToLocation` in [server/utils/google-places.ts](server/utils/google-places.ts) already upserts Google reviews into the `reviews` table via `INSERT OR IGNORE` deduplicated on `google_review_id`, with `source = 'google_places'` and `status = 'published'`. This is triggered via `POST /api/integrations/google-places/sync`. No new infrastructure is needed for the core import flow.

#### What to remove

- `POST /api/sites/[siteId]/locations/[locationId]/reviews` — manual create route
- `PATCH /api/sites/[siteId]/locations/[locationId]/reviews/[reviewId]` — manual edit route
- `DELETE /api/sites/[siteId]/locations/[locationId]/reviews/[reviewId]` — manual delete route
- `create_review`, `update_review`, `delete_review` ChowBot tools
- Template review seeds in [server/utils/site-template.ts](server/utils/site-template.ts) — the 3 fake reviews created at site setup are dead weight once real reviews are the source of truth

#### What to keep

- `GET /api/sites/[siteId]/locations/[locationId]/reviews` — read route remains; still needed for dashboard and public site
- `PATCH /api/editor/sites/[siteId]/reviews/[reviewId]` — owner reply route remains; replying to imported Google reviews is a legitimate operation
- `get_reviews` and `reply_to_review` ChowBot tools remain
- The `status` field on reviews remains for display control (owner can hide a review from the website even if it's a real Google import — this is a reasonable product feature)
- **Fix the editor reply route's auth pattern** — it currently uses a raw inline JOIN instead of a shared helper. This is the only remaining action on the editor review route. Refactor to use a `requireSiteAccess(event, siteId, ['owner', 'admin'])` helper consistent with `requireLocationAccess`.

#### Google Places vs Google Business Profile

- **Google Places API** (current): syncs the top 5 featured reviews per location. Requires `GOOGLE_PLACES_API_KEY`. Available to all plans.
- **Google Business Profile API** (implemented): syncs verified reviews per location through the existing GBP OAuth + location sync flow (`server/api/integrations/google-business/...`). Reviews are upserted with `source = 'google_business'`, which extends coverage beyond Google Places highlights.

#### Facebook reviews: not viable

Facebook deprecated their ratings/recommendations API in April 2020. The current Facebook sync only pulls page info and posts — there is no Facebook reviews endpoint to call. Do not design for Facebook as a reviews source.

#### Owner reply push-back to Google

The GBP API supports `POST accounts/{account}/locations/{location}/reviews/{review}/reply` to post owner replies back to Google. Replies stored locally in `owner_reply` are currently sufficient for tenant-site display. Google push-back remains a future enhancement and is intentionally separate from review-sync readiness.

---

### Decision: Domains are a dashboard+admin surface — not a ChowBot or MCP tool

**Do not** add ChowBot tools for domain CRUD. Domains are owner-only, paid-plan-gated operations that require deliberate user intent, DNS management, and billing state verification. These are not appropriate for a conversational tool surface. Domains stay in the dashboard for owners and in the admin panel for operators.

This is a permanent decision, not a deferred one. Remove domains from "missing tool parity" tracking.

---

### Decision: Facebook/Instagram goes to MCP Phase 5, not ChowBot

**Do not** add Facebook/Instagram tools to ChowBot. The managed-service entitlement requirement, OAuth state, and publish confirmation semantics do not compose cleanly with a session-based chat tool. When this surface opens up — if product direction confirms it — it goes directly into MCP Phase 5 as a managed-service-gated tool set, not through ChowBot.

---

### Decision: Notifications stays in residual admin shell

**Do not** add a ChowBot tool for WhatsApp notification phone management. Single-field phone number update. Not a meaningful chat operation.

---

### Decision: site creation needs a canonical route outside dashboard

**Do:** Move the logic from [server/api/dashboard/restaurant.post.ts](server/api/dashboard/restaurant.post.ts) into `server/api/sites.post.ts` and make the dashboard route a thin proxy to it.

The handler **does not** take `organizationId` as input — it creates or finds the org for the authenticated user as part of the same flow. The request signature is `{ name, subdomain, vertical }`. Org creation, member assignment, site record creation, `seedNewSite`, and `createSystemSubdomain` all remain part of this single handler, because they are semantically a single atomic operation for the user.

Key things to preserve from the existing handler during the move:

- Idempotency: existing active site returns early with site ID; pending/failed site resumes rather than duplicating
- Subdomain uniqueness check scoped to other orgs
- org update only if user is owner AND no sites exist yet
- `onboarding_status = 'pending'` → seed → `'active'` lifecycle with `'failed'` on error

`vertical` is a required parameter — one of `restaurant | experience | retail | wellness | service`. Do not default to `restaurant` if omitted; fail with 400 and require the caller to provide it. The existing handler's `restaurantName` parameter becomes `name`.

---

### Completed decision: New-site template is vertical-aware

**Done:** `seedNewSite` in [server/utils/site-template.ts](server/utils/site-template.ts) now accepts `vertical` and uses per-vertical defaults for Q&A, post copy, and `site_content`. Restaurant sample menu seeding remains restaurant-only.

No non-restaurant vertical should receive restaurant-specific copy in default seed content. This remains a product integrity contract and should stay under regression coverage.

---

### Decision: `publish_menu`, `rename_site`, `save_brand_description`, `set_default_currency` migrate to canonical routes in Phase 4

- `publish_menu` → call `PATCH /editor/sites/[siteId]/menus/[menuId]` with `{ status: 'published' }`. The route and handler already support this.
- `rename_site` → call `PATCH /api/sites/[siteId]/settings`. **Preserve the rollback behavior:** `createSystemSubdomain` failure must roll back both `brand_name` and `subdomain` before the settings route returns an error. The rollback is already in the direct-SQL implementation; it must be retained in the route handler when this tool migrates.
- `save_brand_description` → call `PATCH /api/sites/[siteId]/settings`. No Cloudflare side effects; straightforward swap.
- `set_default_currency` → call `PATCH /api/sites/[siteId]/settings`. No Cloudflare side effects; straightforward swap.

Do these as a single PR once the settings route has been verified to handle all four fields.

---

### Decision: Add `update_post` and `delete_post` ChowBot tools in Phase 4

Routes already exist. Wire them up when migrating the settings tools. Not a route gap — pure parity closure.

---

## Concrete Findings (Audit Record)

Historical record of what was found and fixed. The architectural decisions above supersede any open-question framing here.

### Fixed in Phase 1

- ~~`discard all content drafts` cross-tenant security bug~~ **Fixed.** `discardAllDrafts` now takes `(db, organizationId, siteId)` and scopes the DELETE.

- ~~`publish all content` returns 501~~ **Fixed.** `publishAllDrafts` now scoped to org+site; `publish.post.ts` calls it for the `all` case.

- ~~`QA route shadow`~~ **Fixed.** Flat file `qa.[id].patch.ts` deleted; only the properly-authenticated directory route `qa/[qaId].patch.ts` remains.

- ~~`ChowBot platform content tools` violating tenant/admin boundary~~ **Fixed.** `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` fully removed from tenant ChowBot.

- ~~`ChowBot rename_site` missing Cloudflare subdomain registration~~ **Fixed.** `rename_site` now calls `createSystemSubdomain` after the SQL UPDATE; on failure it rolls back both `brand_name` and `subdomain` and returns an error to the caller.

### Open — resolved by architectural decisions above

- `reservation policies` no-route gap → **Decision: remove the 3 tools, use content field workflow instead**
- `site content field deletion` not route-backed → **Decision: add `POST /content/delete-field`**
- `site content GET` owner-only → **Decision: extend to editor role**
- `reviews` manual system → **Decision: deprecate manual create/edit/delete; import from Google Places (already working) and extend GBP sync; keep read + owner reply**
- `staff_profiles` / `awards_recognition` dead schema → **Decision: drop both tables**
- `site creation` dashboard-only → **Decision: add `POST /api/sites` with vertical param**
- `new-site template` restaurant-biased ~~→ Decision: extend to vertical-aware registry~~ **Done in Phase 3 (vertical-aware seeding in canonical site creation flow)**
- `publish_menu` direct SQL ~~→ Decision: migrate to PATCH route in Phase 4~~ **Done in Phase 4**
- `rename_site`, `save_brand_description`, `set_default_currency` direct SQL ~~→ Decision: migrate to settings route in Phase 4~~ **Done in Phase 4 via shared `updateSiteSettingsFields` utility**
- `domains` tool parity gap → **Decision: domains are not a chat/MCP surface — permanently resolved**
- `Facebook/Instagram` tool parity gap → **Decision: MCP Phase 5 only, not ChowBot**
- `notifications` tool gap → **Decision: stays in admin shell**
- `post update/delete` tool parity gap ~~→ Decision: add in Phase 4~~ **Done in Phase 4**

## Full-Surface Readiness Model

For this app, "ready to deprecate the CMS" does **not** mean only CRUD route completeness. It means all of the following are true:

### 1. Customer build readiness

- a free user can create a site
- the initial site matches the chosen vertical
- the user can complete core content and operational setup without falling back to hidden admin/manual steps

### 2. Paid unlock readiness

- plan upgrades are available
- entitlements are enforced consistently at API level
- newly unlocked capabilities can be exercised through canonical APIs and, later, tools

### 3. Admin control-plane readiness

- platform admin can inspect and operate across all sites
- owner-only workflows still exist where needed
- tenant-domain operations and global/platform operations remain clearly separated
- platform-content CRUD and admin-team workflows stay available even if tenant editing shifts toward chat-first
- ChowBot's platform content tools are removed from the tenant tool surface

### 4. Handoff / lifecycle readiness

- transfer flows still work
- domains survive or are intentionally paused/restored during transfer
- account deletion, billing ownership, and org ownership constraints remain coherent

### 5. Verification readiness

- typed fixtures still compile and seed deterministically
- client import/verify pipeline still functions
- E2E and unit coverage still represent the real product, including non-restaurant verticals

### Can stay out of initial MCP write scope

- billing
- admin-only route families
- impersonation
- fulfillment queue internals
- platform blog/docs/content management
- WhatsApp channel configuration

## Migration Phases

### Phase 1-4: Foundation Work (Complete)

**Status:** complete. Phases 1 through 4 are fully shipped. The repo has moved from gap-closing to verification and Phase 5 contract hardening.

**Phase 1 delivered:**
- scoped content draft discard/publish-all fixes
- QA route shadow removal
- tenant ChowBot surface cleanup (platform-content tools removed)

**Phase 2 delivered:**
- full domain audit matrix and canonical contract lock
- ChowBot classification by canonical utility, workflow utility, and private logic
- admin route classification by tenant support vs platform content vs internal/security operations

**Phase 3 delivered:**
- canonical site creation route with required `vertical`
- content lifecycle completion (`delete-field` route) and editor read parity for content GET
- reservation-policy tool removal in favor of canonical content-field workflow
- manual review CRUD deprecation plus GBP review sync in the existing integration flow
- vertical-aware site seeding and media workflow contract documentation
- staff/awards dead-schema cleanup (migration and utility removal)

**Phase 4 delivered:**
- ChowBot migration to canonical shared utilities for menu publish and site settings mutations
- ChowBot post parity (`update_post`, `delete_post`) with confirm and role boundaries preserved
- zero write SQL remaining inside ChowBot tool handlers
- canonical baseline established for Phase 5 MCP contract export

**Operational note:** Keep detailed implementation playbooks in git history and PR descriptions; this guide should now track only current state, open blockers, and verification status.

### Phase 5: Full Stateless MCP Surface

**Entry criteria:** Phase 1 through Phase 4 complete, guide updated to match repo state, and regression coverage extended to the MCP protocol layer.

**Status: implemented as the current Phase 5 target.** The old registry-only slice was removed and replaced with a real authenticated MCP server at `POST /api/mcp`.

- This repo now targets the **current stateless MCP direction**.
- No backward compatibility is maintained for the older handshake/session-style MCP flow.
- No references remain in the implementation plan to the older handshake/session lifecycle or the previous registry-only interim target.

#### Current Phase 5 shape

- Route: `POST /api/mcp`
- Transport model: ordinary stateless HTTP request handling
- Protocol methods implemented:
  - `server/discover`
  - `tools/list`
  - `tools/call`
- Protocol methods intentionally **not** implemented in this phase:
  - prompts
  - resources
  - sampling
  - tasks/apps extensions
  - handshake/session lifecycle
- Auth model in this phase:
  - Better Auth session auth
  - site scoping remains mandatory for tenant tools
  - tool visibility and execution are filtered by current product roles
- OAuth/protected-resource metadata:
  - still later work
  - not part of Phase 5 tool execution itself

#### Current Phase 5 tool surface

The MCP registry is now a shared source of truth for tool metadata and execution rules, with direct execution through shared domain utilities rather than ChowBot handlers.

- Included domains:
  - site creation and site read/update surfaces that are customer-safe
  - locations
  - menus
  - posts
  - media workflow
  - site content workflow
  - reservation policies through content workflow
  - Q&A
  - reviews / owner replies
  - experiences / bookings
  - locales / translations
  - contact / reservation submission triage
  - notifications phone/settings
  - Google Business customer-safe auth/sync surfaces
  - managed-service work requests
- Excluded domains:
  - domains
  - billing / checkout / portal / credits purchase flows
  - transfer acceptance / handoff checkout
  - Facebook / Instagram
  - admin-global / platform content / internal tooling
  - AI conversation/session APIs as MCP tools

#### Phase 5 guardrails

- Destructive tools stay confirm-gated.
- Workflow domains remain workflow-shaped rather than flattened into fake CRUD.
- Reservation policies remain content-field workflow, not a separate tool family.
- Review tooling remains read + reply only.
- Entitlement checks remain enforced for gated surfaces, especially Google Business and managed-service actions.

### Phase 6: Protect the migration with fixtures and tests

- Expand typed fixtures and regression scripts when new canonical contracts are introduced.
- Keep experience-vertical and restaurant-vertical verification in the suite.
- Keep transfer, billing-entitlement, and notification-record coverage in the suite.
- Add regression coverage for any fixed high-risk bug, especially:
  - ~~scoped draft discard~~ **Covered in `tests/e2e/content-lifecycle.spec.ts`**: two-org isolation test verifies that `discard-all` on org A cannot affect org B's drafts.
  - ~~scoped publish all~~ **Covered in `tests/e2e/content-lifecycle.spec.ts`**: two-org isolation test verifies that `publish-all` on org A cannot clear org B's pending drafts.
  - ~~QA route shadow removal~~ **Done.**
  - ~~content delete-field route (Phase 3)~~ **Covered in `tests/e2e/content-lifecycle.spec.ts`**: asserts field is absent from merged GET response after delete-field call.
  - ~~reservation policy tools removed~~ **Covered in `tests/e2e/content-lifecycle.spec.ts`**: verifies `reservation_policies` field can be drafted and read back via `GET /editor/sites/[siteId]/content/reservations`.
  - ~~review contract consolidated under editor (Phase 3)~~ **Covered in `tests/e2e/review-contract.spec.ts`**: asserts manual create/edit/delete routes return 404; asserts owner can reply and editor cannot via the editor reply route.
  - vertical-correct site bootstrap (Phase 3) — now partially covered by the pottery-house experience-site regression in `tests/e2e/pottery-house.spec.ts`; keep expanding fixture coverage
  - ChowBot settings bypass migration — `rename_site` now shares `updateSiteSettingsFields(...)` with the canonical settings route. E2E rollback coverage exists both at the route layer (`tests/e2e/site-settings.spec.ts`) and the ChowBot tool layer (`tests/e2e/chowbot-tools.spec.ts`).
  - ~~transfer + domain restoration interactions~~ **Partially covered in `tests/e2e/site-transfer.spec.ts`**: new test verifies `custom_domains_snapshot` field is present on a paid transfer, cancellation sets status to `'cancelled'`, and site remains in the original org. Full domain restore test (re-provisioning Cloudflare custom hostnames from snapshot) requires a site with live custom domains and is not covered in CI.

## MCP / OAuth Readiness

OAuth implementation is a later PR, but these are the current prerequisites.

### Current repo state

- Better Auth is mounted at [server/api/auth/[...].ts](server/api/auth/%5B...%5D.ts).
- The repo currently does **not** expose `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`, or MCP protected-resource metadata routes.
- That means the repo is **not yet ready** for ChatGPT app auth or remote MCP OAuth linkage.

### Better Auth planning target

Per Better Auth's current OAuth Provider plugin docs:

- the auth server can act as an OAuth 2.1 / OIDC-compatible provider
- public clients are supported
- dynamic client registration is supported
- MCP-oriented auth support is explicitly called out

Reference:

- Better Auth OAuth Provider docs: <https://better-auth.com/docs/plugins/oauth-provider>

### OpenAI planning target

Per current OpenAI Apps SDK authentication docs, a remote MCP integration needs:

- protected resource metadata on the MCP server
- OAuth metadata from the authorization server
- authorization-code + PKCE (`S256`)
- correct `resource` propagation through auth and token exchange
- token verification by the MCP server for issuer, audience, expiry, and scopes

References:

- OpenAI Apps SDK authentication: <https://developers.openai.com/apps-sdk/build/auth>
- OpenAI Apps SDK quickstart: <https://developers.openai.com/apps-sdk/quickstart>

### Default auth direction

- Keep Better Auth as the user identity system.
- Add OAuth provider capabilities later for ChatGPT/MCP linking.
- Treat ChowBot web chat and MCP tools as two clients over the same domain layer.
- Prefer CIMD-compatible planning first, with DCR support considered later if needed.

## Open Risks / Assumptions

- The largest risk is mistaking dashboard reachability for canonical API maturity. This document intentionally does not treat dashboard proxying as proof of domain readiness.
- Some domains are healthy from a data perspective but not from a contract perspective because workflow actions live only in ChowBot-private logic (reservation policies, content field deletion, direct site row mutations).
- Media and content should not be forced into naive CRUD abstractions; they need explicit workflow contracts.
- Domains with strong APIs but missing ChowBot tools are still blockers if the product wants ChowBot and MCP to feel like peers.
- Admin-only and billing-only APIs should remain out of the first MCP write surface unless product direction changes.
- Vertical correctness is a product integrity issue, not just a copy issue.
- The seed/import/verify system is part of the architecture and must evolve alongside the runtime APIs.
- Do not copy ChowBot's current tool list wholesale as a starting point for MCP tools — it contains admin platform-content tools that should not be tenant-accessible, and several tools run direct SQL instead of calling canonical routes.
- Plans written against this document without reading the actual handler files will re-introduce the same errors this document was written to correct. Verify claims against code, not against prior plans.
