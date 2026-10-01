# Native consultation booking contract

Owner decisions of 2026-10-01 supersede reservation-only assumptions in #1201,
#1202 and #1203. Consultations use Product → Variant → Price → Session → Booking.
Restaurant reservations remain independent. NCLS is online, one operator and
one configured calendar; no office, attorney/resource model, migration or live
catalog provisioning is required.

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
