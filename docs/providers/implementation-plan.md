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
An owner-authorized isolated verification calendar has been created. Live linking
currently fails with `redirect_uri_mismatch` because the configured Google OAuth
client does not register `http://localhost:3113/api/auth/callback/google`.
Real consent, busy-calendar reads, event lifecycle and disconnect cleanup remain
pending that client configuration and the owner's incremental consent.
