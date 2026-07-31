import { createHash } from 'node:crypto'
import { execute, queryFirst, type DbClient } from '~/server/db'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'
import { getAdapter } from './adapters/registry'
import { appendEntry } from './entries'
import { createDeliveryIntent, createDeliveryOutbox, getDeliveryById } from './deliveries'
import { getGuestThreadById, updateThreadProjection } from './repository'
import { advanceMemberCursor } from './read-state'
import { nextConversationState } from './state-machine'
import type { AnyGuestThreadSourceAdapter, GuestThreadCommandRow, GuestThreadRow } from './types'

const COMMAND_PENDING_LEASE_MS = 2 * 60_000

export type OperationOutcome =
  | { ok: true; thread: GuestThreadRow; availableActions: string[] }
  | { ok: false; status: 404; reason: 'thread_not_found' | 'source_not_found' | 'delivery_not_found' }
  | { ok: false; status: 409; reason: 'invalid_transition'; message: string }
  | { ok: false; status: 400; reason: 'no_guest_email' | 'empty_body' | 'missing_delivery_id' }
  | { ok: false; status: 400; reason: 'missing_idempotency_key' }

type StoredCommandResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409; reason: Exclude<OperationOutcome, { ok: true }>['reason']; message?: string }

export interface ExecuteOperationInput {
  threadId: string
  siteId: string
  action: string
  actorUserId: string
  actorMemberId: string
  body?: string
  deliveryId?: string
  env: ReplyEmailEnv
  idempotencyKey?: string
}

async function loadThreadContext(db: DbClient, threadId: string, siteId: string) {
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return null
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!source) return null
  return { thread, adapter, source }
}

function commandRequestHash(input: ExecuteOperationInput): string {
  return createHash('sha256').update(JSON.stringify({
    action: input.action,
    body: input.body ?? null,
    deliveryId: input.deliveryId ?? null,
  })).digest('hex')
}

async function getStoredCommandOutcome(
  db: DbClient,
  thread: GuestThreadRow,
  input: ExecuteOperationInput,
): Promise<OperationOutcome | null> {
  if (!input.idempotencyKey) return { ok: false, status: 400, reason: 'missing_idempotency_key' }
  const existing = await queryFirst<GuestThreadCommandRow>(db, `
    SELECT * FROM guest_thread_commands
    WHERE thread_id = ? AND idempotency_key = ?
    LIMIT 1
  `, [thread.id, input.idempotencyKey])
  if (!existing) return null
  if (existing.request_hash !== commandRequestHash(input)) {
    return { ok: false, status: 409, reason: 'invalid_transition', message: 'Idempotency key was reused with a different request' }
  }
  if (existing.status === 'pending') {
    const leaseExpiresAt = new Date(Date.now() - COMMAND_PENDING_LEASE_MS).toISOString()
    if (existing.created_at <= leaseExpiresAt) return null
    return { ok: false, status: 409, reason: 'invalid_transition', message: 'This operation is already in progress' }
  }
  const storedResult: StoredCommandResult = existing.result_json ? JSON.parse(existing.result_json) as StoredCommandResult : { ok: true }
  if (!storedResult.ok) {
    if (storedResult.reason === 'invalid_transition') {
      return { ok: false, status: 409, reason: storedResult.reason, message: storedResult.message ?? 'Operation failed' }
    }
    if (storedResult.reason === 'thread_not_found' || storedResult.reason === 'source_not_found' || storedResult.reason === 'delivery_not_found') {
      return { ok: false, status: 404, reason: storedResult.reason }
    }
    if (storedResult.reason === 'no_guest_email' || storedResult.reason === 'empty_body' || storedResult.reason === 'missing_delivery_id' || storedResult.reason === 'missing_idempotency_key') {
      return { ok: false, status: 400, reason: storedResult.reason }
    }
  }
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  return { ok: true, thread: refreshedThread ?? thread, availableActions: source ? adapter.listAvailableActions(source) : [] }
}

function commandResultJson(outcome: OperationOutcome): string {
  return JSON.stringify(outcome.ok
    ? { ok: true }
    : {
        ok: false,
        status: outcome.status,
        reason: outcome.reason,
        message: 'message' in outcome ? outcome.message : undefined,
      })
}

async function reserveCommand(
  db: DbClient,
  thread: GuestThreadRow,
  input: ExecuteOperationInput,
): Promise<OperationOutcome | null> {
  if (!input.idempotencyKey) return { ok: false, status: 400, reason: 'missing_idempotency_key' }
  const now = new Date().toISOString()
  try {
    await execute(db, `
      INSERT INTO guest_thread_commands
        (id, thread_id, organization_id, site_id, action, idempotency_key, actor_kind, actor_user_id, actor_member_id, request_hash, status, result_json, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'member', ?, ?, ?, 'pending', NULL, ?, NULL)
    `, [
      crypto.randomUUID(),
      thread.id,
      thread.organization_id,
      thread.site_id,
      input.action,
      input.idempotencyKey,
      input.actorUserId,
      input.actorMemberId,
      commandRequestHash(input),
      now,
    ])
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      const stored = await queryFirst<GuestThreadCommandRow>(db, `
        SELECT * FROM guest_thread_commands
        WHERE thread_id = ? AND idempotency_key = ?
        LIMIT 1
      `, [thread.id, input.idempotencyKey])
      if (stored?.status === 'pending' && stored.request_hash === commandRequestHash(input)) {
        const leaseExpiresAt = new Date(Date.now() - COMMAND_PENDING_LEASE_MS).toISOString()
        const claimed = await execute(db, `
          UPDATE guest_thread_commands
          SET actor_user_id = ?, actor_member_id = ?, created_at = ?
          WHERE thread_id = ?
            AND idempotency_key = ?
            AND request_hash = ?
            AND status = 'pending'
            AND created_at <= ?
        `, [input.actorUserId, input.actorMemberId, now, thread.id, input.idempotencyKey, commandRequestHash(input), leaseExpiresAt])
        const changes = Number(claimed?.meta?.changes ?? 0)
        if (changes > 0) return null
      }
      return await getStoredCommandOutcome(db, thread, input)
    }
    throw error instanceof Error ? error : new Error(message)
  }
}

async function storeCommandResult(
  db: DbClient,
  thread: GuestThreadRow,
  input: ExecuteOperationInput,
  outcome: OperationOutcome,
): Promise<void> {
  if (!input.idempotencyKey) return
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_thread_commands
    SET status = ?, result_json = ?, completed_at = ?, actor_user_id = ?, actor_member_id = ?
    WHERE thread_id = ? AND idempotency_key = ? AND request_hash = ?
  `, [
    outcome.ok ? 'completed' : 'failed',
    commandResultJson(outcome),
    now,
    input.actorUserId,
    input.actorMemberId,
    thread.id,
    input.idempotencyKey,
    commandRequestHash(input),
  ])
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
  const stored = await getStoredCommandOutcome(db, thread, input)
  if (stored) return stored
  const reserved = await reserveCommand(db, thread, input)
  if (reserved) return reserved

  if (input.action === 'reply') {
    const outcome = await executeReply(db, input, thread, adapter, source)
    await storeCommandResult(db, thread, input, outcome)
    return outcome
  }
  if (input.action === 'resolve') {
    const outcome = await executeManualTransition(db, thread, 'manual_resolve', 'resolved', input.actorUserId)
    await storeCommandResult(db, thread, input, outcome)
    return outcome
  }
  if (input.action === 'reopen') {
    const outcome = await executeManualTransition(db, thread, 'manual_reopen', 'reopened', input.actorUserId)
    await storeCommandResult(db, thread, input, outcome)
    return outcome
  }
  if (input.action === 'retry_delivery') {
    const outcome = await executeRetryDelivery(db, input, thread, adapter, source)
    await storeCommandResult(db, thread, input, outcome)
    return outcome
  }

  const availableActions = adapter.listAvailableActions(source)
  if (!availableActions.includes(input.action)) {
    const outcome: OperationOutcome = {
      ok: false,
      status: 409,
      reason: 'invalid_transition',
      message: `"${input.action}" is not a valid action for the current state`,
    }
    await storeCommandResult(db, thread, input, outcome)
    return outcome
  }

  const result = await adapter.executeAction(
    { db, actorUserId: input.actorUserId, actorMemberId: input.actorMemberId },
    source,
    input.action,
  )
  if (!result.ok) {
    const outcome: OperationOutcome = { ok: false, status: 409, reason: 'invalid_transition', message: result.message }
    await storeCommandResult(db, thread, input, outcome)
    return outcome
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

  let notificationOutcome: 'not_required' | 'queued' | 'sent' | 'failed' = 'not_required'

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
        payload: {
          toAddress: summary.guestEmail,
          fromName,
          subject: operationSubject(input.action, fromName),
          textBody: operationBody(input.action, adapter, source),
          templateVersion: `guest-thread-operation:${adapter.type}:${input.action}:1`,
          sourceSnapshot: adapter.buildCurrentDetail(source) as unknown as Record<string, unknown>,
        },
      })
      await createDeliveryOutbox(db, { threadId: thread.id, deliveryId: delivery.id })
      notificationOutcome = 'queued'
      await appendEntry(db, {
        threadId: thread.id,
        organizationId: thread.organization_id,
        siteId: thread.site_id,
        kind: 'delivery',
        actorKind: 'system',
        channel: 'email',
        eventName: 'delivery.queued',
        payloadJson: { action: input.action, deliveryId: delivery.id },
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

  const outcome: OperationOutcome = { ok: true, thread: refreshedThread ?? thread, availableActions: refreshedActions }
  await storeCommandResult(db, thread, input, outcome)
  return outcome
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

async function executeRetryDelivery(
  db: DbClient,
  input: ExecuteOperationInput,
  thread: GuestThreadRow,
  adapter: AnyGuestThreadSourceAdapter,
  source: unknown,
): Promise<OperationOutcome> {
  if (!input.deliveryId) {
    return { ok: false, status: 400, reason: 'missing_delivery_id' }
  }
  const delivery = await getDeliveryById(db, input.deliveryId)
  if (!delivery || delivery.thread_id !== thread.id) {
    return { ok: false, status: 404, reason: 'delivery_not_found' }
  }
  if (!delivery.to_address) {
    return { ok: false, status: 400, reason: 'no_guest_email' }
  }
  if (delivery.status !== 'failed' || delivery.attempt_count >= 5) {
    return { ok: false, status: 409, reason: 'invalid_transition', message: 'Only failed deliveries with remaining retry attempts can be retried' }
  }

  await createDeliveryOutbox(db, { threadId: thread.id, deliveryId: delivery.id })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'member',
    actorUserId: input.actorUserId,
    channel: 'email',
    eventName: 'delivery.retry_queued',
    payloadJson: { deliveryId: delivery.id },
  })

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
    idempotencyKey: input.idempotencyKey ? `guest-thread-reply:${thread.id}:${input.idempotencyKey}` : `guest-thread-reply:${messageEntry.id}`,
    payload: {
      toAddress: summary.guestEmail,
      fromName,
      subject,
      textBody: replyBody,
      templateVersion: `guest-thread-reply:${thread.submission_type}:1`,
      sourceSnapshot: adapter.buildCurrentDetail(source) as unknown as Record<string, unknown>,
    },
  })
  await createDeliveryOutbox(db, { threadId: thread.id, deliveryId: delivery.id })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'system',
    channel: 'email',
    eventName: 'delivery.queued',
    payloadJson: { action: 'reply', deliveryId: delivery.id },
  })

  await advanceMemberCursor(db, thread.id, input.actorMemberId, messageEntry.id)

  const refreshedThread = await getGuestThreadById(db, thread.id, thread.site_id)
  const availableActions = adapter.listAvailableActions(source)
  return { ok: true, thread: refreshedThread ?? thread, availableActions }
}
