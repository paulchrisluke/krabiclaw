import { createDb, execute, queryFirst } from '~/server/db'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { attemptEmailDelivery, getDeliveryById } from '~/server/domain/guest-threads/deliveries'
import { getGuestThreadById } from '~/server/domain/guest-threads/repository'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'
import type { GuestDeliveryQueueMessage } from '~/server/domain/guest-threads/outbox-publisher'
import { publishGuestInboxThreadEvent } from './guest-inbox-events'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'

export interface GuestDeliveryWorkerEnv extends ReplyEmailEnv {
  DB: D1Database
  DB_WRITE_FROZEN?: string
  GUEST_DELIVERY_QUEUE?: Queue<GuestDeliveryQueueMessage>
  GUEST_INBOX_HUBS?: DurableObjectNamespace
  [key: string]: unknown
}

export async function processGuestDelivery(
  env: GuestDeliveryWorkerEnv,
  message: GuestDeliveryQueueMessage,
): Promise<void> {
  const db = createDb(env.DB)
  const delivery = await getDeliveryById(db, message.deliveryId)
  if (!delivery || delivery.status === 'sent') return
  const now = new Date().toISOString()
  const leaseUntil = new Date(Date.now() + 2 * 60_000).toISOString()
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET processing_lease_until = ?, updated_at = ?
    WHERE id = ?
      AND status IN ('queued', 'failed')
      AND (processing_lease_until IS NULL OR processing_lease_until <= ?)
  `, [leaseUntil, now, delivery.id, now])
  const claimedDelivery = await getDeliveryById(db, message.deliveryId)
  if (!claimedDelivery || claimedDelivery.processing_lease_until !== leaseUntil) return

  const threadSite = await queryFirst<{ site_id: string }>(db, `SELECT site_id FROM guest_threads WHERE id = ? LIMIT 1`, [claimedDelivery.thread_id])
  const thread = threadSite ? await getGuestThreadById(db, claimedDelivery.thread_id, threadSite.site_id) : null
  if (!thread) throw new Error(`Guest thread not found for delivery ${delivery.id}`)

  const adapter = getAdapter(thread.submission_type)
  const outcome = await attemptEmailDelivery(db, {
    delivery: claimedDelivery,
    env,
    submissionType: thread.submission_type,
    submissionId: thread.submission_id,
  })

  const eventName = outcome.success ? 'delivery.sent' : 'delivery.failed'
  const conversationState = claimedDelivery.entry_id
    ? await queryFirst<{ kind: string }>(db, `SELECT kind FROM guest_thread_entries WHERE id = ? LIMIT 1`, [claimedDelivery.entry_id])
    : null
  const nextState = outcome.success
    ? conversationState?.kind === 'message'
      ? nextConversationState(thread.conversation_state, { type: 'owner_reply_sent' })
      : nextConversationState(thread.conversation_state, { type: 'operation_succeeded', notificationOutcome: 'sent' })
    : nextConversationState(thread.conversation_state, { type: 'operation_succeeded', notificationOutcome: 'failed' })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'system',
    channel: claimedDelivery.channel,
    eventName,
    payloadJson: { outboxId: message.outboxId, deliveryId: claimedDelivery.id, error: outcome.error ?? null },
  })

  await execute(db, `
    UPDATE guest_threads
    SET conversation_state = ?, version = version + 1, updated_at = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END
    WHERE id = ?
  `, [nextState, now, nextState, now, thread.id])

  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!outcome.success) {
    await appendEntry(db, {
      threadId: thread.id,
      organizationId: thread.organization_id,
      siteId: thread.site_id,
      kind: 'delivery',
      actorKind: 'system',
      channel: claimedDelivery.channel,
      eventName: 'delivery.retry_available',
      payloadJson: { deliveryId: claimedDelivery.id, sourceFound: Boolean(source) },
    })
  }

  await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'delivery.changed' })

  if (!outcome.success) throw new Error(outcome.error ?? 'Guest delivery failed')
}
