# Issue 820 messaging architecture

## Decision

KrabiClaw will use four durable concepts for guest messaging.

1. Source tables own reservation, experience booking, and contact state.
2. `guest_thread_entries` owns ordered conversation facts and message content.
3. `notifications` and `notification_reads` own member attention and acknowledgement.
4. A narrow `guest_thread_deliveries` table owns external send outcomes and WhatsApp reply correlation.

D1 remains authoritative. The dashboard Durable Object remains only as an authorized WebSocket fanout adapter. The guest delivery Queue, outbox, generic command Durable Object, independent thread read cursors, notification audit log, and Discord delivery path are removed.

This prerequisite does not add the Today UI or reservation change-request feature from PR 796. It leaves a simple conditional mutation boundary for that work.

## Caller usage

Public submission routes perform the existing capacity-safe source insert, open the thread, and dispatch the existing external messages.

```ts
const reservation = await createReservation(db, input)
const thread = await openGuestThread(db, {
  source: { kind: 'reservation', id: reservation.id },
})

await notifyReservationCreated(env, db, {
  reservation,
  threadId: thread.id,
  openingEntryId: thread.openingEntryId,
})
```

Restaurant reservations are created as `confirmed`. They do not wait for a tenant confirmation. The existing capacity predicate remains part of the source insert.

The main Worker receives raw Email Routing messages. MIME parsing and address validation happen at the transport boundary. The handler calls the same inbound guest-message use case as other channels.

```ts
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:email', async ({ message, env }) => {
    await receiveGuestEmail(env as CloudflareEnv, message)
  })
})
```

Dashboard routes perform Better Auth organization and Teams checks, then call ordinary domain functions. They do not call a command Durable Object.

```ts
const result = await actOnGuestThread(db, env, {
  threadId,
  siteId,
  actorUserId: session.user.id,
  operation: { kind: 'reply', body, idempotencyKey },
})
```

Opening a thread acknowledges its visible mapped notifications for that user.

```ts
await acknowledgeThreadNotifications(db, {
  threadId,
  userId: session.user.id,
  visibility,
})
```

## Domain shape

```ts
type SubmissionRef =
  | { kind: 'contact'; id: string }
  | { kind: 'reservation'; id: string }
  | { kind: 'experience_booking'; id: string }

type ConversationState = 'needs_attention' | 'waiting_on_guest' | 'resolved'

type EntryKind = 'submission' | 'message' | 'operation' | 'assignment' | 'resolution'
type EntryActor = 'guest' | 'member' | 'system'
type EntryChannel = 'web' | 'email' | 'whatsapp' | 'system'

interface AppendEntryInput {
  threadId: string
  kind: EntryKind
  actor: EntryActor
  actorUserId: string | null
  channel: EntryChannel | null
  body: string | null
  eventName: string | null
  payload: Record<string, unknown> | null
  dedupeKey: string
  occurredAt: string
}

type DeliveryPurpose =
  | 'owner_alert'
  | 'guest_acknowledgement'
  | 'member_reply'
  | 'status_update'

type DeliveryStatus =
  | 'pending'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'unknown'

interface GuestThreadDelivery {
  id: string
  threadId: string
  entryId: string
  channel: 'email' | 'whatsapp'
  provider: 'resend' | 'meta' | 'log_only'
  purpose: DeliveryPurpose
  idempotencyKey: string
  status: DeliveryStatus
  providerMessageId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}
```

The delivery row stores no recipient, message body, template variables, source snapshot, organization, site, location, retry lease, or attempt counter. The entry and thread provide its ownership. The row exists because external sends cross a transactional boundary, email failures must remain visible, Meta receipts arrive later, and quoted WhatsApp replies need a provider ID to thread mapping.

Non-thread email and WhatsApp functions use the same provider adapters but do not create an unrelated guest-thread delivery row.

## Atomic persistence

Every append uses one D1 statement to allocate `MAX(sequence) + 1` and insert the entry. The unique `(thread_id, sequence)` constraint remains the integrity backstop. This removes the sequence counter.

Every attempt uses a fresh random entry ID and a stable semantic deduplication key. Dependent statements in the same D1 batch are gated by the fresh entry ID. A retry loses the deduplication conflict and cannot update the source or bump the thread because its fresh entry ID does not exist.

```sql
INSERT INTO guest_thread_entries (..., id, dedupe_key, sequence, ...)
SELECT ..., :fresh_entry_id, :stable_dedupe_key,
       COALESCE(MAX(sequence), 0) + 1, ...
FROM guest_thread_entries
WHERE thread_id = :thread_id
ON CONFLICT(dedupe_key) DO NOTHING;

UPDATE guest_threads
SET conversation_state = :next_state, updated_at = :now
WHERE id = :thread_id
  AND EXISTS (
    SELECT 1 FROM guest_thread_entries WHERE id = :fresh_entry_id
  );
```

The implementation must prove the exact SQLite statement shape. The example expresses the gating rule, not migration SQL.

Source mutations, their operation entry, and their thread-state change execute in one D1 batch. The entry insert selects only an eligible source row. The source update and thread update both require the fresh entry ID. Concurrent batches therefore serialize through D1, and a retry cannot replay the mutation.

An outbound member reply crosses the provider boundary in three explicit stages.

1. One D1 batch inserts the message entry and `pending` delivery receipt.
2. The provider adapter sends with the receipt's stable idempotency key.
3. One D1 batch records the result and moves the thread to `waiting_on_guest` only after provider acceptance.

A definitive failure remains visible on the delivery. A timeout becomes `unknown`. Meta `unknown` is never retried blindly. A Resend retry may reuse its provider idempotency key. There is no background retry, Queue, or outbox.

## Acknowledgement and realtime

A thread is unread for a user when at least one visible notification mapped to that thread lacks a `(notification_id, user_id)` row in `notification_reads`.

Only opening submissions and inbound guest messages create thread notifications. Member messages, operations, resolution entries, and provider delivery changes do not create unread attention. This prevents self-sent messages and delivery receipts from producing phantom unread state.

Visibility is always applied before acknowledgement or counting. It includes organization membership, Teams location access, and `target_user_id` filtering. Acknowledgement does not resolve the conversation and does not change a reservation.

The organization-scoped dashboard WebSocket publishes small invalidations for thread and notification changes. Clients refetch authoritative HTTP data after an invalidation or reconnect. They expose a connection failure and an explicit refresh action. They do not poll on an interval.

## Schema disposition

Keep and narrow:

- `guest_threads` for conversation identity and `conversation_state`
- `guest_thread_entries` for ordered facts and message content
- `guest_thread_deliveries` for thread-owned external send outcomes
- `notifications` for dashboard audience and presentation
- `notification_reads` as the only acknowledgement state
- `organization_events` for its unrelated activity-feed readers and writers

Delete:

- `guest_thread_sequence_counters`
- `guest_thread_member_state`
- `guest_thread_commands`
- `guest_thread_outbox`
- `notification_events`
- `notification_deliveries`
- copied source status, unread counters, cursors, preview fields, and never-maintained timestamps
- transport fields from `notifications`
- delivery facts from `guest_thread_entries`
- guest-source duplicate writes to `organization_events`

`notifications` gains a nullable `guest_thread_id` and `source_entry_id`. The latter is unique when present, so one inbound fact cannot create two dashboard attention records.

`guest_thread_deliveries` has a composite foreign key that proves its entry belongs to its thread. Provider and channel combinations are constrained. Provider message IDs are unique within a provider. Its idempotency key is globally unique.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `server/domain/guest-threads/repository.ts` | Open and query a thread. Derive source state and latest entry data instead of copying them. |
| `server/domain/guest-threads/entries.ts` | Append one sequenced, deduplicated fact. No notification, socket, or provider side effects. |
| `server/domain/guest-threads/operations.ts` | Run conditional source and conversation mutations. Coordinate direct replies. |
| `server/domain/guest-threads/deliveries.ts` | Persist the narrow receipt and apply provider outcomes. No queue or retry engine. |
| `server/utils/notification-center.ts` | Create dashboard notifications and acknowledgements. |
| `server/utils/notifications.ts` | Build event-specific copy, select recipients, and call the canonical dashboard and provider functions. |
| `server/utils/email-delivery.ts` | Own Resend and log-only email transport. |
| `server/utils/whatsapp.ts` | Own Meta templates, transport, receipt parsing, and post-success credit charging. |
| `server/plugins/cloudflare-email.ts` | Parse raw MIME and call the inbound email use case. |
| `server/cloudflare/durable-objects/guest-inbox-hub.ts` | Fan out authorized organization invalidations. No domain state. |

The separate email Worker, internal HTTP forwarding endpoint, shared inbound secret, Queue consumer, outbox publisher, command object, and their bindings are deleted after their callers move.

## Database epoch and release boundary

The target schema rebuilds referenced parent tables. Epoch 4 staging has already applied its committed baseline, so its migration and metadata are immutable. An ordinary migration cannot safely reach this shape. The cleanup therefore requires the next explicit database epoch.

The implementation may prepare the generated baseline, transformer, verifier, and cutover runbook in Git. It must not provision resources, change bindings, change Email Routing, import shared data, deploy, or perform a cutover without the release gates and explicit authorization in the canonical operations documents.

The owner has already specified no inbox or notification backfill. The epoch verifier must still report the omitted source table counts and must copy every unrelated table exactly. It must preserve `organization_events` rows even after guest-specific duplicate writers are removed.

Inbound email uses one hard routing cutover after the main Worker hook passes a raw-MIME runtime check. The old Worker and HTTP endpoint do not remain as a fallback.

## Verification contract

The change is complete only when all of these checks pass.

- Schema drift, migration lint, migration tests, typecheck, lint, and build
- A source-to-target epoch transform with non-empty omitted tables, logical hashes, foreign-key checks, and integrity checks
- Contact, restaurant reservation, and experience booking submission through the local Worker and D1
- Automatic restaurant confirmation with the existing capacity race still admitting only valid capacity
- Duplicate raw MIME delivery producing one entry and one notification
- Email and WhatsApp success, definitive failure, and ambiguous timeout receipts
- WhatsApp receipt reordering without status regression
- Quoted WhatsApp reply correlation with Better Auth and Teams authorization
- One member acknowledging a thread without changing another member's unread state
- Self-sent messages and receipt updates producing no unread notification
- Organization WebSocket isolation, reconnect refetch, visible failure, and no interval polling
- Repository searches proving deleted tables, bindings, secrets, endpoints, and workers have no runtime callers
- A net decrease in handwritten production code

Production provider sends and shared-environment writes remain prohibited without their existing explicit canary and release authorization.
