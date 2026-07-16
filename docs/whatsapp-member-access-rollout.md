# WhatsApp member access rollout

Operational WhatsApp recipients must have an active organization membership and a matching site or location scope before KrabiClaw sends dashboard deep links.

## Staging

1. Deploy migration `0051` and `0052` before application code.
2. Run `yarn site:backfill-whatsapp-members --staging --dry-run` and review every configured recipient and proposed action.
3. Run `yarn site:backfill-whatsapp-members --staging --apply`.
4. Confirm Meta has approved `dashboard_access_invitation`. Production apply refuses to run while it is missing or pending. Normal operational messages remain blocked until acceptance.
5. Verify phone OTP acceptance, scope materialization, scoped navigation, direct API denial, and notification resumption.

## Production

1. Deploy the migrations and application authorization support first. This intentionally fails closed for recipients whose access is incomplete.
2. Run `yarn site:backfill-whatsapp-members --remote --dry-run`. Confirm Kikuzuki, Pottery House, and every other configured number appear from live data; client names and numbers are never hardcoded.
3. Run `yarn site:backfill-whatsapp-members --remote --apply --confirm-production`.
4. Apply sends `dashboard_access_invitation` once for each newly created invitation. Repeated runs reuse active memberships and pending invitations; use `--resend` only for an intentional resend.
5. Monitor `notifications.status = 'blocked'` with `error = 'recipient_access_pending'`. These rows are the audit record for operational messages withheld before activation.

Meta template `dashboard_access_invitation` (ID `955717257520755`) is approved as an `en_US` utility template. Its contract is body parameter 1 = site name and URL-button parameter 1 = invitation path suffix. Production apply still re-checks live approval before writing.
