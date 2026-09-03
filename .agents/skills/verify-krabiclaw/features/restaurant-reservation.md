# Restaurant reservation

Restaurant reservation lets a Kikuzuki visitor request a table, reach confirmation, and create the reservation and notification records used by the owner dashboard.

## Sub-features

- `reservation-open` opens the booking panel from the Reservations page.
- `reservation-slot` selects the first available time.
- `reservation-submit` sends guest details and receives a reservation ID.
- `reservation-confirm` reaches the confirmed route.
- `reservation-dispatch` records customer receipt plus owner dashboard and WhatsApp notifications in log-only mode.

## How to get to it (user POV)

- Open Kikuzuki's `Reservations` page.
- Activate the reservation booking control.
- Choose an `Available` time, then choose `Continue`.
- Fill `Full name`, `Email address`, and `Phone number`.
- In `Your details`, choose `Request reservation`.

## Driving it with verify-krabiclaw controller

Preconditions:

- Start from a fresh isolated run and require `doctor` to pass.
- The canonical Kikuzuki seed must own `site-kikuzuki` in the run's private D1.

- **Drive the reservation.** Run `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive restaurant-reservation`.
- **Confirm submission.** The POST to `/api/public/sites/site-kikuzuki/reservations` returns `201` with a reservation ID.
- **Confirm visible state.** The browser reaches `/reservations/confirmed`.
- **Confirm side effects.** The journey reads the dev notification feed and finds `reservation_customer_received`, an owner dashboard record, and a `new_reservation` WhatsApp record. All provider sends remain log-only.
- **Proof.** Keep the passing Playwright `trace.zip` and `evidence.json` in the reported evidence directory.

## Gotchas

- The booking toggle is a styled label for `reservation-booking-toggle`. Clicking an unrelated label does not open the form.
- English and Thai labels are both valid on the submit button. The existing journey accepts either.
- A confirmation route without a persisted ID and notification rows is incomplete proof.
- Never run this mutation against staging or production.
