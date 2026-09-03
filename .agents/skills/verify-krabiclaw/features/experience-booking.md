# Experience booking

Experience booking lets a Pottery House visitor select an available class time, submit contact details, receive confirmation, and create the matching booking and notification records.

## Sub-features

- `experience-open` opens the Pottery Wheel Class booking flow.
- `experience-slot` selects the first available time and continues.
- `experience-submit` sends valid guest details and receives a booking ID.
- `experience-confirm` reaches the confirmed route.
- `experience-dispatch` records customer receipt plus owner dashboard and WhatsApp notifications in log-only mode.

## How to get to it (user POV)

- Open Pottery House's `Pottery Wheel Class` detail page.
- Choose `Book a class`.
- Choose an `Available` time, then choose `Continue`.
- Fill `Full name`, `Email address`, and `Phone number`.
- Choose `Confirm booking`.

## Driving it with verify-krabiclaw controller

Preconditions:

- Start from a fresh isolated run and require `doctor` to pass.
- Keep notification delivery modes at the controller's `log_only` values.

- **Drive the booking.** Run `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive experience-booking`.
- **Confirm submission.** The POST to `/experiences/pottery-wheel-class/book` returns `201` with a booking ID.
- **Confirm visible state.** The browser reaches `/experiences/confirmed` and the main region reports that the booking was received or confirmed.
- **Confirm side effects.** The journey reads the dev notification feed and finds `experience_booking_customer_received`, an owner dashboard record, and a `new_reservation` WhatsApp record. All provider sends remain log-only.
- **Proof.** Keep the passing Playwright `trace.zip` and `evidence.json` in the reported evidence directory.

## Gotchas

- Available dates depend on the current date. Choose the first button containing `Available`; do not hard-code a calendar date.
- A `201` response without the confirmed route and notification rows is incomplete proof.
- This flow writes a booking to the run's private D1. Launch a fresh run when a test requires pristine counts.
- Never run this mutation against staging or production.
