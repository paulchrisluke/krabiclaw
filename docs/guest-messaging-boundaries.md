# Guest Messaging Boundaries

This note exists so future sessions do not collapse three different systems into one:

- **WhatsApp OTP** is owner authentication for using **ChowBot on WhatsApp**.
- **Notifications** are system-generated owner/guest sends from `server/utils/notifications.ts`.
- **Guest messaging** is the reservation/contact/booking reply flow backed by `submission_messages`.

## Current product truth

- Owner WhatsApp is a **ChowBot control surface**, not a guaranteed guest reply channel.
- Owner replies to guest submissions should be treated as **email-first**.
- Guest replies can be ingested back into `submission_messages` from email, and from WhatsApp only when an inbound message can already be matched to an open submission by phone.
- The current dashboard inbox is a **submission list plus reply action**, not yet a full thread UI.

## Cleanup direction now

- Do not imply that signing in with WhatsApp OTP enables replying to guests over WhatsApp.
- Do not expose owner-side outbound WhatsApp reply for guest submissions until guest delivery is trustworthy.
- Keep notification CTAs pointing owners into the dashboard inbox, where replies are sent by email.

## Long-term direction

- Build a real dashboard thread UI for guest conversations.
- Reuse the shared ChowBot conversation shell where it helps the UX, but keep guest threads backed by `submission_messages`, not assistant/tool-call history.
- Seed each thread with the full reservation/booking/contact details rather than a lossy summary.
- Keep public guest web-thread participation as a later phase; near-term guest participation is email reply ingestion.
