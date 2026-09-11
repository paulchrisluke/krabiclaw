# Date and time contract

Status: Contract (shipped with the canonical-instant baseline, September 2026).

`utils/timezone.ts` owns validation, JSON Schema primitives, civil formatting and
zone conversion. `server/db/schema.ts` owns persistence constraints. Dashboard,
public pages, ChowBot and MCP must use these contracts rather than permissive readers.

| Value | Canonical representation | Zone source |
| --- | --- | --- |
| Calendar date | Gregorian `YYYY-MM-DD` | No conversion |
| Booking slot / opening hour | `HH:mm`, 24-hour wall time | Explicit selected location |
| Precise event wall time | `HH:mm:ss` with optional fractional seconds | Explicit selected location |
| Application instant | UTC `YYYY-MM-DDTHH:mm:ss.SSSZ` in storage | API requires an explicit offset before normalization |
| Provider timestamp | Provider's documented type and unit at its adapter boundary | Provider contract |
| Analytics day | Gregorian civil day in the report timezone | Selected site's analytics configuration |
| Organization analytics range | One shared Gregorian range, ending on the current UTC date unless explicitly supplied | UTC defines range labels; each site measures those dates in its configured timezone |
| Publication scheduling | Explicit instant; editor labels UTC | Explicit editor zone |
| Billing access expiry | Canonical UTC instant | Actual trial end for trials; paid-through for paid access; past-due-since plus the explicit grace duration for past-due access |

Human formatting is locale-aware and Gregorian. Zero seconds are omitted;
meaningful seconds remain visible for precise wall times. Formatting never changes
the stored value. Civil dates never pass through a browser timezone. Missing
values show named empty states; invalid values fail. Booking times that fall in
DST gaps or overlaps fail rather than choosing an instant. Reporting boundaries
include the entire civil day using explicit calendar-boundary transition semantics.
The installed `@internationalized/date` library owns transition resolution; see
[its documented conversion policies](https://react-aria.adobe.com/internationalized/date/CalendarDateTime#conversion).

`server/utils/billing-access.ts` computes access and its expiry once, shared by
subscription projection and reconciliation. Billing period end is never a
substitute for a missing trial end, paid-through or grace anchor. The subscription
and invoice event paths both forward the actual provider trial end.

## September 7 aggregate audit

A read-only production audit checked 106 application-owned timestamp columns.
Twenty-two columns contain values outside the canonical UTC millisecond shape.
No tenant rows, identifiers or auth records were exported for this audit.

Most discrepancies are SQL timestamps with a space and no offset. Legacy writer
provenance must establish UTC before conversion. `customers.last_booking_at`
was a different defect: all 12 populated values were offsetless local timestamps.
Both it and `customers.last_review_at` were duplicate summaries with no UI
consumers. Epoch 6 deletes these columns and every runtime writer/reader; the
actual request and review records remain the source. No compatibility projection
replaces them. Some imported review timestamps had excess fractional precision;
the application instant contract stores milliseconds, while precise event wall
times retain the domain's fractional precision.

Current changes delete the duplicate customer date writers and correct SQL timestamp writers and lexical
comparisons. They deliberately do not add readers accepting the old formats.
Existing production values must be corrected before those readers are released.

## History

The canonical-instant constraints could not be added through an ordinary
generated migration (the generator rebuilt referenced parent tables), so they
shipped as a fresh generated baseline and an offline
transfer of every retained value with one-time UTC normalization, verified for
row identity, constraints and foreign keys before the production write freeze.
`customers.last_booking_at` and `customers.last_review_at` were duplicate
summaries with no UI consumers and were deleted rather than normalized; the
request and review records remain the source. See
`server/db/schema.ts` for the target shape.
