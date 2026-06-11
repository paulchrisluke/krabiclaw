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

| Domain | Canonical routes today | CRUD state | Publish / workflow actions | Auth / permission model | ChowBot today | MCP status | Gaps / normalization needed |
|---|---|---|---|---|---|---|---|
| Site creation / onboarding | `POST /api/dashboard/restaurant`, `POST /api/dashboard/restaurant/validate-subdomain`, `POST /api/dashboard/onboarding/complete`, `GET /api/sites`, `GET /api/sites/[siteId]` | `missing CRUD` | onboarding completion, subdomain validation | session + dashboard org context | setup flow can create/rename via tools | blocked | creation still starts in dashboard-only route family; no clean canonical site create/update/delete contract; initial site creation is not yet in `server/api/sites/...` |
| Site settings | `GET/PATCH /api/sites/[siteId]/settings` | `ready` for read/update, no delete expected | setup progress via `GET /api/sites/[siteId]/setup-progress` | session + org owner/admin role | ChowBot can rename site, set currency, update socials, save brand description — `rename_site` now fires `createSystemSubdomain` after the SQL UPDATE; `save_brand_description` and `set_default_currency` still run direct SQL (no side effects in the settings route beyond the same SQL, so no gap) | usable now | `rename_site` subdomain registration gap is closed; `save_brand_description` and `set_default_currency` direct SQL is acceptable — these fields have no Cloudflare side effects |
| Locations | `GET/POST /api/sites/[siteId]/locations`, `GET/PATCH/DELETE /api/sites/[siteId]/locations/[locationId]` | `ready` | Google Business auth/index routes, maps lookup lives in ChowBot utility path | session + org member role; stricter location checks where needed | full create/update/delete coverage | usable now | low-risk candidate for MCP-first exposure; document Google Maps lookup as workflow helper rather than core CRUD |
| Menus / items / sections | `GET/POST /api/editor/sites/[siteId]/menus`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/menus/[menuId]`, item and section subroutes | `ready` including publish | publish via `PATCH /menus/[menuId]` with `{status: 'published'}` — `UpdateMenuRequest.status` is supported and implemented in `menu-management.ts:483`; reorder via `/reorder` | session + site member role | broad tool coverage including create/update/delete/sync and `publish_menu` | usable now | `publish_menu` in ChowBot runs raw SQL directly rather than calling the PATCH route — this is a cleanup task, not a missing capability; no route work needed here |
| Posts | `GET/POST /api/editor/sites/[siteId]/posts`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/posts/[postId]`, `POST /publish` | `ready` | publish to site/social channels | session + site member role; publish tighter than edit | tools expose get/create/publish only | `duplicated/split across route families` | ChowBot lacks explicit update/delete tools even though canonical routes exist; tool/API parity gap should be closed before MCP |
| Reviews / replies | `GET /api/sites/[siteId]/locations/[locationId]/reviews`, `PATCH /api/editor/sites/[siteId]/reviews/[reviewId]`, `POST /api/integrations/google-places/sync` | `deprecating manual CRUD` | owner reply / moderation status; Google Places sync | session + site member role; editor reply is owner/admin only | `get_reviews`, `reply_to_review` (manual create/update/delete tools to be removed) | `usable now for read+reply; sync already works` | Manual create/edit/delete routes are being deprecated — reviews come from Google Places sync (already working) and GBP review sync (Phase 3 extension). `create_review`, `update_review`, `delete_review` ChowBot tools and the manual mutation routes are removed. Template reviews removed from `seedNewSite`. Editor reply route keeps its business logic; auth pattern to be refactored to use a shared helper. Facebook reviews not viable — API deprecated April 2020. |
| Media | `GET /api/editor/sites/[siteId]/media`, `PATCH/DELETE /api/editor/sites/[siteId]/media/[assetId]`, upload/request-upload/confirm routes | `missing CRUD` | upload, confirm, AI image generation, menu extraction | session + site member role | list/delete/generate/import from media supported | blocked | no canonical `GET /media/[assetId]`; create is workflow-based rather than record-based; MCP needs a documented media workflow contract, not just raw CRUD semantics |
| Q&A | `GET/POST /api/editor/sites/[siteId]/locations/[locationId]/qa`, `PATCH/DELETE` item routes, `POST /reorder` | `ready` | reorder | session + location/site member role | get/add/delete tools exist | usable now | ~~route shadow between flat `qa.[id].patch.ts` and `qa/[qaId].patch.ts`~~ fixed — flat file deleted, only the properly-authenticated directory route remains |
| Reservation policies | no canonical API route | `missing entirely` | none | no route exists | `get_reservation_policies`, `save_reservation_policies`, `delete_reservation_policies` tools exist | blocked | three ChowBot tools manage a real user-facing domain (reservation rules, hold times, cancellation policies); `save_reservation_policies` writes directly to `site_content` live, bypassing the draft/publish lifecycle; no canonical editor route exists for this domain at all |
| Site content | `GET /api/editor/sites/[siteId]/content/[page]`, `POST /draft`, `POST /publish`, `POST /discard`, `GET /status` | `missing CRUD` | draft, publish, discard | session + site member role, but inconsistent by action | get/save/publish/discard/delete-field tools | blocked | route family is workflow-centric, not CRUD-centric; field deletion exists in ChowBot logic but not as canonical editor route; `GET content` is owner-only while draft/discard allow editor/admin; `publish all` and `discard all` are now scoped correctly (cross-tenant security bug fixed, 501 resolved); remaining gap is canonical field deletion route |
| Locales / translations | `GET/POST /api/editor/sites/[siteId]/locales`, `PATCH/DELETE /locales/[locale]`, translation inventory/job/review/publish routes | locales `ready`; translations are workflow APIs | estimate, queue, run batch, review, publish | session + site member role | strong tool coverage | usable with care | locale CRUD is good; translation lifecycle is intentionally workflow-heavy and should remain so, but must be documented as canonical workflow rather than missing CRUD |
| Experiences / bookings | `GET/POST /api/editor/sites/[siteId]/experiences`, `PATCH/DELETE /experiences/[experienceId]`, bookings get/patch | `ready` | guest booking management | session + site member role | create/update/delete/list booking tools exist | usable now | strong candidate for MCP exposure with existing route family |
| Domains | `GET/POST /api/sites/[siteId]/domains`, `PATCH/DELETE /domains/[domainId]`, `POST /sync` | `ready` | DNS sync and lifecycle notifications | session + owner/admin; paid-plan entitlement | no ChowBot tool surface today | blocked by tool gap | canonical API exists; ChowBot and future MCP tool definitions need to be added if domains are in scope for chat surfaces |
| Facebook / Instagram integration | `server/api/integrations/facebook-pages/` (auth, callback, pages, publish, sync) | `ready` for OAuth + publish flow | publish post to Facebook page, sync | session + owner/admin; `managed_service` entitlement enforced at route level | no ChowBot tool surface today | blocked by tool gap | fully implemented and entitlement-gated; ChowBot has no tools for Facebook publish despite the route existing; `managed_service` boundary must be preserved when any tool layer is added |
| Google Business integration | `server/api/integrations/google-business/` (auth, callback, accounts, locations.sync), `server/api/sites/[siteId]/locations/[locationId]/integrations/google-business/` | `ready` for OAuth + sync | sync GBP location data | session + owner/admin; `google_business` entitlement | location-level GBP auth surfaces in ChowBot | usable with care | entitlement enforcement must be preserved; canonicalize the two route families (site-level integration vs location-level GBP auth) |
| Notifications | `GET/PATCH /api/editor/sites/[siteId]/notifications` | `missing CRUD` | update WhatsApp notification phone | session + owner/admin | not clearly exposed as dedicated tool | blocked | this is a settings/workflow surface, not full CRUD; keep in residual admin shell unless a stronger chat use case emerges |
| Contact / reservation submission triage | `GET /contact-submissions`, `PATCH /contact-submissions/[submissionId]`, `GET /reservation-submissions`, `PATCH /reservation-submissions/[submissionId]`, public submission creation routes | `missing CRUD` by design | triage/status updates | session + site member role; public create is anonymous/site-facing | read tools exist | usable with care | should be modeled as workflow APIs, not forced into artificial CRUD expectations |
| AI conversations / sessions | `POST /api/ai/[siteId]/agent`, `GET/POST /conversations`, `GET/DELETE /conversations/[conversationId]`, credits/generate-image/enhance/menu-extract routes | `ready` for session lifecycle | agent run, credits, prompt/image helpers | session + site member role | primary ChowBot surface | usable now | keep as enabling infrastructure, not a substitute for canonical business-object APIs |
| Staff profiles / awards | no canonical API route | `missing entirely` | none | no route, no auth enforcement | no ChowBot tools | blocked | **Audited.** `content-management.ts` exports full CRUD utilities (`getStaffProfiles`, `upsertStaffProfile`, `deleteStaffProfile`, `getAwardsRecognition`, `upsertAwardRecognition`, `deleteAwardRecognition`) — but these utilities have **zero callers** anywhere in `server/`. No editor routes, no ChowBot tools, no public API surface. The tables and schema exist; the domain is completely unreachable at runtime. |

### Domains that already look strongest

- locations
- posts
- experiences/bookings
- domains
- locales

### Domains that are most likely to block CMS deprecation

- site creation / onboarding (needs `POST /api/sites` with vertical param)
- site content editing lifecycle (discard + publish-all fixed; content field deletion route still needed)
- reservation policies (resolved: no new route — remove 3 ChowBot tools, use content field workflow instead)
- media workflow (no new routes needed; needs contract documentation for MCP)
- review system (resolved: deprecate manual CRUD, Google Places sync already works, extend GBP for full coverage)
- post tool parity (routes exist; update/delete tools missing)

## ChowBot Tool Classification

**As of Phase 2 audit.** All 64 tool case handlers verified against `server/utils/chowbot-agent.ts`.

### Canonical — calls named domain utility functions, org+site scoped correctly

These tools call the same underlying domain utilities that the route handlers call. They do not bypass authorization or side-effect logic that exists in the utilities.

| Tool | Domain |
|---|---|
| `get_posts`, `create_post`, `publish_post` | Posts |
| `get_menu`, `create_menu`, `rename_menu`, `rename_menu_section`, `delete_menu_section`, `add_menu_items_batch`, `sync_menu_items`, `add_menu_item`, `update_menu_item`, `delete_menu_item`, `delete_menu` | Menus |
| `get_locations`, `create_location`, `update_location`, `delete_location` | Locations |
| `get_reviews`, `reply_to_review` | Reviews (read + owner reply — manual create/update/delete tools removed per deprecation decision) |
| `get_location_media`, `delete_media_asset`, `generate_image` | Media / AI |
| `get_location_qa`, `add_qa`, `delete_qa` | Q&A |
| `get_contact_submissions`, `get_reservation_submissions` | Submission triage |
| `get_site_content_page`, `save_site_content_field`, `publish_site_content_page`, `discard_site_content_page`, `delete_site_content_field` | Site content lifecycle |
| `get_site_stats` | Analytics |
| `update_site_social` | Site config (calls `setConfig` utility) |
| `list_site_languages`, `save_site_language`, `delete_site_language` | Locales |
| `estimate_site_translation`, `start_site_translation_job`, `list_translation_jobs`, `get_translation_job`, `run_translation_job_batch`, `publish_site_translations` | Translations |
| `list_experiences`, `create_experience`, `update_experience`, `delete_experience`, `list_experience_bookings`, `update_experience_booking_status` | Experiences |
| `create_work_request` | Managed service queue |

### Workflow utility — intentional orchestration with no direct CRUD route equivalent

These tools are correctly scoped to their domain but perform workflow operations that span multiple steps or proxy external APIs. Appropriate to keep as workflow helpers.

| Tool | Behavior |
|---|---|
| `lookup_maps_url` | Proxies Google Places API; backs the location maps-URL workflow |
| `import_menu_from_pending_media` | Extracts menu data from a pending media asset; multi-step workflow |
| `resolve_pending_media` | Confirms a pending media upload and links the asset |

### Private SQL — raw `UPDATE` statements bypassing both routes and domain utilities

These tools run direct SQL against the `sites` table instead of calling the settings route or any named utility. They are Phase 4 migration targets.

| Tool | SQL statement | Gap |
|---|---|---|
| `publish_menu` | `UPDATE menus SET status = 'published'` | Should call `PATCH /editor/sites/[siteId]/menus/[menuId]` with `{status: 'published'}` |
| `rename_site` | `UPDATE sites SET brand_name = ?, subdomain = ?` | Calls `createSystemSubdomain` after, but still raw SQL; should call `PATCH /api/sites/[siteId]/settings` |
| `save_brand_description` | `UPDATE sites SET brand_description = ?` | No Cloudflare side effect so functionally equivalent, but bypasses route layer |
| `set_default_currency` | `UPDATE sites SET default_currency = ?` | No Cloudflare side effect so functionally equivalent, but bypasses route layer |

### Private logic — no canonical route exists for this domain

These tools manage a real user-facing domain that has no route equivalent. They are Phase 3 blockers (canonical route must be added first).

| Tool | Behavior | Gap |
|---|---|---|
| `get_reservation_policies` | Reads `site_content` and `site_content_drafts` via raw SQL | **Remove tool.** Reservation policies are a `site_content` field. Use `get_site_content_page` with `page: 'reservations'` instead. |
| `save_reservation_policies` | Calls `upsertSiteContent` (writes live) then clears draft — **bypasses draft/publish lifecycle** | **Remove tool.** Use `save_site_content_field` with `page: 'reservations', field: 'reservation_policies'` — this correctly goes through the draft lifecycle. |
| `delete_reservation_policies` | Calls `deleteSiteContentField` + `deleteDraftContentField` directly | **Remove tool.** Use `delete_site_content_field` once the content delete-field route exists (Phase 3). |

### Missing tool parity — canonical routes exist but no ChowBot tool

| Missing tool | Existing canonical route |
|---|---|
| update post | `PATCH /api/editor/sites/[siteId]/posts/[postId]` |
| delete post | `DELETE /api/editor/sites/[siteId]/posts/[postId]` |
| domain CRUD | `GET/POST /api/sites/[siteId]/domains`, `PATCH/DELETE /domains/[domainId]` |
| Facebook/Instagram publish | `POST /api/integrations/facebook-pages/publish` (managed_service-gated) |
| update notifications phone | `PATCH /api/editor/sites/[siteId]/notifications` |

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
- **ChowBot boundary violation**: `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` are ChowBot tools that write the platform's own blog/docs/static content. These are in the same tenant-session ChowBot tool list as `get_menu` and `create_location`. Any future MCP export that copies ChowBot's current tool list will accidentally expose platform content editing to tenants.

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

- New-site generation is not vertical-aware. [server/utils/site-template.ts](server/utils/site-template.ts) function signature is `seedNewSite(db, { organizationId, siteId, restaurantName })`. The parameter name signals the bias; the seeded content confirms it: a menu with Starter/Mains/Desserts/Drinks sections, Q&A asking about reservations and vegetarian options, and site_content with "Come dine with us" and "Come hungry." — all regardless of vertical.
- That means "a user can build an entire site" is stronger today for restaurant sites than for non-restaurant verticals unless onboarding/import/fixture tooling is used.
- Vertical-correct site bootstrapping should be treated as a top-level migration concern, not just marketing copy cleanup.

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

| Operation | Route |
|---|---|
| Read | `GET /editor/sites/[siteId]/content/[page]` |
| Draft | `POST /editor/sites/[siteId]/content/draft` |
| Publish | `POST /editor/sites/[siteId]/content/publish` |
| Discard | `POST /editor/sites/[siteId]/content/discard` |
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
- **Google Business Profile API** (future Phase 3): returns all verified reviews for the owner's locations. The GBP OAuth integration already exists (`server/api/integrations/google-business/...`). Adding review sync to the existing GBP locations sync flow is a natural extension. This gives complete review coverage, not just highlights. Treat as a Phase 3 enhancement.

#### Facebook reviews: not viable

Facebook deprecated their ratings/recommendations API in April 2020. The current Facebook sync only pulls page info and posts — there is no Facebook reviews endpoint to call. Do not design for Facebook as a reviews source.

#### Owner reply push-back to Google

The GBP API supports `POST accounts/{account}/locations/{location}/reviews/{review}/reply` to post owner replies back to Google. This is intentionally out of scope for Phase 3. Replies stored locally in `owner_reply` are sufficient for displaying on the tenant site. Google push-back is a future enhancement once GBP review sync is in place.

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

**Do:** Move the logic from [server/api/dashboard/restaurant.post.ts](server/api/dashboard/restaurant.post.ts) into `server/api/sites/index.post.ts` and make the dashboard route a thin proxy to it.

The handler **does not** take `organizationId` as input — it creates or finds the org for the authenticated user as part of the same flow. The request signature is `{ name, subdomain, vertical }`. Org creation, member assignment, site record creation, `seedNewSite`, and `createSystemSubdomain` all remain part of this single handler, because they are semantically a single atomic operation for the user.

Key things to preserve from the existing handler during the move:
- Idempotency: existing active site returns early with site ID; pending/failed site resumes rather than duplicating
- Subdomain uniqueness check scoped to other orgs
- org update only if user is owner AND no sites exist yet
- `onboarding_status = 'pending'` → seed → `'active'` lifecycle with `'failed'` on error

`vertical` is a required parameter — one of `restaurant | experience | retail | wellness | service`. Do not default to `restaurant` if omitted; fail with 400 and require the caller to provide it. The existing handler's `restaurantName` parameter becomes `name`.

---

### Decision: New-site template must be vertical-aware

**Do:** Extend `seedNewSite` in [server/utils/site-template.ts](server/utils/site-template.ts) to accept `vertical` and select seed content from a vertical content registry. The registry extends [utils/vertical-copy.ts](utils/vertical-copy.ts) and provides per-vertical defaults for: menu sections, Q&A topics, and `site_content` copy.

The restaurant defaults remain as-is. Every other vertical must have its own defaults — no vertical should receive "Come dine with us," "Reserve a table," "Come hungry," or any other restaurant-specific copy. The Pottery House incident is the canonical proof that vertical-incorrect seed copy is a product integrity failure, not just a copy issue.

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
- `new-site template` restaurant-biased → **Decision: extend to vertical-aware registry**
- `publish_menu` direct SQL → **Decision: migrate to PATCH route in Phase 4**
- `rename_site`, `save_brand_description`, `set_default_currency` direct SQL → **Decision: migrate to settings route in Phase 4**
- `domains` tool parity gap → **Decision: domains are not a chat/MCP surface — permanently resolved**
- `Facebook/Instagram` tool parity gap → **Decision: MCP Phase 5 only, not ChowBot**
- `notifications` tool gap → **Decision: stays in admin shell**
- `post update/delete` tool parity gap → **Decision: add in Phase 4**

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

### Phase 1: Fix the active security bug and route shadow (do immediately)

- ~~Fix `discardAllDrafts` in `discard.post.ts` to scope deletes to `organization_id` + `siteId`.~~ **Done.**
- ~~Fix `publishAllDrafts` to accept org/site scope parameters, then wire it into `publish.post.ts` for the `all` case.~~ **Done.**
- ~~Delete `qa.[id].patch.ts` — the directory-based `qa/[qaId].patch.ts` is the correct handler.~~ **Done.**
- ~~Remove `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` from the ChowBot tenant tool list and their `executeTool` case handlers — these are platform-admin operations and must never appear in tenant tool bundles or future MCP exports.~~ **Done.**

### Phase 2: Finish the audit and lock canonical contracts **Done.**

- ~~Freeze this doc as the source of truth for the transition.~~ **Done.**
- ~~For each required domain, confirm whether the route family above is the long-term canonical contract or whether a replacement route is needed.~~ **Done — domain audit matrix updated for all domains.**
- ~~Complete the unaudited domains: `staff_profiles`, `awards_recognition`.~~ **Done — audited. Both utilities are dead code: no editor routes, no ChowBot tools, zero callers in `server/`. Tables and utilities exist; domain is completely unreachable at runtime.**
- ~~Explicitly mark which current ChowBot actions are backed by canonical routes, shared domain utilities, or ChowBot-only private logic (direct SQL).~~ **Done — see ChowBot Tool Classification section above.**
- ~~Explicitly separate admin routes into tenant-domain support, platform-content, and internal team/security operations.~~ **Done — see Admin Route Classification section above.**
- Transfer workflows, billing/entitlement-gated features, and seed/import/verify systems are documented in the Platform-Level Systems section and remain accurate; no changes needed.

### Phase 3: Close the highest-risk API gaps

Each item below has a resolved architectural decision — see the Architectural Decisions section for the rationale.

1. **Add `POST /api/sites` with required `vertical` parameter.** Make `dashboard/restaurant.post.ts` a thin wrapper. Fail explicitly if vertical is omitted — no implicit restaurant default.

2. **Add `POST /editor/sites/[siteId]/content/delete-field`.** Accepts `{ page, field, location_id? }`. Auth: `owner | admin | editor`. This closes the only remaining gap in the content lifecycle and eliminates the need for the three reservation-policy ChowBot tools.

3. **Fix `GET /editor/sites/[siteId]/content/[page]` to allow `owner | admin | editor`.** Editors can draft and discard; they must be able to read.

4. **Remove `get_reservation_policies`, `save_reservation_policies`, `delete_reservation_policies` from ChowBot** after the content delete-field route is deployed. Document in tool system prompt that reservation policies are managed via `get_site_content_page` / `save_site_content_field` / `delete_site_content_field` with `page: 'reservations'`.

5. **Deprecate the manual review system:**
   - Delete `POST /api/sites/[siteId]/locations/[locationId]/reviews` (create)
   - Delete `PATCH /api/sites/[siteId]/locations/[locationId]/reviews/[reviewId]` (edit data)
   - Delete `DELETE /api/sites/[siteId]/locations/[locationId]/reviews/[reviewId]` (delete)
   - Remove `create_review`, `update_review`, `delete_review` ChowBot tools
   - Remove the 3 template review seeds from `seedNewSite` in [server/utils/site-template.ts](server/utils/site-template.ts)
   - Keep: `GET` read route, editor reply route, `get_reviews` and `reply_to_review` tools
   - Fix the editor reply route auth: replace raw inline JOIN with a `requireSiteAccess` helper

6. **Add Google Business Profile review sync** to the existing GBP locations sync flow. The GBP OAuth and location sync infrastructure already exists. Extend it to also pull all verified reviews per location and upsert them with `source = 'google_business'`. This gives complete review coverage beyond the top-5 highlights that Google Places API returns.

7. **Extend `seedNewSite` to accept `vertical` and select from a vertical content registry.** Every supported vertical must have its own menu sections, Q&A topics, and `site_content` copy. No vertical receives restaurant-oriented defaults.

8. **Drop `staff_profiles` and `awards_recognition` tables.** New migration. Delete the six utilities in `content-management.ts`.

9. **Document media as a first-class workflow contract** (upload/request-upload/confirm/generate). No new routes needed; the existing routes are correct. The contract needs to be written as a reference so MCP tool definitions can describe the workflow without inventing their own.

### Phase 4: Bring ChowBot onto the canonical surface

**Pre-condition:** Phase 3 complete and deployed. `tsc --noEmit` clean.

**Implementation pattern:** ChowBot tool handlers call shared utility functions directly — never via `$fetch` or internal HTTP calls. The Nuxt typed `$fetch` system triggers "Excessive stack depth" errors when called with `method: 'POST'` from a server handler (discovered in Phase 3 when first attempting to proxy the site creation route). Use the same utility-extraction pattern established in Phase 3 (`server/utils/site-creation.ts`).

#### 4.1 Migrate `publish_menu` off raw SQL

`publish_menu` currently runs:
```sql
UPDATE menus SET status = 'published', updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ?
```
The canonical utility `updateMenu()` in `server/utils/menu-management.ts` already supports `{ status: 'published' }` — it is the same function `PATCH /editor/sites/[siteId]/menus/[menuId]` calls.

**Change:** In the `publish_menu` case handler, replace the raw `db.prepare(UPDATE menus ...)` call with:
```ts
const menu = await updateMenu(db, orgId, siteId, input.menu_id, { status: 'published' }, userId)
if (!menu) return { error: 'Menu not found or access denied.' }
return { menu_id: input.menu_id, status: 'published' }
```
`updateMenu` is already imported at the top of `chowbot-agent.ts`. No new imports or route changes needed.

#### 4.2 Fix the settings route rollback gap, then migrate `rename_site`, `save_brand_description`, `set_default_currency`

**Step A — Fix `settings.patch.ts` rollback gap (required before migrating any tool).**

`server/api/sites/[siteId]/settings.patch.ts` currently executes the `UPDATE sites` SQL (around line 228), then calls `createSystemSubdomain` if `brand_name` changed (around line 243). There is no rollback: if `createSystemSubdomain` throws, the outer `catch` at line ~304 returns a 500 but the DB already has the new `brand_name` and `subdomain` — the site is left in an inconsistent state.

Fix: After the `UPDATE sites` succeeds and before calling `createSystemSubdomain`, capture `prev = { brand_name: site.brand_name, subdomain: site.subdomain }` from the `site` object fetched at line ~47. Wrap `createSystemSubdomain` in a try-catch:
- On failure, attempt a rollback `UPDATE sites SET brand_name = ?, subdomain = ?` in its own inner try-catch.
  - If rollback succeeds: return 400 `"Failed to register subdomain with Cloudflare. The rename was not applied."`
  - If rollback also fails: log both errors, return 400 `"Rename was applied but subdomain registration with Cloudflare failed. Please contact support."`

This mirrors the pattern already in the `rename_site` ChowBot tool handler (fixed in the Phase 3 bug-fix session).

**Step B — Extract a shared site-settings utility.**

Create `server/utils/site-settings.ts` exporting `updateSiteSettingsFields(db, env, siteId, organizationId, updates, userId)`. Move the field-update logic out of the route handler into this utility. Both `settings.patch.ts` and the ChowBot tool handlers call this function directly. The function signature matches the `UpdateSiteSettingsRequest` fields: `brand_name`, `brand_description`, `default_currency` at minimum; include any other fields the current route handler supports.

The utility returns a typed result (same `SiteCreationResult`-style pattern: `{ status: number; data: Record<string, unknown> }`) so callers can re-map for their response format without an HTTP round-trip.

**Step C — Migrate the three ChowBot tools.**

Replace raw SQL in each case handler with a call to `updateSiteSettingsFields`:

- `rename_site`: call `updateSiteSettingsFields(db, env, siteId, orgId, { brand_name: input.brand_name }, userId)`. Remove the `MAX_SLUG_ATTEMPTS` loop — the utility handles the unique-subdomain check via the same pattern the route uses. Handle conflict (status 400/409) and Cloudflare failure return values from the utility.
- `save_brand_description`: call `updateSiteSettingsFields(db, env, siteId, orgId, { brand_description: description }, userId)`.
- `set_default_currency`: call `updateSiteSettingsFields(db, env, siteId, orgId, { default_currency: currency }, userId)`. Keep the existing `SUPPORTED_CURRENCIES` validation in the tool handler before calling the utility (fail fast, same as today).

Do all three ChowBot tool migrations in a single PR after Step A and Step B are complete and verified.

#### 4.3 Add `update_post` and `delete_post` ChowBot tools

Both routes and utilities exist. `updatePost` and `deletePost` are exported from `server/utils/post-management.ts` (lines 141 and 210). Add them to the existing import at the top of `chowbot-agent.ts`.

**Add to `TOOLS` array** (immediately after the `publish_post` tool definition):
```ts
{
  name: "update_post",
  description: "Update a draft or published post — title, body, image, location, type, CTA, or event/offer fields. Does not change publish status.",
  input_schema: {
    type: "object",
    properties: {
      post_id: { type: "string", description: "ID of the post to update." },
      title: { type: "string", description: "New headline (max 80 chars). Omit to leave unchanged." },
      body: { type: "string", description: "New post body (max 400 chars). Omit to leave unchanged." },
      image_asset_id: { type: "string", description: "New media asset ID. Omit to leave unchanged." },
      location_id: { type: "string", description: "Reassign to a location. Omit to leave unchanged." },
      post_type: { type: "string", enum: ["standard", "offer", "event", "update"] },
      cta_type: { type: "string", enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"] },
      cta_url: { type: "string" },
      event_title: { type: "string" },
      event_start: { type: "string", description: "ISO datetime string." },
      event_end: { type: "string", description: "ISO datetime string." },
      offer_coupon: { type: "string" },
      offer_terms: { type: "string" },
    },
    required: ["post_id"],
  },
},
{
  name: "delete_post",
  description: "Permanently delete a post. Confirm with user first.",
  input_schema: {
    type: "object",
    properties: {
      post_id: { type: "string", description: "ID of the post to delete." },
    },
    required: ["post_id"],
  },
},
```

**Add `"delete_post"` to `CONFIRM_REQUIRED`** (next to `"publish_post"`).

**Add to `executeTool` switch** (immediately after the `publish_post` case):
```ts
case "update_post": {
  const post = await updatePost(db, orgId, siteId, input.post_id, {
    title: input.title, body: input.body, image_asset_id: input.image_asset_id,
    location_id: input.location_id, post_type: input.post_type,
    cta_type: input.cta_type, cta_url: input.cta_url,
    event_title: input.event_title, event_start: input.event_start,
    event_end: input.event_end, offer_coupon: input.offer_coupon,
    offer_terms: input.offer_terms,
  }, userId)
  if (!post) return { error: "Post not found." }
  return { id: post.id, title: post.title, body: post.body, status: post.status, updated: true }
}

case "delete_post": {
  await deletePost(db, orgId, siteId, input.post_id)
  return { post_id: input.post_id, deleted: true }
}
```

Note: `delete_post` in ChowBot does not need an additional owner/admin role check — ChowBot already operates fully scoped to the authenticated org+site. The `CONFIRM_REQUIRED` gate handles intent confirmation.

Also update the system prompt: add `delete_post` to the confirm-first list (the same line that mentions `delete_menu`, `delete_menu_item`, etc.).

#### 4.4 Verify no remaining private SQL

After 4.1 and 4.2 are complete, audit every `case` in `executeTool`. The verification command:
```bash
grep -n "db\.prepare.*UPDATE\|db\.prepare.*DELETE" server/utils/chowbot-agent.ts
```
This must return zero results inside the `switch` block. The only acceptable `db.prepare` calls in ChowBot tool handlers are read-only `SELECT` queries used to look up IDs before calling a utility. Any write SQL remaining after Phase 4 is a bug.

#### 4.5 Post-Phase 4 state

ChowBot is now a pure client of the same domain utilities the canonical routes use. No business logic exists solely in ChowBot tool handlers. Any future MCP tool that wraps the same utilities shares behavior with ChowBot without duplication. Phase 5 (MCP tool contracts) can proceed from this clean baseline.

4. ~~Remove `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` from ChowBot.~~ **Done in Phase 1.**

### Phase 5: Expose MCP-safe tool contracts

- Define MCP tools only for domains that have reached canonical contract status.
- Keep destructive actions confirm-gated.
- Prefer coarse, business-level tools over thin table-row tools.
- Start with the strongest domains first:
  - locations
  - posts
  - experiences
  - locales/translations
  - domains after tool parity exists
- Keep billing, transfer acceptance, Facebook/Instagram, and destructive admin-global operations out of early public MCP unless a deliberate trust/safety design exists.

### Phase 6: Protect the migration with fixtures and tests

- Expand typed fixtures and regression scripts when new canonical contracts are introduced.
- Keep experience-vertical and restaurant-vertical verification in the suite.
- Keep transfer, billing-entitlement, and notification-record coverage in the suite.
- Add regression coverage for any fixed high-risk bug, especially:
  - scoped draft discard (security fix — **fixed, needs regression test**: verify `DELETE FROM site_content_drafts` cannot affect a different org's drafts)
  - scoped publish all (501 fix — **fixed, needs regression test**: verify `publish all` returns 200 and publishes only the requesting org+site's drafts)
  - ~~QA route shadow removal~~ **Done.**
  - content delete-field route (Phase 3)
  - reservation policy tools removed — verify `get_site_content_page` returns reservation policies correctly via the content system (Phase 3)
  - review contract consolidated under editor (Phase 3)
  - vertical-correct site bootstrap (Phase 3) — new fixture or extension to pottery-house spec covering at least one non-restaurant vertical
  - ChowBot settings bypass migration — after Phase 4, verify `rename_site` calls settings route and that the rollback path is covered
  - transfer + domain restoration interactions

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
