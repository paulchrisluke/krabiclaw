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
| Site settings | `GET/PATCH /api/sites/[siteId]/settings` | `ready` for read/update, no delete expected | setup progress via `GET /api/sites/[siteId]/setup-progress` | session + org owner/admin role | ChowBot can rename site, set currency, update socials, save brand description — but `rename_site`, `save_brand_description`, and `set_default_currency` run direct `UPDATE sites` SQL rather than calling the settings PATCH route, bypassing subdomain registration and other side effects | usable now | settings writes are inconsistently split: social/config fields use `setConfig` consistently with the settings route; core site row fields (brand_name, default_currency, brand_description) are mutated directly by ChowBot without triggering Cloudflare subdomain re-registration; should be consolidated so ChowBot calls the canonical settings PATCH |
| Locations | `GET/POST /api/sites/[siteId]/locations`, `GET/PATCH/DELETE /api/sites/[siteId]/locations/[locationId]` | `ready` | Google Business auth/index routes, maps lookup lives in ChowBot utility path | session + org member role; stricter location checks where needed | full create/update/delete coverage | usable now | low-risk candidate for MCP-first exposure; document Google Maps lookup as workflow helper rather than core CRUD |
| Menus / items / sections | `GET/POST /api/editor/sites/[siteId]/menus`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/menus/[menuId]`, item and section subroutes | `ready` including publish | publish via `PATCH /menus/[menuId]` with `{status: 'published'}` — `UpdateMenuRequest.status` is supported and implemented in `menu-management.ts:483`; reorder via `/reorder` | session + site member role | broad tool coverage including create/update/delete/sync and `publish_menu` | usable now | `publish_menu` in ChowBot runs raw SQL directly rather than calling the PATCH route — this is a cleanup task, not a missing capability; no route work needed here |
| Posts | `GET/POST /api/editor/sites/[siteId]/posts`, `GET/PATCH/DELETE /api/editor/sites/[siteId]/posts/[postId]`, `POST /publish` | `ready` | publish to site/social channels | session + site member role; publish tighter than edit | tools expose get/create/publish only | `duplicated/split across route families` | ChowBot lacks explicit update/delete tools even though canonical routes exist; tool/API parity gap should be closed before MCP |
| Reviews / replies | `GET/POST /api/sites/[siteId]/locations/[locationId]/reviews`, `PATCH/DELETE /api/sites/[siteId]/locations/[locationId]/reviews/[reviewId]`, `PATCH /api/editor/sites/[siteId]/reviews/[reviewId]` | `ready` but split | owner reply / moderation status | session + site member role; editor reply path is owner/admin only | get/create/update/delete/reply tools exist | `duplicated/split across route families` | review editing is split between location routes and site-level editor moderation route; canonical review contract should be unified |
| Media | `GET /api/editor/sites/[siteId]/media`, `PATCH/DELETE /api/editor/sites/[siteId]/media/[assetId]`, upload/request-upload/confirm routes | `missing CRUD` | upload, confirm, AI image generation, menu extraction | session + site member role | list/delete/generate/import from media supported | blocked | no canonical `GET /media/[assetId]`; create is workflow-based rather than record-based; MCP needs a documented media workflow contract, not just raw CRUD semantics |
| Q&A | `GET/POST /api/editor/sites/[siteId]/locations/[locationId]/qa`, `PATCH/DELETE` item routes, `POST /reorder` | `ready` | reorder | session + location/site member role | get/add/delete tools exist | usable now | **route shadow**: `qa.[id].patch.ts` (flat file, old routing style, no org membership check) and `qa/[qaId].patch.ts` (directory style, proper auth) both resolve to `PATCH /qa/:id`; the flat file must be deleted — it is either dead or shadowing the secure route |
| Reservation policies | no canonical API route | `missing entirely` | none | no route exists | `get_reservation_policies`, `save_reservation_policies`, `delete_reservation_policies` tools exist | blocked | three ChowBot tools manage a real user-facing domain (reservation rules, hold times, cancellation policies); `save_reservation_policies` writes directly to `site_content` live, bypassing the draft/publish lifecycle; no canonical editor route exists for this domain at all |
| Site content | `GET /api/editor/sites/[siteId]/content/[page]`, `POST /draft`, `POST /publish`, `POST /discard`, `GET /status` | `missing CRUD` | draft, publish, discard | session + site member role, but inconsistent by action | get/save/publish/discard/delete-field tools | blocked | route family is workflow-centric, not CRUD-centric; field deletion exists in ChowBot logic but not as canonical editor route; `GET content` is owner-only while draft/discard allow editor/admin; `publish all` returns `501` (route is wrong — `publishAllDrafts` utility is fully implemented at `content-management.ts:448`); `discard all` is an **active multi-tenant security bug** (see findings below) |
| Locales / translations | `GET/POST /api/editor/sites/[siteId]/locales`, `PATCH/DELETE /locales/[locale]`, translation inventory/job/review/publish routes | locales `ready`; translations are workflow APIs | estimate, queue, run batch, review, publish | session + site member role | strong tool coverage | usable with care | locale CRUD is good; translation lifecycle is intentionally workflow-heavy and should remain so, but must be documented as canonical workflow rather than missing CRUD |
| Experiences / bookings | `GET/POST /api/editor/sites/[siteId]/experiences`, `PATCH/DELETE /experiences/[experienceId]`, bookings get/patch | `ready` | guest booking management | session + site member role | create/update/delete/list booking tools exist | usable now | strong candidate for MCP exposure with existing route family |
| Domains | `GET/POST /api/sites/[siteId]/domains`, `PATCH/DELETE /domains/[domainId]`, `POST /sync` | `ready` | DNS sync and lifecycle notifications | session + owner/admin; paid-plan entitlement | no ChowBot tool surface today | blocked by tool gap | canonical API exists; ChowBot and future MCP tool definitions need to be added if domains are in scope for chat surfaces |
| Facebook / Instagram integration | `server/api/integrations/facebook-pages/` (auth, callback, pages, publish, sync) | `ready` for OAuth + publish flow | publish post to Facebook page, sync | session + owner/admin; `managed_service` entitlement enforced at route level | no ChowBot tool surface today | blocked by tool gap | fully implemented and entitlement-gated; ChowBot has no tools for Facebook publish despite the route existing; `managed_service` boundary must be preserved when any tool layer is added |
| Google Business integration | `server/api/integrations/google-business/` (auth, callback, accounts, locations.sync), `server/api/sites/[siteId]/locations/[locationId]/integrations/google-business/` | `ready` for OAuth + sync | sync GBP location data | session + owner/admin; `google_business` entitlement | location-level GBP auth surfaces in ChowBot | usable with care | entitlement enforcement must be preserved; canonicalize the two route families (site-level integration vs location-level GBP auth) |
| Notifications | `GET/PATCH /api/editor/sites/[siteId]/notifications` | `missing CRUD` | update WhatsApp notification phone | session + owner/admin | not clearly exposed as dedicated tool | blocked | this is a settings/workflow surface, not full CRUD; keep in residual admin shell unless a stronger chat use case emerges |
| Contact / reservation submission triage | `GET /contact-submissions`, `PATCH /contact-submissions/[submissionId]`, `GET /reservation-submissions`, `PATCH /reservation-submissions/[submissionId]`, public submission creation routes | `missing CRUD` by design | triage/status updates | session + site member role; public create is anonymous/site-facing | read tools exist | usable with care | should be modeled as workflow APIs, not forced into artificial CRUD expectations |
| AI conversations / sessions | `POST /api/ai/[siteId]/agent`, `GET/POST /conversations`, `GET/DELETE /conversations/[conversationId]`, credits/generate-image/enhance/menu-extract routes | `ready` for session lifecycle | agent run, credits, prompt/image helpers | session + site member role | primary ChowBot surface | usable now | keep as enabling infrastructure, not a substitute for canonical business-object APIs |
| Staff profiles / awards | no canonical API route confirmed | `unaudited` | none | no route confirmed | unknown | unknown | `content-management.ts` exports `getStaffProfiles`, `upsertStaffProfile`, `deleteStaffProfile`, `getAwardsRecognition`, `upsertAwardRecognition`, `deleteAwardRecognition`; these tables and utilities exist but no canonical editor API routes were found in the route inventory; needs an audit pass |

### Domains that already look strongest

- locations
- posts
- experiences/bookings
- domains
- locales

### Domains that are most likely to block CMS deprecation

- site creation / onboarding
- site content editing lifecycle (including the discard security bug and 501 publish all)
- reservation policies (entirely missing canonical route)
- media workflow normalization
- review contract consolidation
- ChowBot parity for posts and domains
- ChowBot settings bypass (rename_site, set_default_currency, save_brand_description writing direct SQL)

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

## Concrete Findings To Carry Into Implementation

These are not abstract architecture concerns; they are current repo truths verified against actual handler and utility files.

### High-priority blockers

- `discard all content drafts` is an **active multi-tenant security bug**.
  - [server/api/editor/sites/[siteId]/content/discard.post.ts](server/api/editor/sites/%5BsiteId%5D/content/discard.post.ts) verifies the calling user belongs to *some* site, then calls `discardAllDrafts(db)`.
  - [server/utils/content-management.ts:475](server/utils/content-management.ts#L475) executes `DELETE FROM site_content_drafts` with **no WHERE clause**.
  - Any authenticated member of any organization can wipe every other tenant's drafts right now by POSTing `{all: true}` to their own discard endpoint.
  - Fix: replace `discardAllDrafts(db)` in the route with `discardDrafts(db, site.organization_id, siteId, ...)` scoped to the verified site.

- `publish all content` returns 501 at the route level but the utility is fully implemented.
  - [server/api/editor/sites/[siteId]/content/publish.post.ts](server/api/editor/sites/%5BsiteId%5D/content/publish.post.ts) returns `501` for the `all` case.
  - [server/utils/content-management.ts:448](server/utils/content-management.ts#L448) exports `publishAllDrafts` which is a complete, correct implementation — but it also has no org/site scoping. Fix both the route wiring and add org/site scope to `publishAllDrafts`.

- `reservation policies` has no canonical API route at all.
  - ChowBot tools `get_reservation_policies`, `save_reservation_policies`, `delete_reservation_policies` manage a real user-facing domain (reservation rules, hold times, cancellation policies) with no route equivalent.
  - `save_reservation_policies` at [server/utils/chowbot-agent.ts:3426](server/utils/chowbot-agent.ts#L3426) writes directly to `site_content` live, bypassing the draft/publish lifecycle.
  - Fix: add canonical editor routes for reservation policy read/write/delete and migrate ChowBot tools to call them.

- `site content field deletion` is not exposed as a canonical editor route.
  - Deletion exists through `deleteSiteContentField` / `deleteDraftContentField` utility calls from ChowBot, but not through `server/api/editor/sites/...`.

- `site creation` is still dashboard-only.
  - [server/api/dashboard/restaurant.post.ts](server/api/dashboard/restaurant.post.ts) is the canonical create flow today, which is not where the long-term MCP-facing contract should live.

- `new-site template generation` is restaurant-biased.
  - [server/utils/site-template.ts](server/utils/site-template.ts) function signature is `seedNewSite(db, { organizationId, siteId, restaurantName })`. Seeded content — menu sections, Q&A topics, site_content copy — is all restaurant-oriented regardless of vertical.

- `ChowBot platform content tools` violate the tenant/admin boundary.
  - `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` give tenant ChowBot sessions the ability to edit platform-level blog/docs/static content. These must be removed from the tenant tool list before any MCP export.

- `QA route shadow` must be resolved before trusting QA auth.
  - [server/api/editor/sites/[siteId]/locations/[locationId]/qa.[id].patch.ts](server/api/editor/sites/%5BsiteId%5D/locations/%5BlocationId%5D/qa.%5Bid%5D.patch.ts) (flat file, no org membership check, no input validation, reads param `id`) and [server/api/editor/sites/[siteId]/locations/[locationId]/qa/[qaId].patch.ts](server/api/editor/sites/%5BsiteId%5D/locations/%5BlocationId%5D/qa/%5BqaId%5D.patch.ts) (directory style, proper org membership check, validated input, reads param `qaId`) both register as `PATCH /qa/:id`. Delete the flat file.

### Medium-priority contract inconsistencies

- `ChowBot rename_site / save_brand_description / set_default_currency bypass the settings route`.
  - These tools run direct `UPDATE sites` SQL at [server/utils/chowbot-agent.ts:3806](server/utils/chowbot-agent.ts#L3806), [3826](server/utils/chowbot-agent.ts#L3826), [3841](server/utils/chowbot-agent.ts#L3841).
  - The canonical settings PATCH calls `createSystemSubdomain` when brand_name changes. ChowBot bypasses this, meaning renames via ChowBot may not re-register the subdomain with Cloudflare.
  - `update_site_social` correctly uses `setConfig` consistent with the settings route — no divergence there.
  - Fix: migrate the three offending ChowBot tools to call `PATCH /api/sites/[siteId]/settings`.

- `site content` permission rules are inconsistent across actions.
  - `GET content` uses owner-only access.
  - `draft` and `discard` allow `owner`, `admin`, and `editor`.
  - `publish` is `owner`/`admin` only, which is reasonable, but the read/write split should be deliberate and documented.

- `reviews` are split across two route families.
  - CRUD for manual reviews sits under `server/api/sites/[siteId]/locations/[locationId]/reviews/...`.
  - owner reply / moderation lives under `server/api/editor/sites/[siteId]/reviews/[reviewId].patch.ts`.

- `posts` already have canonical update/delete routes, but ChowBot does not expose matching tools.
  - This is a parity gap, not a route gap.

- `domains` already have a solid canonical route family, but ChowBot has no tool layer for them.
  - This is again a parity gap, not an API gap.

- `Facebook/Instagram integration` routes are fully implemented and entitlement-gated, but ChowBot has no tools for them.
  - Parity gap, not an API gap. Managed-service entitlement must be enforced when tools are added.

- `plan and entitlement enforcement` is strong at API level, but not yet represented in a future MCP tool taxonomy.
  - Paid feature unlock behavior needs to be designed into the tool layer rather than bolted on later.

- `staff_profiles` and `awards_recognition` are unaudited.
  - `content-management.ts` exports full CRUD utilities for both. Whether canonical editor routes exist for these domains is unconfirmed. An audit pass is needed before claiming content management is complete.

- `site creation` and `vertical-correct bootstrapping` are currently split across runtime routes, template seeding, and onboarding/import tooling.
  - This means "build an entire site" still depends on more than one subsystem boundary.

### Domains that are healthier than they first appeared

- `locations` are already close to canonical CRUD.
- `experiences/bookings` are already close to canonical CRUD + workflow.
- `locales` have proper CRUD semantics; translations are correctly modeled as workflow operations.
- `domains` already have a strong route family and mostly need chat-surface adoption rather than route invention.
- `menus publish` is already available via `PATCH /menus/[menuId]` with `{status: 'published'}` — **this is not a blocker**. `UpdateMenuRequest.status` is typed and handled in `menu-management.ts:483`. ChowBot's `publish_menu` runs direct SQL instead of calling this route, which is a cleanup task, not a missing capability.

### Platform systems that are healthier than they first appeared

- transfer flows already have dedicated public/authenticated/admin route families and E2E coverage
- billing and feature unlocks are already modeled at the entitlement layer, including for Facebook/Instagram
- typed seed fixtures and verification scripts are already substantial and should be leaned on during migration
- platform blog/docs/static-content CRUD is already clearly separated from tenant site content
- Facebook/Instagram integration is fully implemented and correctly entitlement-gated; it only needs a ChowBot/MCP tool layer

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

Before any other migration work:

- Fix `discardAllDrafts` in `discard.post.ts` to scope deletes to `organization_id` + `siteId`.
- Fix `publishAllDrafts` to accept org/site scope parameters, then wire it into `publish.post.ts` for the `all` case.
- Delete `qa.[id].patch.ts` — the directory-based `qa/[qaId].patch.ts` is the correct handler.

### Phase 2: Finish the audit and lock canonical contracts

- Freeze this doc as the source of truth for the transition.
- For each required domain, confirm whether the route family above is the long-term canonical contract or whether a replacement route is needed.
- Complete the unaudited domains: `staff_profiles`, `awards_recognition`.
- Explicitly mark which current ChowBot actions are backed by:
  - canonical routes
  - shared domain utilities
  - ChowBot-only private logic (direct SQL)
- Add the same classification for:
  - admin-wide workflows
  - transfer workflows
  - billing/entitlement-gated features
  - seed/import/verify systems
- Explicitly separate admin routes into:
  - tenant-domain support operations
  - platform-content operations
  - internal team/security operations

### Phase 3: Close the highest-risk API gaps

- Introduce canonical site creation/update semantics outside dashboard-only flows.
- Add canonical editor routes for reservation policy read/write/delete.
- Add canonical content field deletion / content mutation semantics so content lifecycle is not partly route-based and partly ChowBot-private.
- Normalize review operations under one coherent contract.
- Document media as a first-class workflow contract for MCP, including upload/request/confirm/generate flows.
- Make new-site generation vertical-aware so the free build path is valid across supported verticals.
- Define the canonical site-creation pathway across runtime routes, template seed behavior, vertical defaults, and post-signup feature unlocks.

### Phase 4: Bring ChowBot onto the canonical surface

- Migrate `rename_site`, `save_brand_description`, `set_default_currency` to call `PATCH /api/sites/[siteId]/settings` rather than running direct SQL.
- Remove `get_platform_content_page`, `save_platform_content_page`, `delete_platform_content_page` from the tenant ChowBot tool list.
- Reduce other ChowBot-specific write behavior that bypasses canonical routes/services.
- Add missing tool parity for domains where canonical APIs already exist, especially:
  - post update/delete
  - domains
  - Facebook/Instagram publish (managed_service-gated)
  - notifications if kept in chat scope
- Preserve ChowBot as the branded web shell, but make it a client of the same domain layer that MCP will use.

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
  - scoped draft discard (security fix)
  - scoped publish all (501 fix)
  - QA route shadow removal
  - reservation policy canonical route
  - ChowBot settings bypass migration
  - content delete route
  - vertical-correct site bootstrap
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
