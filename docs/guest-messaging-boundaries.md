# Guest Messaging Boundaries

**Status: Contract**

This note exists so future sessions do not collapse three different systems into one. References to future sessions are for clarity, not authorization to implement changes.

- **WhatsApp OTP** is owner authentication for using **ChowBot on WhatsApp**.
- **Notifications** are system-generated owner/guest sends from `server/utils/notifications.ts`.
- **Guest messaging** is the reservation/contact/booking reply flow backed by the canonical `guest_thread_entries` ledger and guest-thread operation service.

## Current product truth

- Owner WhatsApp is a **ChowBot control surface**, not a guaranteed guest reply channel.
- Owner replies to guest submissions should be treated as **email-first**.
- Guest replies can be ingested back into the thread ledger from email, and from WhatsApp only when an inbound message can already be matched to an authorized guest thread by phone.
- The dashboard inbox is the canonical thread UI for guest work. It renders the opening source submission with persisted message, operation, assignment, and resolution entries from one append-only history.

## Cleanup direction now

- Do not imply that signing in with WhatsApp OTP enables replying to guests over WhatsApp.
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
