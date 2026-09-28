# Guest Messaging Boundaries

**Status: Contract**

This note exists so future sessions do not collapse three different systems into one. References to future sessions are for clarity, not authorization to implement changes.

- **WhatsApp OTP** verifies a signed-in member's own phone number from their profile, so notifications can reach them on WhatsApp. It is not a way to sign in.
- **Notifications** are system-generated owner/guest sends from `server/utils/notifications.ts`.
- **Guest messaging** is the reservation/contact/booking reply flow backed by the canonical `guest_thread_entries` ledger and guest-thread operation service.

## Current product truth

- Owner WhatsApp is a **ChowBot control surface**, not a guaranteed guest reply channel.
- Owner replies to guest submissions should be treated as **email-first**.
- Guest replies can be ingested back into the thread ledger from email, and from WhatsApp only when an inbound message can already be matched to an authorized guest thread by phone.
- The dashboard inbox is the canonical thread UI for guest work. It renders the opening source submission with persisted message, operation, assignment, and resolution entries from one append-only history.

## Cleanup direction now

- Do not imply that a verified WhatsApp number enables replying to guests over WhatsApp.
- Do not expose owner-side outbound WhatsApp reply for guest submissions until guest delivery is trustworthy.
- Keep notification CTAs pointing owners into the dashboard inbox, where freeform owner replies are sent by email through the canonical guest-thread operation endpoint.

## Canonical thread model

- `guest_threads` is the conversation aggregate for one source submission.
- `guest_thread_entries` is the sole guest-conversation timeline/history store. Entries are facts and corrections are represented by later entries, not rewrites.
- Every thread starts with a persisted `submission` entry that marks when the source submission opened the conversation. Guest identity and opening context are read from that source submission, not copied into the thread or entry.
- Human replies, operational transitions, delivery attempts/results, assignment changes, and resolution/reopen actions are persisted as typed ledger entries.
- Conversation state is separate from source lifecycle state. Conversation state is limited to `needs_attention`, `waiting_on_guest`, and `resolved`; operational status remains owned by the source adapter.
- Per-member read state lives outside the thread aggregate so one manager reading a thread does not mark it read for every other manager.
- The inbox renders server-authorized actions from the guest-thread source adapter registry. Dashboard UI must not infer confirm/cancel/complete policy from raw source status or call source-specific editor mutation endpoints.
- Reuse the shared conversation shell where it helps the UX, but never back guest threads with assistant/tool-call history.
- Keep public guest web-thread participation as a later phase; near-term guest participation is email reply ingestion.

## Epoch 5 reply-address contract

The current supported address is
`r<type-code><32-hex-UUID><24-hex-HMAC>@reply.<platform-domain>`. Inbound email
and the development ingress both validate this address and pass its signature
through the canonical guest-thread receiver. The 32-hex token and
`reply+<type>-<id>-<token>` address are retired with Epoch 5. Existing compact
addresses retain their exact signature algorithm and continue to work; stored
submissions, messages and delivery evidence are preserved.

This implements the owner's explicit requirement that no backward compatibility
is required. Retirement applies to the staging build now and to production only
when the owner performs the later production cutover. Previously sent emails
cannot be rewritten. Fresh production evidence includes four pre-compact
reservations and one contact still marked new; their reservation service dates
are past, but there is no evidence that every conversation was resolved. The
retirement decision does not mark them complete or discard them. Retained Resend
history contained seven delivered compact reply addresses and no old-format
address; the provider's retention window does not prove that older addresses
were never issued. After production cutover, replies to the retired format are
rejected instead of appended to guest threads.
