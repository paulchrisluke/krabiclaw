import { queryFirst, type DbClient } from '~/server/db'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'
import { getAdapter } from './adapters/registry'
import { appendEntry, getEntryById, getLatestEntryByKind } from './entries'
import { attemptEmailDelivery, createDeliveryIntent, getDeliveryById } from './deliveries'
import { getGuestThreadById, updateThreadProjection } from './repository'
import { advanceMemberCursor } from './read-state'
import { nextConversationState } from './state-machine'
import type { AnyGuestThreadSourceAdapter, GuestThreadRow } from './types'

export type OperationOutcome =
  | { ok: true; thread: GuestThreadRow; availableActions: string[] }
  | { ok: false; status: 404; reason: 'thread_not_found' | 'source_not_found' | 'delivery_not_found' }
  | { ok: false; status: 409; reason: 'invalid_transition'; message: string }
  | { ok: false; status: 400; reason: 'no_guest_email' | 'empty_body' }

export interface ExecuteOperationInput {
  threadId: string
  siteId: string
  action: string
  actorUserId: string
  actorMemberId: string
  body?: string
  deliveryId?: string
  env: ReplyEmailEnv
}

async function loadThreadContext(db: DbClient, threadId: string, siteId: string) {
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return null
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!source) return null
  return { thread, adapter, source }
}

async function getSiteBrandName(db: DbClient, siteId: string): Promise<string> {
  const row = await queryFirst<{ brand_name: string | null }>(db, `SELECT brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId])
  return row?.brand_name || 'KrabiClaw'
}

function operationSubject(action: string, fromName: string): string {
  if (action === 'confirm') return `Your reservation at ${fromName} is confirmed`
  if (action === 'cancel') return `Your booking at ${fromName} was cancelled`
  if (action === 'complete') return `Thanks for visiting ${fromName}`
  return `Update on your booking at ${fromName}`
}

function operationBody(action: string, adapter: AnyGuestThreadSourceAdapter, source: unknown): string {
  const detail = adapter.buildCurrentDetail(source)
  const fields = detail.fields as Record<string, unknown>
  if (adapter.type === 'reservation') {
    const context = `${fields.date} at ${fields.time} for ${fields.guests} guests`
    if (action === 'confirm') return `Your reservation is confirmed: ${context}.`
    if (action === 'cancel') return `Your reservation for ${context} has been cancelled.`
    if (action === 'complete') return `Thanks for dining with us! We hope you enjoyed your visit on ${fields.date}.`
  }
  if (adapter.type === 'experience_booking') {
    const context = `${fields.bookingDate} at ${fields.timeSlot} for ${fields.partySize} guests`
    if (action === 'confirm') return `Your booking is confirmed: ${context}.`
    if (action === 'cancel') return `Your booking for ${context} has been cancelled.`
  }
  return `Your booking status has been updated to reflect a recent change.`
}

/**
 * Canonical guest-thread operation service (issue #442 Locked Decision #8). The sole
 * write path for confirm/cancel/complete/resolve/reopen/reply — the inbox and editor
 * PATCH routes must delegate here rather than mutating source records directly.
 */
export async function executeGuestThreadOperation(db: DbClient, input: ExecuteOperationInput): Promise<OperationOutcome> {
  const context = await loadThreadContext(db, input.threadId, input.siteId)
  if (!context) return { ok: false, status: 404, reason: 'thread_not_found' }
  const { thread, adapter, source } = context

  if (input.action === 'reply') {
    return await executeReply(db, input, thread, adapter, source)
  }
  if (input.action === 'resolve') {
    return await executeManualTransition(db, thread, 'manual_resolve', 'resolved', input.actorUserId)
  }
  if (input.action === 'reopen') {
    return await executeManualTransition(db, thread, 'manual_reopen', 'reopened', input.actorUserId)
  }
  if (input.action === 'retry_delivery') {
    return await executeRetryDelivery(db, input, thread, adapter, source)
  }

  const availableActions = adapter.listAvailableActions(source)
  if (!availableActions.includes(input.action)) {
    return {
      ok: false,
      status: 409,
      reason: 'invalid_transition',
      message: `"${input.action}" is not a valid action for the current state`,
    }
  }

  const result = await adapter.executeAction(
    { db, actorUserId: input.actorUserId, actorMemberId: input.actorMemberId },
    source,
    input.action,
  )
  if (!result.ok) {
    return { ok: false, status: 409, reason: 'invalid_transition', message: result.message }
  }

  await updateThreadProjection(db, thread.id, { operationalStatus: result.afterStatus })

  const operationEntry = await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'operation',
    actorKind: 'member',
    actorUserId: input.actorUserId,
    eventName: `${adapter.type}.${input.action}`,
    payloadJson: { action: input.action, beforeStatus: result.beforeStatus, afterStatus: result.afterStatus },
  })

  let notificationOutcome: 'not_required' | 'sent' | 'failed' = 'not_required'

  if (result.requiresNotification) {
    const summary = adapter.summarize(source)
    if (!summary.guestEmail) {
      notificationOutcome = 'failed'
      await appendEntry(db, {
        threadId: thread.id,
        organizationId: thread.organization_id,
        siteId: thread.site_id,
        kind: 'delivery',
        actorKind: 'system',
        eventName: 'delivery.skipped_no_channel',
        payloadJson: { action: input.action, reason: 'no_guest_email' },
      })
    } else {
      const fromName = await getSiteBrandName(db, thread.site_id)
      const idempotencyKey = `guest-thread-op:${operationEntry.id}`
      const delivery = await createDeliveryIntent(db, {
        threadId: thread.id,
        entryId: operationEntry.id,
        channel: 'email',
        idempotencyKey,
        toAddress: summary.guestEmail,
      })

      const { success, error } = await attemptEmailDelivery(db, {
        delivery,
        env: input.env,
        to: summary.guestEmail,
        fromName,
        subject: operationSubject(input.action, fromName),
        body: operationBody(input.action, adapter, source),
        submissionType: adapter.type,
        submissionId: thread.submission_id,
      })

      notificationOutcome = success ? 'sent' : 'failed'
      await appendEntry(db, {
        threadId: thread.id,
        organizationId: thread.organization_id,
        siteId: thread.site_id,
        kind: 'delivery',
        actorKind: 'system',
        channel: 'email',
        eventName: success ? 'delivery.sent' : 'delivery.failed',
        payloadJson: { action: input.action, deliveryId: delivery.id, error: error ?? null },
      })
    }
  }

  const conversationState = nextConversationState(thread.conversation_state, {
    type: 'operation_succeeded',
    notificationOutcome,
  })
  await updateThreadProjection(db, thread.id, { conversationState })

  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  const refreshedSource = await adapter.loadSource({ db }, thread.submission_id)
  const refreshedActions = refreshedSource ? adapter.listAvailableActions(refreshedSource) : []

  return { ok: true, thread: refreshedThread ?? thread, availableActions: refreshedActions }
}

async function executeManualTransition(
  db: DbClient,
  thread: GuestThreadRow,
  trigger: 'manual_resolve' | 'manual_reopen',
  eventName: 'resolved' | 'reopened',
  actorUserId: string,
): Promise<OperationOutcome> {
  const conversationState = nextConversationState(thread.conversation_state, { type: trigger })
  await updateThreadProjection(db, thread.id, { conversationState })
  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'resolution',
    actorKind: 'member',
    actorUserId,
    eventName: `thread.${eventName}`,
  })
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  const availableActions = source ? adapter.listAvailableActions(source) : []
  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  return { ok: true, thread: refreshedThread ?? thread, availableActions }
}

/**
 * Retries a previously failed delivery using the same durable intent row (no new
 * idempotency key/entry is created — this is a re-attempt of the existing intent, not a
 * new send). Reconstructs the message content from the delivery's associated ledger
 * entry: a `message` entry's body is resent verbatim; an `operation` entry's
 * confirm/cancel/complete notification is recomposed from the adapter's *current*
 * source detail (the transactional content, e.g. reservation date/time, is still
 * accurate even if other fields changed since).
 */
async function executeRetryDelivery(
  db: DbClient,
  input: ExecuteOperationInput,
  thread: GuestThreadRow,
  adapter: AnyGuestThreadSourceAdapter,
  source: unknown,
): Promise<OperationOutcome> {
  if (!input.deliveryId) {
    return { ok: false, status: 400, reason: 'empty_body' }
  }
  const delivery = await getDeliveryById(db, input.deliveryId)
  if (!delivery || delivery.thread_id !== thread.id) {
    return { ok: false, status: 404, reason: 'delivery_not_found' }
  }
  if (!delivery.to_address) {
    return { ok: false, status: 400, reason: 'no_guest_email' }
  }

  const entry = delivery.entry_id ? await getEntryById(db, delivery.entry_id) : null
  const fromName = await getSiteBrandName(db, thread.site_id)

  let subject: string
  let body: string
  if (entry?.kind === 'message' && entry.body) {
    subject = thread.submission_type === 'contact'
      ? `Re: your message to ${fromName}`
      : thread.submission_type === 'reservation'
        ? `Re: your reservation at ${fromName}`
        : `Re: your booking at ${fromName}`
    body = entry.body
  } else {
    const action = entry?.payload_json ? (JSON.parse(entry.payload_json) as { action?: string }).action ?? 'confirm' : 'confirm'
    subject = operationSubject(action, fromName)
    body = operationBody(action, adapter, source)
  }

  const { success, error } = await attemptEmailDelivery(db, {
    delivery,
    env: input.env,
    to: delivery.to_address,
    fromName,
    subject,
    body,
    submissionType: adapter.type,
    submissionId: thread.submission_id,
  })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'member',
    actorUserId: input.actorUserId,
    channel: 'email',
    eventName: success ? 'delivery.retry_sent' : 'delivery.retry_failed',
    payloadJson: { deliveryId: delivery.id, error: error ?? null },
  })

  // A successful reply-message retry doesn't itself change conversation state further —
  // the original reply already moved the thread to waiting_on_guest when it was first
  // sent (or attempted). Only an operation-notification retry (confirm/cancel/complete)
  // completes the state-machine's "operation succeeded + notification sent" transition,
  // since that transition was deliberately withheld while the notification was failing.
  if (success && entry?.kind !== 'message') {
    const conversationState = nextConversationState(thread.conversation_state, {
      type: 'operation_succeeded',
      notificationOutcome: 'sent',
    })
    await updateThreadProjection(db, thread.id, { conversationState })
  }

  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  const availableActions = adapter.listAvailableActions(source)
  return { ok: true, thread: refreshedThread ?? thread, availableActions }
}

async function executeReply(
  db: DbClient,
  input: ExecuteOperationInput,
  thread: GuestThreadRow,
  adapter: AnyGuestThreadSourceAdapter,
  source: unknown,
): Promise<OperationOutcome> {
  const summary = adapter.summarize(source)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }

  const replyBody = (input.body ?? '').trim()
  if (!replyBody) return { ok: false, status: 400, reason: 'empty_body' }

  // Duplicate-send guard: an identical reply within the last 30s is treated as the same
  // submission (client retry after a network error), not sent again.
  const recent = await getLatestEntryByKind(db, thread.id, ['message'])
  const dedupeWindowStart = Date.now() - 30_000
  if (
    recent
    && recent.actor_kind === 'member'
    && recent.body === replyBody
    && new Date(recent.created_at).getTime() > dedupeWindowStart
  ) {
    const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
    const availableActions = adapter.listAvailableActions(source)
    return { ok: true, thread: refreshedThread ?? thread, availableActions }
  }

  // Message + delivery intent are persisted before the send attempt — the canonical
  // history entry exists even if the provider call subsequently fails (issue #442
  // Locked Decision #9: "no state where email was sent but the conversation has no
  // durable message/intent record").
  const messageEntry = await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'message',
    actorKind: 'member',
    actorUserId: input.actorUserId,
    channel: 'email',
    body: replyBody,
  })

  const fromName = await getSiteBrandName(db, thread.site_id)
  const subject = thread.submission_type === 'contact'
    ? `Re: your message to ${fromName}`
    : thread.submission_type === 'reservation'
      ? `Re: your reservation at ${fromName}`
      : `Re: your booking at ${fromName}`

  const delivery = await createDeliveryIntent(db, {
    threadId: thread.id,
    entryId: messageEntry.id,
    channel: 'email',
    idempotencyKey: `guest-thread-reply:${messageEntry.id}`,
    toAddress: summary.guestEmail,
  })

  const { success, error } = await attemptEmailDelivery(db, {
    delivery,
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject,
    body: replyBody,
    submissionType: adapter.type,
    submissionId: thread.submission_id,
  })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'system',
    channel: 'email',
    eventName: success ? 'delivery.sent' : 'delivery.failed',
    payloadJson: { action: 'reply', deliveryId: delivery.id, error: error ?? null },
  })

  await advanceMemberCursor(db, thread.id, input.actorMemberId, messageEntry.id)

  const conversationState = nextConversationState(thread.conversation_state, { type: 'owner_reply_sent' })
  await updateThreadProjection(db, thread.id, { conversationState })

  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  const availableActions = adapter.listAvailableActions(source)
  return { ok: true, thread: refreshedThread ?? thread, availableActions }
}
