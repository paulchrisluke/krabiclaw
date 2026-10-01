# Native consultation booking contract

Owner decisions of 2026-10-01 supersede reservation-only assumptions in #1201,
#1202 and #1203. Consultations use Product → Variant → Price → Session → Booking.
Restaurant reservations remain independent. NCLS is online; no physical office, Clio migration or live catalog provisioning
is required. The initial implementation supports an explicitly configured single
calendar. The owner's subsequent review supersedes the single-operator target:
team members must have individual recurring availability and explicit service
eligibility, with automatic assignment rather than a guest-facing provider choice.
This provider allocation is not implemented by the current calendar-group guard;
it remains a foundation integration requirement before enabling a multi-member team.

## Shared interfaces across the four feature PRs

- Operational identity: `bookings.id`. Public `booking_id` remains `requests.id`;
  `operational_booking_id` and `request_id` make both identities explicit.
- Config: `ProductBookingConfig` in `server/utils/availability.ts` and
  `product_booking_configs` in `server/db/schema.ts`. `confirmation_mode` is
  instant/review, default instant. `online_timezone` explicitly configures online
  scheduling. `calendar_group` opts Products into a tenant-scoped single calendar.
- Review: pending and confirmed consume capacity. Confirm moves pending to
  confirmed without claiming again; cancel/reject releases the allocation once.
  Canonical operations live in `server/domain/guest-threads/operations.ts`.
- Exclusion: `sessionClaimQuery`, `claimSessionCapacity` and `listSessions` in
  `server/utils/availability.ts` share capacity semantics. Enrolled Products
  exclude overlapping live bookings across the same organization/calendar group.
  Adjacent UTC intervals are permitted; unrelated classes remain independent.
- Payment policy: `online_payment_required` defaults false. A positive Price
  does not imply online collection: pay-later experiences preserve their behavior.
  A valid zero Price is free; missing Price never implies free. Required positive
  collection must hand off before a pending/confirmed Booking is created.
  Payments (#1169) owns expiring pre-checkout holds, frozen server-resolved Price,
  provider state and authenticated capture conversion. Holds must participate in
  these same capacity/exclusion predicates; browser redirects are not authority.
  Review rejection returns captured principal through Payments, independently of
  booking status. No fake capture or unpaid required-payment bypass is permitted.
- Durable effects: existing `activity_entries` record committed lifecycle changes;
  downstream Calendar/Payments should use operational Booking ID and dedupe identity
  after commit. Provider failures never roll back a committed appointment.
- Identity: guest Better Auth `user_id` and guest contact snapshot belong to the
  booking/thread. Operator actor identity belongs to activity entries, never the
  guest. MCP (#1202) calls canonical domain operations; Calendar (#1203) projects
  Product Bookings for explicitly enrolled consultation offerings outbound only.

Durations/prices remain configurable. Variants share their Product session
length; different legitimate service/duration Products may use different configs.
UTC storage/comparison and the configured timezone for input/display preserve DST.
No historical price/duration or operating hours are hard-coded.

## Native activation and shared UI

`organization.consultation_settings_json` stores the same public consultation
object with one canonical `mode`: `external_url`, `native_disabled`, or `native`.
Migration 0002 adds the column and backfills the complete legacy object without
rebuilding the referenced organization parent or changing other settings. Reads
fall back to legacy JSON only during rollout; writers use only the new column.
Native activation is an explicit operator setting, separate from publishing the
configurable offerings. No production configuration is changed by this PR.

`useSessionBooking` owns the shared public orchestration. `ProductBookingSteps`
owns variant selection, the existing `BookingTimeStep`, `BookingRecap` and
`BookingContactForm`; `BookingModal` owns dialog accessibility and scroll locking.
Saya Product detail and Blawby `OnlineProductBooking` consume these exact pieces.
The organization Product editor mounts the existing ProductEditorPage and leaves
without a physical location, including booking policy, timezone and weekly slots.

## Shared service entry points

`server/utils/availability.ts` exports `SessionAllocationInput`,
`sessionAllocationPredicate(input): BatchQuery`, `sessionClaimQuery` and
`sessionMoveQuery`. The same predicate guards inserts and accepted moves; future
checkout holds must participate here and exclude only their own authenticated
hold during conversion. Do not add another overlap policy.

`server/domain/guest-threads/operations.ts` exports
`executeGuestThreadOperation(db, input): Promise<OperationOutcome>` and
`ExecuteOperationInput`: `threadId`, `organizationId`, `action`, `actorUserId`,
`env`, optional `body`, `deliveryId`, and `idempotencyKey` (required for mutations).
`reject` is a distinct pending-only merchant transition with `host_rejected`;
ordinary `cancel` remains distinct. Payments extends the existing mutation batch
with refund permission and a full-principal refund intent, followed by durable
provider retry. Foundation has no dependency on finance tables or provider state.

Lifecycle activity events include `booking.created`, `booking.confirm`,
`booking.reject`, `booking.cancel` and accepted change operations. Payloads carry
`operational_booking_id` and `request_id`; downstream consumers dedupe the durable
entry identity and read the canonical Booking after commit. Dashboard detail
retains its legacy request `id` and exposes `operationalBookingId` separately.

## Local proof and completed review

The Worker/browser proof is explicitly opt-in in an isolated prepared checkout:
`NATIVE_CONSULTATION_PROOF=true PLAYWRIGHT_PORT=<unused-port> PLAYWRIGHT_LOCAL_PREPARED=true yarn playwright test tests/e2e/native-consultations.spec.ts --workers=1`.
It creates only local offerings, restores the prior website mode, unpublishes and
deactivates them, removes their future schedule/calendar enrollment, and deletes
unbooked offerings through the canonical API. Booked offerings preserve audit
history: the existing Product deletion rule intentionally rejects their deletion.
Normal shared-fixture suites skip this proof unless explicitly opted in.

One complete CodeRabbit review against staging finished. Verified findings were
addressed: keyboard opening, status-specific email subjects, deterministic tenant
location lookup, precise online detail labels, concurrent settings loading, partial
save wording, and stronger lifecycle/capacity replay assertions. The recommendation
to erase booked test Products was replaced by the isolated opt-in and canonical
archival cleanup above; deletion would violate the existing history contract.

Foundation deliberately returns `payment_required` for a required positive Price
until #1169 supplies authenticated capture/hold conversion. It never fabricates
payment success. No #1202 tools, #1203 OAuth/projection, financial provider calls,
production products, migrations, deployment or cutover activation are included.

## Owner visual review and provider direction

Blawby consultations use existing CMS `/services/{slug}` documents. Their text,
images, SEO, locale representations and page IDs remain intact. The existing
root-only `content_documents.product_id` is the explicit service → Product binding;
the source page editor exposes it as Appointment booking. Translations inherit
that binding, another tenant's Product is refused, and a Product has at most one
canonical page. Omitted binding fields preserve the existing relationship.

In native mode `/schedule` renders `/services`' existing ordered `page_grid`,
including its covers and summaries, with configured duration, Price/Free and
confirmation policy for linked published online Products. An unlinked service
remains visible with Contact us to schedule. Missing Price says Price
unavailable; it never means Free. Service pages add the shared booking widget
without replacing their rich content. Blawby `/experiences/{slug}` is not a service
route; physical Saya experience routes remain intact.

No billing plans or entitlement policy changed. Existing external scheduling and
contact behavior remains configured by the site's consultation settings. Growth
currently grants messaging; there is no separate booking entitlement. Any new
commercial gating must preserve existing class and restaurant booking behavior
and requires the owner's separate decision.
Online consultation times default to the browser's IANA timezone, shown in an
editable selector. Configured scheduling zones still own rule input and UTC
storage. Time choices carry canonical Session IDs, including repeated wall-clock
times during DST. Changing the display timezone clears the selected time; receipts
use the selected display zone. Existing physical class and restaurant behavior
remains independent. Consultations submit one appointment without party-size input.

Provider integration must use Better Auth organization membership as identity,
explicit Product eligibility and individual recurring hours. Automatically allocate
an eligible available member in the same atomic boundary as pending/confirmed
capacity (and future checkout holds), preserve operational Booking ID on moves,
and expose the actual assigned member to operator/guest projections and durable
Calendar/Payments events. Removing eligibility must preserve booked commitments.
Do not reinterpret a tenant calendar_group as a provider ID or silently remove its
existing overlap protection. Payments and Calendar migrations/interfaces are being
integrated separately; provider schema changes require coordination with those
contracts rather than editing their worktrees or reserved migrations.
