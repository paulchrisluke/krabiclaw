# Notification Testing

KrabiClaw supports both log-only and real provider delivery for email and WhatsApp. We need
to be deliberate about which one we are using, because several public product flows send real
notifications in production.

## Delivery modes

Email is controlled by `EMAIL_DELIVERY_MODE`.

- `log_only`: do not send via Resend; write/log the attempt only
- `provider`: send via Resend for real

WhatsApp is controlled by `WHATSAPP_DELIVERY_MODE`.

- `log_only`: do not send via Meta WhatsApp; write/log the attempt only
- `provider`: send via Meta WhatsApp for real

Both helpers fail closed:

- `server/utils/email-delivery.ts`
- `server/utils/whatsapp-delivery.ts`

If the mode is missing, blank, or invalid, delivery falls back to `log_only`.

## Environment expectations

Expected default behavior:

- Local dev: `log_only`
- Preview: `log_only`
- Staging: `log_only`
- Production: `provider` only where we intentionally want live delivery

Do not assume "it is just a test form" means "it will not send." If production is in
`provider` mode, public submission paths can send for real.

## Production paths that can send for real

These should be treated as live traffic in production:

- Platform contact: `POST /api/contact`
- Platform help escalations from `/help`
  - `components/platform/PublicHelpChowBot.vue` submits `source="help_agent"` through the
    platform contact flow
- Tenant contact: `POST /api/public/sites/[siteId]/contact`
- Tenant reservations: `POST /api/public/sites/[siteId]/reservations`
- Tenant experience bookings: `POST /api/public/sites/[siteId]/experiences/[slug]/book`
- Dashboard reply actions for reservation / booking follow-up

If you hit those endpoints in production with real delivery enabled, expect real email and/or
WhatsApp to be sent.

## Safe testing order

Prefer these in order:

1. Read-only provider checks
2. Log-only delivery in local/preview/staging
3. DB/log verification
4. Explicit real-send canaries with dedicated test identities

### 1. Read-only provider checks

Use these first when you only need to know whether credentials and providers are healthy:

- `yarn canary:status`
- `GET /api/canary/provider-status`

These confirm Resend and WhatsApp provider connectivity without sending a real email or message.

### 2. Log-only delivery

For implementation work, UI checks, and most regression testing:

- keep `EMAIL_DELIVERY_MODE=log_only`
- keep `WHATSAPP_DELIVERY_MODE=log_only`
- use local dev, preview, or staging

This is the default safe mode and should be used unless the specific goal is to verify an
actual provider send.

### 3. DB and log verification

Before reaching for a live test, inspect the system of record:

- `notifications`
- `submission_messages`
- `platform_contact_submissions`
- `contact_submissions`
- `reservations`
- `experience_bookings`
- `canary_runs`

Useful dev-only inspection helpers:

- `GET /api/dev/notifications`
- `GET /api/dev/submission-messages`

### 4. Real-send canaries

Use real provider sends only when we explicitly need end-to-end proof that delivery works.

Rules:

- Use dedicated canary identities only
- Never use personal email addresses or phone numbers for routine testing
- Run the manual GitHub Actions workflow `Production Real-Send Canaries`
- Choose only the specific canary needed for that test window
- Review `canary_runs` and provider message IDs afterward

Current canaries:

- `yarn canary:prod`: auth / OTP canary
- `yarn canary:notifications`: real email + WhatsApp notification canary

## Agent rule

LLMs and humans should follow the same rule:

- Do not trigger production public forms or live notifications just to "see if it works"
  unless the user explicitly asked for a real-send test.

Instead:

- verify the DB write
- inspect `notifications` / `submission_messages`
- use read-only provider status checks
- use preview/staging/local in `log_only`
- escalate to the manual production canary only when needed

## Why this matters

Accidental live tests create real customer-facing side effects:

- unexpected support emails
- unexpected WhatsApp messages
- noisy inbox history
- cost from provider sends
- confusion when test data looks like a real lead

The `help_agent` contact submission you saw is a good example: it is a real production path,
not a fake internal sandbox.
