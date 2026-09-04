# Notification testing

KrabiClaw has two distinct records:

- `notifications` is the dashboard acknowledgement feed. A notification is unread for a user until the corresponding `notification_reads` row exists.
- `guest_thread_deliveries` records external email or WhatsApp outcomes for guest-thread entries. It is not a dashboard feed.

Do not infer an external send from a dashboard notification, or an unread item from a delivery receipt.

## Local verification

Local development and preview use log-only delivery modes. A log-only send must still write a terminal `guest_thread_deliveries` receipt with a `log-only:` provider message ID when the send belongs to a guest thread.

Verify a guest submission through the real Worker boundary:

1. Submit a contact message, reservation, or experience booking.
2. Confirm that one guest thread and its opening entry exist.
3. Confirm that the owner dashboard notification references that thread and entry.
4. Confirm that configured owner channels and the guest acknowledgement have delivery receipts with stable idempotency keys.
5. Open the thread as a dashboard user and confirm that `notification_reads` records the acknowledgement for that user only.
6. Confirm that the organization WebSocket emits the typed invalidation and that disconnecting it shows the dashboard failure state.

For inbound replies, use the development inbound email or WhatsApp route. Repeating the same provider message ID must return the existing entry instead of appending another one.

## Production canary

Production delivery checks are an authorized release operation. Follow [release-flow.md](operations/release-flow.md) and use `yarn canary:notifications` only with the documented production credentials and approval. The canary reads `guest_thread_deliveries` for provider outcomes and writes its result to `canary_runs`.

Never use a canary to provision resources, change delivery modes, or repair data.
