# Provider support v1 — prerequisite and domain plan

Prepared 2026-10-02 in an isolated Mac checkout. The implementation is on the isolated provider feature branch. Qualification evidence is recorded below; no deployment or production activation has occurred.

## Verified integration baseline

Remote heads fetched and verified:

| Dependency | Head |
| --- | --- |
| staging | `9e8ac75cb22b9aca497ef45c024ca1cd992731f5` |
| Payments #1213 | `d5b90a3347ce416a5b0c937bfcc90f19fb90b761` |
| Foundation #1211 | `4bb6ea4c49387123754224db4c5ed5e5d9e769cc` |
| Cleanup #1218 | `4c2cc9a6133ca0482405a6af20f823ac1dc4d5b2` |
| MCP #1209 | `61f4ada75e361ef4fe839c05d7a3c531cd074c15` |
| Calendar #1210 | `4a8df9e82b525a2dfb619c36aac94b82ccf1d259` |

MCP and Calendar heads are ancestors of Payments. The new local branch starts from Payments. Two final Foundation commits (`d6beb2af3`, `0e002e4d2`) and three Cleanup commits (`a15f5b066`, `ce4399904`, `4c2cc9a61`) have been integrated into this branch. Cleanup metadata conflicts retained the newer Payments descriptions, booking/payment tools and Foundation source-page binding; most of a15f5b066 was already incorporated by Payments. No other checkout or branch was modified.

Foundation’s exact final compact timezone selector/chevron successor `4bb6ea4c4` was integrated once as `11f347e28`. Migration history 0000–0006 is unchanged. Canonically generated 0007 is additive; Cleanup’s separate schema-contraction release hold remains independent. PR1220 `f0463a299c49c015ec7bfee8ac9182dc272246db` was inspected read-only, not integrated: its normalized integration enum omits Google Calendar, removes `integrations_json`, and its schema does not yet compose the approved Foundation/Calendar/Payments additions. Reconcile after its owner review rather than adding a second integration path.

Read contracts: AGENTS.md; docs/consultations.md; docs/integrations/google-calendar.md; docs/local-development.md; docs/testing-strategy.md; docs/operations/release-and-outage-prevention.md. The primary checkout's ignored .agents/skills contains only ai-seo, which does not apply to this scheduling implementation.

## Minimal identity and persistence contract

Identity is the existing Better Auth organization `member.id`, with its organization and user relationship. Do not introduce provider identities or enable an independent Team identity model. The inspected schema has `member`, but no configured Better Auth Team tables; roles and tenant-wide dashboard/MCP access currently accept only owner/admin.

1. Extend `product_booking_configs` with explicit `scheduling_mode` (legacy/provider) and nullable `assigned_member_id`. Default legacy preserves current behavior. One assigned member per Product; no provider pool, picker or round robin. Organization fallback remains explicit when no member is assigned.
2. Store member domain settings scoped to existing membership: IANA timezone, recurring weekly working windows, dated time off, separately approved public display name/photo/bio. A member may edit their own schedule; owner/admin oversight and public-profile approval use the shared Better Auth permission matrix. Never derive public profile from private user/member email, image or other fields.
3. Persist `assigned_member_id` on operational Booking and checkout hold through their guarded claim/move/capture SQL. Persist Session-level assignment as the occurrence commitment so every participant in one group Session meets the same person. Preserve operational Booking IDs, old assignment and actor in the existing activity ledger.
4. Domain-only Google selection/cache stores member, Better Auth linked account ID, selected calendar IDs, selection revision, covered UTC horizon, last check attempt, readable failure and busy intervals. No tokens, provider identity duplication, event titles or attendees.

Membership removal must not cascade away historical assignment. Use retained IDs/history with nullable live membership references or an explicit refusal while future commitments remain; verify against Better Auth's deletion hooks. This requires inspection of installed Better Auth 1.7.4 before choosing the smallest supported hook.

## Canonical allocator

Extend `sessionAllocationPredicate`, `sessionClaimQuery`, `sessionMoveQuery` and `listSessions` in server/utils/availability.ts. Payment checkout inserts its hold using this predicate; authenticated capture in server/domain/payments/events.ts uses sessionClaimQuery. Do not add a second overlap policy.

For provider-backed Sessions, intersect offering-generated Session facts with the assigned member's working windows, time off and fresh selected busy-calendar coverage. UTC intervals are half open. Provider occupancy is grouped by distinct Session identity across that member's Products. Active pending/confirmed Bookings and unexpired holds reserve occupancy. Multiple attendee Bookings/holds for the SAME Session only consume its existing capacity; they must not conflict with each other. Different overlapping Sessions/services conflict; adjacency succeeds. Consultations retain one appointment per configured Session.

Explicit provider mode bypasses the legacy organization calendar_group overlap guard for named member allocation, without overwriting calendar_group (still used for outbound projection). Legacy/null-member organization scheduling retains its established guard. Do not reinterpret capacity=1 as a tenant-wide provider limit.

Claim SQL selects and stores assignment in the same statement/batch that takes capacity. Capture preserves the hold's pinned assignment even if offering assignment changed, excluding only that authenticated hold. Changes to hours or Product assignment do not rewrite existing Bookings, holds or committed Session assignments. New uncommitted occurrences follow the new offering configuration. A group Session with a live Booking or unexpired active hold retains that assignment for later attendees. After every live commitment has ended, future allocation follows the current offering assignment; old Booking and hold records retain their identity and history.

Hours are expressed in the member's IANA timezone. Weekly boundary gaps/folds and ambiguous time-off input fail explicitly; normal hours track DST offsets through the repository converter. If materialized UTC working intervals are needed for atomic SQL, they are a derived, revision-fenced rolling horizon from canonical recurring rules; stale/missing horizon fails closed and is visibly regenerated by the existing bounded scheduling task. Time off remains an interval exclusion, never an edit to existing appointment facts.

Safe migration must not infer providers for historical/unassigned appointments. Default legacy. Explicit provider activation must refuse unresolved future legacy commitments or require the administrator to explicitly assign them through the canonical guarded operation. No production activation or historical backfill is authorized here.

## Moves, reassignment and parity

Extend the existing canonical booking-change operation and its immutable proposal/audit payload rather than creating an independent move flow. Preserve Booking IDs, review/payment identity, optimistic version and dedupe semantics. The accepted move must atomically validate target eligibility, working hours, exceptions, fresh busy coverage and overlap, then emit the existing lifecycle effects.

Proposed safe group policy for parent coordination: reassignment applies to the whole provider-led Session, preserving each participant Booking ID and recording each old/new assignment. Refuse individual participant reassignment in a shared Session. Refuse group reassignment while an unexpired checkout hold pins the previous assignment; do not silently rewrite a paid checkout promise. Target must be the Product's current eligible assigned member. This implements one-member eligibility without adding provider pools.

Shared domain writers resolve and permission-check Better Auth membership themselves. CMS and MCP must call those exact writers. Extend existing Product config and booking read/change schemas for provider fields/filtering. Only member schedule/profile operations without a current counterpart warrant a small new tool surface. Existing owner/admin tenant tools remain unchanged; an ordinary member gets only own scheduling/profile/calendar scope, never access to tenant-wide guest data, billing or member administration. Invitation, dashboard navigation/context and MCP discovery must enforce the same narrow role capability.

CMS: Team row opens member public profile/hours/time off/Calendar status; Product editor selects its assigned member and explicit scheduling mode; Booking detail/list displays canonical assignment, filter and guarded reassignment. Public section is exactly `Who you’ll meet with`: tenant organization by default, named member using approved public fields when assigned. Keep existing service URLs, shared experience gallery/layout and native/external mode switch.

## Google busy input

Use Better Auth linked accounts and `linkedAccountAccessToken` for account selection, encrypted storage, expiry/refresh and unlink lifecycle. Use the existing useLinkedAccounts incremental consent UI; do not grant access or connect a live account during implementation.

Google's freebusy.query supports `calendar.events.freebusy`; calendar selection additionally needs `calendar.calendarlist.readonly`. Retrieve only free/busy intervals and calendar identities, with bounded time range/calendar count and errors checked per selected calendar. Keep selected input calendars separate from the organization's outbound calendar; refuse overlap at both input and output selection writers. Do not subtract undifferentiated busy blocks to compensate for managed booking events.

No connection/selection means internal scheduling. A selected account/calendar that is disconnected, failed or stale fails closed for that member only. SQL claim checks matching revision, horizon and bounded check freshness with no error. Failed attempts update the attempt timestamp so bounded background retry does not starve healthy members; stale/error/disconnected selections remain closed. Recheck before checkout/move/capture as appropriate, with D1 guards checking cache validity at commit. Google/D1 cannot be atomic: persist visible later-conflict state and show it in Team/Booking surfaces; never silently cancel. The existing outbound durable retry remains independent and never undoes Bookings. Input failure and its retry outcome must be visible.

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

## Qualification checkpoint

Implemented canonical schema/allocator, member scheduling/profile/busy writers, whole-Session reassignment, CMS/MCP adapters and public profile. Member identity remains Better Auth `member.id`; historical Booking/hold assignment text survives membership removal while new scheduling fails closed.

Local source review corrected direct-edit bypass for provider commitments (legacy behavior preserved), checked cache revision fencing and fair failed-check retries, ensured all checkout/capture routes recheck busy input, and retained whole-Session IDs/audits on reassignment/replay. Only live commitments pin effective Session assignment; expired holds do not permanently pin an otherwise unoccupied future occurrence.

Initial focused proof passed availability 14, Payments 18 and member scheduling 2 real D1 checks. The member proof includes self/admin boundaries, public approval/revocation, missing selected Google account isolation, DST offsets and group reassignment stable IDs/audit/replay/overlap refusal. Migration checks passed additive chain 0000–0007, archived transfer and consultation backfill. Worker build and required quality passed. Final consolidated test results are recorded at PR handoff.

Browser proof uses the existing documented synthetic fixture in `docs/payments/payments.md` and `tests/e2e/fixtures/payments-local-proof.mjs`, local migrations and the production Worker. No production snapshot or private credentials are copied. Generated local-only fixture configuration is merged into canonical `.env` and its `.dev.vars.e2e` removed. `PROVIDER_SUPPORT_PROOF=true PLAYWRIGHT_PORT=3109 PLAYWRIGHT_LOCAL_PREPARED=true yarn playwright test tests/e2e/provider-local-proof.spec.ts` exercises the real Better Auth invitation, self-service boundary, CMS/MCP parity, public approved content, cross-service exclusion and whole-Session reassignment notifications. No live OAuth or financial provider calls.

Automatic review denied the earlier bundled private `.env` copy / production snapshot command and external CodeRabbit disclosure before either ran. The synthetic documented fixture and local source review avoid those actions. Parent approved the schema/self-service/group policy and supplied the exact final Foundation successor; parent message submissions through the app tool have repeatedly returned `An earlier turn submission is not yet confirmed`.
