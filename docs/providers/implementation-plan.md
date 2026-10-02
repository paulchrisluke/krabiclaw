# Provider support v1 — prerequisite and domain plan

Prepared 2026-10-02 in an isolated Mac checkout. This is a plan, not an implemented provider feature or release qualification.

## Verified integration baseline

Remote heads fetched and verified:

| Dependency | Head |
| --- | --- |
| staging | `9e8ac75cb22b9aca497ef45c024ca1cd992731f5` |
| Payments #1213 | `d5b90a3347ce416a5b0c937bfcc90f19fb90b761` |
| Foundation #1211 | `0e002e4d26c077e2415a40856844991b4eefde3f` |
| Cleanup #1218 | `4c2cc9a6133ca0482405a6af20f823ac1dc4d5b2` |
| MCP #1209 | `61f4ada75e361ef4fe839c05d7a3c531cd074c15` |
| Calendar #1210 | `4a8df9e82b525a2dfb619c36aac94b82ccf1d259` |

MCP and Calendar heads are ancestors of Payments. The new local branch starts from Payments. Two final Foundation commits (`d6beb2af3`, `0e002e4d2`) and three Cleanup commits (`a15f5b066`, `ce4399904`, `4c2cc9a61`) have been integrated into this branch. Cleanup metadata conflicts retained the newer Payments descriptions, booking/payment tools and Foundation source-page binding; most of a15f5b066 was already incorporated by Payments. No other checkout or branch was modified.

Foundation is now preparing a further approved compact timezone selector and chevron alignment successor in #1211. Await its exact final head before the final prerequisite integration pass. Do not duplicate those UI edits. No rebase cascade is needed: apply only the final successor diff to this isolated feature branch, then one implementation/review/CI batch. Preserve migration files/snapshots 0000–0006. Generate the next unshipped migration from the canonical Drizzle schema; inspect generated rebuilds and use additive D1 expansion where a referenced parent rebuild could erase history. Cleanup's schema-contraction deployment hold remains independent.

Read contracts: AGENTS.md; docs/consultations.md; docs/integrations/google-calendar.md; docs/local-development.md; docs/testing-strategy.md; docs/operations/release-and-outage-prevention.md. The primary checkout's ignored .agents/skills contains only ai-seo, which does not apply to this scheduling implementation.

## Minimal identity and persistence contract

Identity is the existing Better Auth organization `member.id`, with its organization and user relationship. Do not introduce provider identities or enable an independent Team identity model. The inspected schema has `member`, but no configured Better Auth Team tables; roles and tenant-wide dashboard/MCP access currently accept only owner/admin.

1. Extend `product_booking_configs` with explicit `scheduling_mode` (legacy/provider) and nullable `assigned_member_id`. Default legacy preserves current behavior. One assigned member per Product; no provider pool, picker or round robin. Organization fallback remains explicit when no member is assigned.
2. Store member domain settings scoped to existing membership: IANA timezone, recurring weekly working windows, dated time off, separately approved public display name/photo/bio. A member may edit their own schedule; owner/admin oversight and public-profile approval use the shared Better Auth permission matrix. Never derive public profile from private user/member email, image or other fields.
3. Persist `assigned_member_id` on operational Booking and checkout hold through their guarded claim/move/capture SQL. Persist Session-level assignment as the occurrence commitment so every participant in one group Session meets the same person. Preserve operational Booking IDs, old assignment and actor in the existing activity ledger.
4. Domain-only Google selection/cache stores member, Better Auth linked account ID, selected calendar IDs, selection revision, covered UTC horizon, last successful check, readable failure and busy intervals. No tokens, provider identity duplication, event titles or attendees.

Membership removal must not cascade away historical assignment. Use retained IDs/history with nullable live membership references or an explicit refusal while future commitments remain; verify against Better Auth's deletion hooks. This requires inspection of installed Better Auth 1.7.4 before choosing the smallest supported hook.

## Canonical allocator

Extend `sessionAllocationPredicate`, `sessionClaimQuery`, `sessionMoveQuery` and `listSessions` in server/utils/availability.ts. Payment checkout inserts its hold using this predicate; authenticated capture in server/domain/payments/events.ts uses sessionClaimQuery. Do not add a second overlap policy.

For provider-backed Sessions, intersect offering-generated Session facts with the assigned member's working windows, time off and fresh selected busy-calendar coverage. UTC intervals are half open. Provider occupancy is grouped by distinct Session identity across that member's Products. Active pending/confirmed Bookings and unexpired holds reserve occupancy. Multiple attendee Bookings/holds for the SAME Session only consume its existing capacity; they must not conflict with each other. Different overlapping Sessions/services conflict; adjacency succeeds. Consultations retain one appointment per configured Session.

Explicit provider mode bypasses the legacy organization calendar_group overlap guard for named member allocation, without overwriting calendar_group (still used for outbound projection). Legacy/null-member organization scheduling retains its established guard. Do not reinterpret capacity=1 as a tenant-wide provider limit.

Claim SQL selects and stores assignment in the same statement/batch that takes capacity. Capture preserves the hold's pinned assignment even if offering assignment changed, excluding only that authenticated hold. Changes to hours or Product assignment do not rewrite existing Bookings, holds or committed Session assignments. New uncommitted occurrences follow the new offering configuration. A group Session with an existing commitment retains that assignment for later attendees.

Hours are expressed in the member's IANA timezone, using repository timezone conversion with explicit DST handling. If materialized UTC working intervals are needed for atomic SQL, they are a derived, revision-fenced rolling horizon from canonical recurring rules; stale/missing horizon fails closed and is visibly regenerated by the existing bounded scheduling task. Time off remains an interval exclusion, never an edit to existing appointment facts.

Safe migration must not infer providers for historical/unassigned appointments. Default legacy. Explicit provider activation must refuse unresolved future legacy commitments or require the administrator to explicitly assign them through the canonical guarded operation. No production activation or historical backfill is authorized here.

## Moves, reassignment and parity

Extend the existing canonical booking-change operation and its immutable proposal/audit payload rather than creating an independent move flow. Preserve Booking IDs, review/payment identity, optimistic version and dedupe semantics. The accepted move must atomically validate target eligibility, working hours, exceptions, fresh busy coverage and overlap, then emit the existing lifecycle effects.

Proposed safe group policy for parent coordination: reassignment applies to the whole provider-led Session, preserving each participant Booking ID and recording each old/new assignment. Refuse individual participant reassignment in a shared Session. Refuse group reassignment while an unexpired checkout hold pins the previous assignment; do not silently rewrite a paid checkout promise. Target must be the Product's current eligible assigned member. This implements one-member eligibility without adding provider pools.

Shared domain writers resolve and permission-check Better Auth membership themselves. CMS and MCP must call those exact writers. Extend existing Product config and booking read/change schemas for provider fields/filtering. Only member schedule/profile operations without a current counterpart warrant a small new tool surface. Existing owner/admin tenant tools remain unchanged; an ordinary member gets only own scheduling/profile/calendar scope, never access to tenant-wide guest data, billing or member administration. Invitation, dashboard navigation/context and MCP discovery must enforce the same narrow role capability.

CMS: Team row opens member public profile/hours/time off/Calendar status; Product editor selects its assigned member and explicit scheduling mode; Booking detail/list displays canonical assignment, filter and guarded reassignment. Public section is exactly `Who you’ll meet with`: tenant organization by default, named member using approved public fields when assigned. Keep existing service URLs, shared experience gallery/layout and native/external mode switch.

## Google busy input

Use Better Auth linked accounts and `linkedAccountAccessToken` for account selection, encrypted storage, expiry/refresh and unlink lifecycle. Use the existing useLinkedAccounts incremental consent UI; do not grant access or connect a live account during implementation.

Google's freebusy.query supports `calendar.events.freebusy`; calendar selection additionally needs `calendar.calendarlist.readonly`. Retrieve only free/busy intervals and calendar identities, with bounded time range/calendar count and errors checked per selected calendar. Keep selected input calendars separate from the organization's outbound calendar; refuse overlap at both input and output selection writers. Do not subtract undifferentiated busy blocks to compensate for managed booking events.

No connection/selection means internal scheduling. A selected account/calendar that is disconnected, failed or stale fails closed for that member only. SQL claim checks matching revision, horizon and bounded successful-check freshness. Recheck before checkout/move/capture as appropriate, with D1 guards checking cache validity at commit. Google/D1 cannot be atomic: persist visible later-conflict state and show it in Team/Booking surfaces; never silently cancel. The existing outbound durable retry remains independent and never undoes Bookings. Input failure and its retry outcome must be visible.

Primary references:
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- https://better-auth.com/docs/concepts/oauth
- https://better-auth.com/docs/plugins/organization

## One proportional proof batch

Use exact repository Node 24.18.1, canonical migration generation/setup, local D1 and production Worker. Separate local ports from other checkouts. Add real D1 tests for the named invariants and one focused browser/MCP journey; do not substitute mocked allocator/auth modules.

- Concurrent overlapping distinct services on one member: only one Session claimed; healthy other member can claim. Adjacent intervals pass.
- Same class Session: multiple attendees and holds succeed up to combined canonical capacity; another overlapping Session fails. Restaurant allocator remains unchanged.
- Hold conversion preserves pinned provider and quantity; authenticated own-hold exclusion only; expired/unfulfillable capture follows existing durable recovery.
- Member timezone/DST, hours and time off intersect offering rules; edits leave existing Booking facts unchanged.
- Cross-tenant/self/owner/admin permission boundaries; ordinary member cannot access tenant tools. CMS write read back through MCP and reverse.
- No Google selection allows internal booking; selected stale/disconnected/error blocks only that member; later busy conflict is visible without cancellation.
- Legacy/org fallback behavior, explicit activation safeguards and stable IDs/history on accepted move/reassignment.
- Public profile has exact section label and approved fields only; CMS Team/Product/Booking desktop/mobile screenshots. Existing service URL/gallery/native/external flows survive.

After the focused runtime proof, run the repository required quality, D1, migration, MCP/catalog/submission and full local E2E checks once as the release batch. One review against the final consolidated diff and one draft PR targeting staging. Report exact PR/head, screenshots, CI and any unresolved external-consent verification. No deployment, remote DDL, financial actions, credentials or paid-tier changes.

## Coordination status

Parent-thread message submission was attempted twice and returned `An earlier turn submission is not yet confirmed`; delivery of the pre-commitment schema/contracts plan is therefore unconfirmed. This document and the task's final response are the reviewable handoff. Large provider implementation has not started pending delivery/coordination and Foundation's final UI successor.
