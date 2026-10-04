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
cleanup** also reconciles immediately. SQL selects at most 25 missing or changed
subjects per invocation. Unchanged subjects receive no intent writes. Cleanup
selects at most 25 stale identities at the database boundary, and each lifecycle
fence reads only its operational identity. Later passes resume through the
persisted intent rows without an in-memory cursor.

`google_calendar_event_links` is the durable projection intent and provider
mapping. Its subject is `(organization_id, integration_revision, booking_kind,
operational_id)`; `operational_id` means `bookings.id` or `reservations.id`.
A partial unique index permits one live intent per subject while retaining
deleted provider identities as history. `request_id` is the thread identity, never the operational Booking ID (including
legacy public responses named `booking_id`). Foundation reschedules keep the
operational ID and therefore update the same mapped Google event.

The worker preallocates a Google-compatible event ID before provider I/O. A
create that times out after Google commits retries the same ID; a conflict
updates that identity. The source revision covers canonical status, interval,
timezone, name and committed source/activity revision. Leases fence concurrent
processors, and each attempt re-reads current booking/integration state. A late
result after cancellation/disconnect is compensated by deleting that exact
managed identity; if compensation fails, the persisted intent is retried. A
process killed between the provider write and local receipt is also reconciled
from the same durable mapping. Cross-provider atomicity is impossible: a late
in-flight event can be briefly visible until compensation/retry completes.

## Settings and cleanup

Better Auth owns account identity, encrypted credentials, refresh and incremental
consent through the existing `useIntegrationConnection` / `linkedAccountAccessToken`
boundary. `organization_integrations` holds only account/calendar/group selection,
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

1. Keep this PR based on current `staging`, which includes the consultation
   foundation (#1211). Calendar is reviewed before the separate Payments PR.
   This PR uses `0001_calendar_member_scheduling` after the v11 foundation
   baseline. The separate Payments PR follows with `0002_payments_commerce`.
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


## Review and validation

This Calendar-only change targets staging after the native consultation and typed
catalog foundation (#1211) landed. It includes member working hours, time off, selected Google
busy calendars and assignment through the canonical booking allocator.

Current checks are recorded in the replacement PR. Google provider requests in
D1 tests are intercepted; those checks do not grant scopes or mutate real Google
events. Real consent and provider qualification still require an explicitly
authorized disposable calendar. Historical review notes on the superseded PRs
do not qualify this replacement head for deployment.
