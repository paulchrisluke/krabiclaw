# WhatsApp member access rollout

Operational WhatsApp recipients must have an active organization membership and a matching site or location scope before KrabiClaw sends dashboard deep links.

## Staging

1. Deploy migration `0051` and `0052` before application code.
2. Run `yarn site:backfill-whatsapp-members --staging --dry-run` and review every configured recipient and proposed action.
3. Run `yarn site:backfill-whatsapp-members --staging --apply`.
4. Deliver or resend each reported invitation through the approved WhatsApp access-invitation template. Normal operational messages remain blocked until acceptance.
5. Verify phone OTP acceptance, scope materialization, scoped navigation, direct API denial, and notification resumption.

## Production

1. Deploy the migrations and application authorization support first. This intentionally fails closed for recipients whose access is incomplete.
2. Run `yarn site:backfill-whatsapp-members --remote --dry-run`. Confirm Kikuzuki, Pottery House, and every other configured number appear from live data; client names and numbers are never hardcoded.
3. Run `yarn site:backfill-whatsapp-members --remote --apply --confirm-production`.
4. Deliver each newly created invitation through the Meta-approved access-invitation template. Repeated backfill runs reuse active memberships and pending invitations and do not intentionally resend messages.
5. Monitor `notifications.status = 'blocked'` with `error = 'recipient_access_pending'`. These rows are the audit record for operational messages withheld before activation.

The deployment must not enable a new WhatsApp template until its live Meta definition has been checked for approved status and exact parameter ordering. Local credentials were unavailable during implementation, so template provisioning and the first live delivery remain an explicit rollout operation.
