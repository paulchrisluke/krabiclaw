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
