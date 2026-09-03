# Guest contact

Guest contact lets a Pottery House visitor send a message, reach confirmation, and create the contact thread and owner/customer notification records.

## Sub-features

- `contact-open` opens the tenant contact form.
- `contact-submit` sends a name, email, and message.
- `contact-confirm` reaches the confirmed route after a `201` response.
- `contact-dispatch` records the customer receipt and owner dashboard and WhatsApp notifications in log-only mode.

## How to get to it (user POV)

- Open Pottery House's `Contact` page.
- Fill `Your name`, `Email`, and `Your message`.
- Choose `Send a message`.

## Driving it with verify-krabiclaw controller

Preconditions:

- Start from a fresh isolated run and require `doctor` to pass.
- Keep notification delivery modes at the controller's `log_only` values.

- **Drive the form.** Run `node --experimental-strip-types .agents/skills/verify-krabiclaw/scripts/control.mjs drive guest-contact`.
- **Confirm submission.** The POST to `/api/public/sites/site-pottery-house/contact` returns `201`.
- **Confirm visible state.** The browser reaches `/contact/confirmed`.
- **Confirm side effects.** The journey reads the dev notification feed and finds `contact_customer_received`, the `new_contact_msg` dashboard record, and its WhatsApp owner record.
- **Proof.** Keep the passing Playwright `trace.zip` and `evidence.json` in the reported evidence directory.

## Gotchas

- The email label can match more than one element if the page layout changes. The repository journey uses the visible form's accessible label.
- The confirmation route alone does not prove that the contact thread or notifications persisted.
- Log-only records are the expected production-boundary substitute. Do not configure real email or WhatsApp delivery for verification.
- Never run this mutation against staging or production.
