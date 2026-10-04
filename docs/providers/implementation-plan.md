# Member scheduling and Calendar

One existing Better Auth organization member may deliver each offering. Organization
availability is used when no member is assigned. Member hours, timezone, time off
and selected Google busy calendars feed the shared session allocator.

Existing bookings retain their member assignment. Whole-session reassignment checks
member availability and overlap atomically, audits the change and notifies guests
through the existing inbox workflow. Approved member profiles appear on public
product pages as “Who you’ll meet with”.

Better Auth owns identity, membership, linked Google accounts, scopes and tokens.
The application stores only scheduling and selected-calendar domain state.
Organization-selected outbound Calendar is separate from member busy input.

Calendar and member scheduling use the additive `0001_calendar_member_scheduling`
migration over the consultation/catalog foundation. Payment holds, Checkout, buyer
accounts, refunds and usage billing are added by the separate Payments PR.

## Staging integration review

The current Calendar branch includes staging after #1211 landed. Local CodeRabbit
review identified five issues. Required reassignment fields and Calendar actions
are validated before mutation, notification receipts match the exact reassignment
key and operational booking ID within the targeted tenant, and the migration test
populates baseline data before applying the Calendar migration. A failed initial
member-settings read keeps the form unloaded and offers Retry loading availability;
unknown scheduling data cannot be saved as an empty schedule.

The HTTP/MCP booking assertions include explicit organization scheduling and null
member assignment. The native browser flow checks that malformed Calendar and
reassignment requests return 400 and leave the persisted schedule/booking unchanged.
The shared Better Auth callback also includes organization Calendar and member
availability screens; its return URL preserves the explicitly selected business.
The owner authorized and saved `http://localhost:3113/api/auth/callback/google`
on the existing OAuth client. Live Better Auth consent, callback routing, event
creation/update/cancellation, disconnect cleanup and member busy-calendar reads across the 94-day horizon
were exercised on October 4, 2026 against the built local Worker and the separate
private verification calendar. Test events, domain connections and test hours
were removed afterward. The Google app still shows its unverified-app notice;
public OAuth verification remains before general rollout. Exact evidence and
verification limits, including complete-cache preservation after a failed read,
are recorded in [Google Calendar](../integrations/google-calendar.md#review-and-validation).
