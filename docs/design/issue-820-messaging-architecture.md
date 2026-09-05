# Issue 820 messaging architecture

## Decision

D1 is authoritative. Source tables own reservation, experience-booking, and
contact state. `guest_threads` identifies the conversation;
`guest_thread_entries` records its ordered facts; `guest_thread_deliveries`
records provider outcomes; `notifications` presents member attention; and
`notification_reads` records per-user acknowledgement.

The dashboard Durable Object only fans out authorized invalidations. It owns no
domain state. Queue delivery, the outbox, the generic command object, sequence
counters, independent thread cursors, the notification audit/delivery pair,
Discord delivery, and the separate inbound-email Worker are deleted.

This is the prerequisite for PR #796. It does not duplicate that PR's Today UI
or reservation change-request behavior.

## Keep, delete, and merge audit

| Fact | Canonical owner | Disposition | Evidence and invariant |
| --- | --- | --- | --- |
| Submission status, guest details, and opening context | Source submission table | Keep | A thread references the source; it does not copy source fields into the thread or opening entry. |
| Conversation identity and workflow state | `guest_threads` | Keep and narrow | One row per `(submission_type, submission_id)`; organization, site, and location live here once. |
| Ordered message/operation fact | `guest_thread_entries` | Keep and narrow | It contains `thread_id`, sequence, actor, message or operation content, semantic dedupe key, and timestamps. The opening submission entry is a marker; its context derives from the source. Organization/site derive through the thread. |
| External send outcome and quoted-reply correlation | `guest_thread_deliveries` | Keep and narrow | It references only `entry_id`; thread and tenant derive through the entry. The stable primary key is also the provider idempotency key, so separate `thread_id` and `idempotency_key` columns are deleted. |
| Member-facing attention | `notifications` | Keep and narrow | It stores audience scope, presentation, optional source entry, and timestamp. Thread derives through `source_entry_id`; `template` is the single discriminator. Duplicate `guest_thread_id`, `event_type`, actor, and payload fields are deleted. |
| Per-user acknowledgement | `notification_reads` | Keep | This is a normalized many-to-many fact. Folding it into notifications or threads would reintroduce per-user columns/cursors and lose multi-member semantics. |
| General organization activity feed | `organization_events` | Keep for unrelated activity | Existing readers cover domain, content, billing, member, and work-request history. Guest submission/status writers are removed so it is not a second guest fact store. |
| Queue/outbox/command/retry leases | none | Delete | Direct provider orchestration records the delivery receipt before send and its outcome after send. There is no background retry engine. |
| Notification audit and transport delivery | canonical entry/delivery/notification rows | Merge then delete | `notification_events` and `notification_deliveries` duplicated facts now owned by the three narrow tables above. |

No historical inbox or notification rows are backfilled at the Epoch 4 cutover.
The transformer reports discarded counts and preserves every unrelated table by
typed logical hash.

## Write boundaries

Public submission routes perform the capacity-safe source insert, open one
thread, append its submission marker, create one dashboard notification pointing
to that entry, and send through the existing provider adapters.

Dashboard routes perform Better Auth organization and Teams authorization, then
call ordinary domain functions. They do not invoke a command Durable Object.
Opening a thread acknowledges only visible notifications whose source entries
belong to that thread.

Every entry append allocates `MAX(sequence) + 1` and inserts in one D1 statement.
The unique `(thread_id, sequence)` constraint remains the concurrency backstop.
A fresh row ID and stable semantic `dedupe_key` gate dependent updates in the
same batch, so retries cannot repeat source mutations.

An outbound reply has three explicit stages:

1. A D1 batch inserts the message entry and a `pending` delivery whose ID is the
   stable provider idempotency key.
2. The provider adapter sends using that ID.
3. D1 records `accepted`, `sent`, `delivered`, `read`, `failed`, or `unknown` and
   moves the thread only after provider acceptance.

A definitive failure remains visible. A timeout becomes `unknown`. Meta
`unknown` is never retried blindly. Resend may retry with the same delivery ID.

## Acknowledgement and realtime

A thread is unread for a user when a visible notification points to one of its
entries and lacks that user's `(notification_id, user_id)` row. Only opening
submissions and inbound guest messages create unread attention. Member replies,
operations, resolutions, and delivery receipts do not.

Visibility is applied before counting or acknowledgement and includes
organization membership, Teams location access, and `target_user_id`. Reading a
thread does not resolve it or mutate its source submission.

The organization-scoped WebSocket carries only invalidations. Clients refetch
authoritative HTTP data after invalidation or reconnect and expose connection
failure plus an explicit refresh action; they do not interval-poll.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `server/domain/guest-threads/repository.ts` | Open/query threads and derive source and entry projections. |
| `server/domain/guest-threads/entries.ts` | Append one sequenced, deduplicated fact. |
| `server/domain/guest-threads/operations.ts` | Coordinate conditional source mutations and direct replies. |
| `server/domain/guest-threads/deliveries.ts` | Persist the narrow receipt and provider outcome. |
| `server/utils/notification-center.ts` | Create dashboard attention records. |
| `server/utils/notification-acknowledgement.ts` | Record visible per-user reads. |
| `server/utils/notifications.ts` | Build event copy, choose recipients, and call canonical dashboard/provider functions. |
| `server/utils/email-delivery.ts` | Resend and log-only transport. |
| `server/utils/whatsapp.ts` | Meta templates and transport. |
| `server/plugins/cloudflare-email.ts` | Parse raw MIME and call the shared inbound-email use case. |
| `server/cloudflare/durable-objects/guest-inbox-hub.ts` | Fan out authorized invalidations only. |

## Epoch and release boundary

These changes correct Epoch 4 before it reaches production. Staging is a
standalone qualification database and may be reset or reprovisioned during an
unreleased epoch using the canonical Epoch 4 runbook. That does not make an
applied migration ledger mutable. Once Epoch 4 reaches production, its baseline
and migration history are immutable and production retains Epoch 3 as rollback
state through the cutover window.

The pull request may prepare schema, generated baseline, transformer, verifier,
and runbook. It must not reset staging, provision resources, change bindings,
import shared data, deploy, or cut over production without the target checks and
authorization required by the operations documents.

## Verification contract

- Schema drift, migration lint/tests, typecheck, lint, and build pass.
- The Epoch 3-to-4 transform proves unrelated-table hashes, declared field
  projections, discarded messaging counts, foreign keys, and integrity.
- Contact, reservation, experience-booking, inbound email, WhatsApp, member
  reply, acknowledgement, and realtime journeys pass through the real Worker.
- Provider success, failure, timeout, replay, and out-of-order receipts preserve
  the delivery state machine.
- Repository searches find no runtime caller for deleted tables, bindings,
  secrets, endpoint, Worker, or duplicate columns.
- Tenant/public browser coverage runs on the exact candidate SHA.

Production provider sends and shared-environment writes remain prohibited
without their existing explicit canary and release authorization.
