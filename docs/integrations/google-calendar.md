# Outbound Google Calendar

Krabiclaw owns scheduling and capacity. This integration projects pending and
confirmed operational Bookings in the selected `product_booking_configs.calendar_group`
to one calendar. Enrollment is the foundation allocation policy; settings do
not maintain another Product list. Reservations are a separate explicit opt-in.
Other classes/experience Products, checkout holds, cancelled records and
historical records are excluded from upcoming backfill. No office, attorney,
resource, import, Google free/busy or inbound event policy is introduced.

## Committed lifecycle contract

Payments, MCP and dashboard operations commit the canonical Booking/Reservation
and activity through the foundation. The projection worker reads those committed
rows, canonical Session instants/timezone and the committed activity sequence.
It never calls MCP and never participates in a guest booking transaction. A
provider failure cannot roll back a booking or alter the guest response.
The scheduled task runs on the existing five-minute cron; **Sync upcoming / retry
cleanup** also reconciles immediately. It discovers all upcoming active subjects
on every pass. At most 25 subject intents are written per invocation; missing
identities are backfilled first, then persisted mapping `updated_at` timestamps
rotate existing subjects oldest-first. Further cron/retry passes resume this work
without an in-memory cursor. Cancellation/history reconciliation uses one
set-based D1 statement, leaving a bounded query budget for provider processing.

`google_calendar_event_links` is the durable projection intent and provider
mapping. Its subject is `(organization_id, integration_revision, booking_kind,
operational_id)`; `operational_id` means `bookings.id` or `reservations.id`.
A partial unique index permits one live intent per subject while retaining
deleted provider identities as history. `request_id` is the thread identity, never the operational Booking ID (including
legacy public responses named `booking_id`). Foundation reschedules keep the
operational ID and therefore update the same mapped Google event.

The worker preallocates a Google-compatible event ID before provider I/O. A
create that times out after Google commits retries the same ID; a conflict
updates that identity. Revision hashing covers canonical status, interval,
timezone, name and committed source/activity revision. Leases fence concurrent
processors, and each attempt re-reads current booking/integration state. A late
result after cancellation/disconnect is compensated by deleting that exact
managed identity; if compensation fails, the persisted intent is retried. A
process killed between the provider write and local receipt is also reconciled
from the same durable mapping. Cross-provider atomicity is impossible: a late
in-flight event can be briefly visible until compensation/retry completes.

## Settings and cleanup

Better Auth owns account identity, encrypted credentials, refresh and incremental
consent through the existing `useLinkedAccounts` / `linkedAccountAccessToken`
boundary. Organization JSON holds only account/calendar/group selection,
revision/status and a readable failure. The Google account and Analytics/Search
Console grants are retained on Calendar disconnect.

Selecting a calendar verifies its writer/owner role and schedules upcoming
active backfill. Calendar changes deliberately require disconnect and completed
cleanup first. Disconnect disables projection immediately; the worker removes
only mapped managed events from the old calendar. Failed cleanup remains
visible with its original account/calendar/event identity and retry action.
The selection is cleared only once all managed identities are deleted.
A 404/410 event delete is accepted only after writer access to its calendar is
verified again; a lost calendar grant is not treated as completed cleanup.
Synced confirmed historical consultation events remain only while their
Session is scheduled and ended; Reservation history behavior is unchanged.
During ordinary reconciliation those successful events remain; explicit
disconnect removes all locally managed event identities, including history.
Unrelated Google events are never searched, changed or deleted.

The existing `cleanupOrganizationBeforeDelete` hook stages minimal
`google_calendar_cleanup_jobs` before Better Auth physically deletes an
organization. The outbox retains only original tenant/account/calendar/event
identities and retry/receipt state, without guest content, Booking IDs or tokens.
It delays cleanup past any in-flight projection lease. No Google request blocks
organization deletion. The orphan worker requires the organization to be absent
both when selecting and claiming work; staging alone cannot authorize deletion
if the subsequent Better Auth deletion aborts. These jobs can only delete their captured managed event;
they cannot re-enroll or project a deleted tenant, and no normal tenant API reads
them. Lost credentials retain `state=error` and `last_error`; the scheduled task
reports unresolved jobs instead of claiming successful external deletion.

Operator inspection after tenant removal uses the retained outbox:

```sql
SELECT organization_id, account_id, calendar_id, event_id, state, attempts,
       last_error, next_attempt_at, completed_at
FROM google_calendar_cleanup_jobs WHERE state <> 'deleted';
```

Restore the owning linked account grant or perform separately authorized manual
cleanup when credentials are lost. No receipt is marked complete merely because
a calendar becomes inaccessible.

## Privacy

Payloads contain a minimal consultation/reservation title and guest name,
status, canonical start/end/timezone and dashboard link. Visibility is private.
No email, notes, legal matter, thread body, attendees, invitations or office data
are sent. Provider mutations use `sendUpdates=none`.

## Deployment and owner setup

1. Rebase on final consultation foundation and regenerate the Calendar migration
   through `yarn db:generate` in the agreed merge order. The independently
   generated Calendar migration is not a dependency on Payments or a reserved number.
   The verified Foundation/MCP integration currently generates Calendar as 0005,
   following the preserved native consultation foundation 0004.
2. Apply the canonical release/migration checks and deployment process. No
   deployment or merge was authorized for this implementation.
3. Enable Google Calendar API for the existing OAuth application and configure
   its consent screen/verification for `calendar.calendarlist.readonly` plus
   `calendar.events`. Events scope is needed for writer access to an existing
   shared calendar; owned-only/app-created scopes do not cover that policy.
4. The owner explicitly grants incremental Calendar scopes on the linked Google
   account, chooses a writable calendar and existing single-calendar group, then
   checks upcoming backfill and retries any visible errors.
5. Perform real consent/provider verification only against a separately
   authorized disposable Google calendar. Implementation tests intercept Google
   provider requests; they do not grant scopes or mutate real Google events.


## Scoped local review

One CodeRabbit CLI pass reviewed the Calendar-only diff against Foundation
`829a38c03`. Both actionable findings were corrected: scheduled Session status
now gates historical consultation retention, and intent reconciliation has a
25-subject write budget with persisted oldest-first progress and set-based
cleanup. Focused real D1/provider regressions cover 55-booking multi-pass
backfill, revisiting changed existing subjects and cancelled historical Session
event deletion. No extra review round was run solely to certify the fixed head.


## Coordinated successor integration

Calendar integrates MCP successor `61f4ada75` from #1209, based on Foundation
`a7fd549e5`. The shared `server/domain/product-bookings.ts` writer and allocation
predicate remain unchanged. Projection continues to read committed operational
`bookings.id`, request IDs and activity revisions for the existing configured
`calendar_group`, without another scheduler or enrollment list. Migration 0004
and its snapshot are preserved; canonical Drizzle tooling generates Calendar
migration 0005. Payments should build on this integrated Calendar successor.

The single-calendar projection does not claim to implement the Foundation's
pending multi-member service assignment policy. That remains the canonical
allocator's responsibility. No service layout redesign was added.

Local successor evidence: scoped Calendar D1/provider tests (4), migration
from-zero/archive/backfill tests (3), targeted lint, schema drift, typecheck and
production Worker build pass. The opt-in `CALENDAR_SETTINGS_PROOF=true` browser
test captures authenticated NCLS desktop/mobile settings without consent clicks.
Canonical local setup restored 69 tables / 72,871 rows and provisioned local
credentials. The snapshot subprocess buffer was raised from 64 MiB to a bounded
256 MiB after the current source exceeded the former output limit; the single
SQLite read snapshot and all transfer integrity checks remain intact.
