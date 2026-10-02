# Provider support v1 — prerequisite and domain plan

Prepared 2026-10-02 in an isolated Mac checkout. The implementation is on the isolated provider feature branch. Qualification evidence is recorded below; no deployment or production activation has occurred.

## Verified integration baseline

Remote heads fetched and verified:

| Dependency | Head |
| --- | --- |
| original staging | `9e8ac75cb22b9aca497ef45c024ca1cd992731f5` |
| current v8 + Messages staging | `689079e0cd75a3dd0c2d39d6e0a68683a3d73ba1` |
| Payments #1213 | `d5b90a3347ce416a5b0c937bfcc90f19fb90b761` |
| Foundation #1211 | `4bb6ea4c49387123754224db4c5ed5e5d9e769cc` |
| Cleanup #1218 | `4c2cc9a6133ca0482405a6af20f823ac1dc4d5b2` |
| MCP #1209 | `61f4ada75e361ef4fe839c05d7a3c531cd074c15` |
| Calendar #1210 | `4a8df9e82b525a2dfb619c36aac94b82ccf1d259` |

MCP and Calendar heads are ancestors of Payments. The new local branch starts from Payments. Two final Foundation commits (`d6beb2af3`, `0e002e4d2`) and three Cleanup commits (`a15f5b066`, `ce4399904`, `4c2cc9a61`) have been integrated into this branch. Cleanup metadata conflicts retained the newer Payments descriptions, booking/payment tools and Foundation source-page binding; most of a15f5b066 was already incorporated by Payments. No other checkout or branch was modified.

Foundation’s final selector/gallery successor is retained. The original pre-v8 stack and its proof are preserved on backup branches at `ec97225deef17ba5ba3b977fcf8c330898439f6c` and account-corrected `9ac12ab27faf6c3d48b82cb7ea15d656b5287dc2`. The final checkout integrates actual v8 and merged Messages PR #1222. Shipped v8 migrations 0000 and 0001 are retained exactly; canonically generated next additive migration is `0002_provider_support.sql`. Cleanup’s separate contraction hold remains: all seven weekly columns are retained. Calendar output is normalized in organization_integrations; no retired organization integration JSON or v5/v6 history is revived.

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

## Owner-directed v8 reconciliation

On 2026-10-02 the owner directed this branch to follow the upcoming v8 epoch. PR #1220 has merged at actual staging `a3373225ec98cc6056323887dc72e0a50c28f9d2` (source `45588082007ae23fdc242f41196c1f1b54ccf641`). Messages/photo PR #1222 subsequently merged at `689079e0cd75a3dd0c2d39d6e0a68683a3d73ba1`, source `58ea7fd47ff5ff4049729551ac2481f0f02e6d55`; its shipped 0001 and schema are retained before generating provider 0002. Do not publish the existing 0007 or claim compatibility with v8 before reconciling against the actual merged baseline.

Minimal proposed order: retain v8 schema/transfer/security changes; port Cleanup runtime fixes without restoring its removed schema; port Foundation/MCP domain additions; reconcile Calendar fully; retain Payments/provider additions; regenerate the single final MCP catalog and one additive feature migration through the repository workflow. Preserve v8's retired migration history and replacement bindings. Do not use whole-file conflict winners for schema, professional-services or transfer scripts.

Proposed Calendar record choice: extend the canonical `organization_integrations` provider enum/check with `google_calendar`, using existing account_id, target_id/name, revision and timestamps for its output selection. Add typed Calendar-only calendar_group, include_reservations, status and last_error fields with provider-specific constraints. This replaces every former Calendar JSON selection, revision fence, error/status, disconnect and tenant-deletion writer. Member input selection/cache remains on the existing member_scheduling row; it represents that member's conflict input, not a second organization output store. Both selection writers retain their atomic mutual-exclusion guard. No JSON compatibility store, constraint bypass or new OAuth action.

Affected integration surfaces: server/db/schema.ts; shared/organization-settings.ts; server/utils/organization-integrations.ts (from v8); server/utils/google-calendar.ts; server/domain/member-scheduling.ts; server/utils/organization-settings.ts; Calendar CMS/API and integration summaries; server/utils/professional-services.ts (retain v8 Search Console reader alongside Foundation consultation writers); server/utils/tenant-deletion.ts; scripts/transfer-database-export.mjs and snapshot workflow; wrangler.toml; migrations/meta; Calendar/member/availability/payment D1 fixtures and tests/e2e/fixtures/payments-local-proof.mjs.

The v8 baseline does not absorb the feature stack: its seven legacy weekly fields remain under the separate schema-contraction hold and must stay in the v8 schema/migration until that hold is released; Foundation pending Booking/config, Calendar projection, Payments and provider columns/tables still need additive composition. Preserve those held fields in the reconciled Drizzle schema rather than generating their deletion as an incidental provider migration. Preserve deletion of organization.integrations_json and business_locations.description_provenance. Preserve v8 current/v7 transfer recognition and normalized connection validation; deliberately port feature transfer changes rather than restoring v5/v6 archived loops. No owner product decision is needed; final Calendar normalization awaits feature-stack and migration coordination, not a speculative schema publication.

## Final focused browser result before v8 reconciliation

Production Worker focused browser proof passed on 2026-10-02: 1/1, 7.3 seconds (18.7 seconds including startup), log `/tmp/provider-browser-final.log`. The canonical synthetic fixture now supplies an ordinary registered customer subdomain, published source locales, a separate platform organization, and one public Experience location. Products and location publication are written through existing APIs. No production snapshot, credential or financial action.

Exercised real Better Auth invitation/acceptance as an ordinary member; self-only access and cross-member 403; forbidden admin MCP operations; CMS form write read through MCP and reverse; one assigned offering member; approved-only public profile; two attendee claims on the same Session; competing cross-service claim 409; canonical CMS/MCP Booking assignment; real CMS whole-Session reassignment preserving both Booking IDs; self-service CMS edit without public approval authority; public organization fallback withholding unapproved content. A fresh cookie-free client verifies the private page's login redirect; authenticated response is no-store. The new self-service page follows CMS client rendering, standalone app styling, private SEO/cache and auth boundary rules. Runtime proof also caught and fixed the public API's omitted-null fallback.

Screenshots (synthetic identities only) visually inspected: artifacts/provider-team-desktop.png, provider-team-mobile.png, provider-offering-desktop.png, provider-public-desktop.png, provider-booking-desktop.png, provider-booking-mobile.png, provider-self-service-mobile.png, provider-org-fallback-mobile.png. These are proof of the implemented surfaces, not a production activation or a replacement for v8 proof.

Final focused member D1 check passed 2/2 after narrowing the canonical read shape. Earlier consolidated D1 batch had 105/108 pass with three resource-pressure failures; serial recheck of all three affected files passed 21/21, covering those failures. Full unit batch had 245/246 pass with one stale feature-evidence hash; its focused check passed after reviewed hash repair. Migration/transfer checks, catalog checks and required quality passed before the latest browser fixes; latest Worker build passed in 35.2 seconds. Latest typecheck and changed-file lint both passed. Do not present these pre-v8 results as a v8 qualification.

## Account navigation and Google setup checkpoint

Owner-directed personal scheduling now uses the existing My account profile leaf `/dashboard/account/profile/calendar`. Business selection keeps hours/time off tied to the existing member and organization. Team exposes admin oversight and status, without a duplicate Google connection flow. Ordinary members land on this account leaf after login/invitation; owners/admins keep the existing dashboard destination. The editor waits for canonical initial data before accepting input. Future authorized Google connection requests include offline access; no live grant was made.

Focused production Worker browser proof passed 1/1 in 8.3 seconds (19.8 seconds with startup), `/tmp/provider-browser-account-ready.log`; it additionally verifies account navigation, explicit business context and absence of the Team connect button. Build passed in 32.6 seconds. Screenshot `artifacts/provider-self-service-mobile.png` shows the corrected account surface. Preserve pre-v8 head `ec97225deef17ba5ba3b977fcf8c330898439f6c`.

Calendar API was enabled with explicit owner authorization in project kikuzuki-business-api, number 799728932262. Following the owner’s specific approval, exactly calendar.calendarlist.readonly, calendar.events.freebusy and calendar.events (URI prefix https://www.googleapis.com/auth/) were added and saved in Console. Existing Analytics/identity scopes remain; publishing remains External/In production. Console now requires verification; no verification submission occurred. No new credentials, billing or unrelated API changed. Persistent test-account consent is authorized but has not occurred: the isolated synthetic configuration has no Google client. Existing client allows http://localhost:3000/api/auth/callback/google (port 3000 currently free), https://local.krabiclaw.com/api/auth/callback/google, and staging/preview/production callbacks. Wrangler’s installed --env-file option supports native configuration loading without manual credential transfer. Automatic approval review rejected probing other worktrees’ private .env files even for credential-presence booleans. No such probe ran, and no alternative private configuration access was attempted. Resolve authorization for the specific existing local configuration before loading it; no callback change is necessary if port 3000 is used.

## Final v8 local proof

Actual merged staging base 689079e0; canonical migrations 0000 baseline, 0001 Messages, 0002 combined feature addition. Generated SQLite config-table rebuild was reduced to in-place ADD COLUMN statements because D1 does not disable FK cascades; normalized integration rebuild copies only existing columns, retaining selected accounts/resources/revisions. The seven held recurrence fields stay unchanged. Transfer supports actual v7/current lineage, retains normalized integration validation and applies current additive features to the staged copy.

Real D1 focused batch passed 38/38: availability/provider allocation, shared Calendar selection race, Calendar projection/retry/deletion, member permissions/DST, payment hold capture and guest delivery. Full unit batch passed 246/246. Migration lint, schema drift, baseline/transfer/backfill 3/3, required quality and production Worker build passed. Final browser proof passed 1/1 in 14.1 seconds (24.5 startup included), log /tmp/provider-v8-browser-final.log, through actual Better Auth, CMS, MCP and public pages. Existing eight screenshots were refreshed. No live financial call, production activation, deploy or remote DDL. Google live consent/event proof remains pending access to the existing configured runtime.

## Minimal existing-stack handoff

Keep Cleanup #1218’s independently reviewable v8-compatible runtime-only artifact: port its weekly writer/Q&A409/test fixes onto actual staging; retain the seven schema fields and leave contraction SQL outside the deployable artifact until separately approved. This provider branch does not replace that artifact.

For Foundation #1211/MCP #1209, retain final gallery/shared service layout, native toggle and domain writers; preserve v8 Search Console normalized reads and merged Messages/photo lifecycle. For Calendar #1210, port the normalized output read/selection/revision/status/disconnect/deletion changes from server/utils/google-calendar.ts and organization_integrations, with matching shared types/schema/CMS summaries. For Payments #1213, start from its exact approved d5b90a3347ce416a5b0c937bfcc90f19fb90b761 head and carry the final Foundation and cleanup runtime fixes plus this Calendar normalization; do not overwrite independent Payments diagnostics. Owners of those branches should update them, not this task.

The single provider draft is the composed review artifact and owns one combined unshipped additive migration 0002 and final 122-tool metadata on this baseline. Do not also publish independent copies of its migration from stack PRs. If prerequisites are shipped separately, regenerate each next additive migration from the then-shipped journal and regenerate the provider remainder once after final prerequisite integration. No cascading force-push/rebase chain is needed.
