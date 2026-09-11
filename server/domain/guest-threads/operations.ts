import { executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'
import { getGuestRequest, getThreadOperationalRecord, requestActions, requestSummary, type GuestRequest, type ThreadOperationalRecord } from '~/server/domain/requests'
import { deliverGuestThreadEmail, getDeliveryById, getDeliveryClaimEligibility, getDeliveryRetryEligibility, isDeliveryClaimInFlight } from './deliveries'
import { findEntryByDedupeKey, getEntryById } from './entries'
import { updateThreadProjectionIfLatestEntry } from './repository'
import type {
  GuestThreadDeliveryProvider,
  GuestThreadDeliveryRow,
  GuestThreadEntryRow,
  GuestThreadRow,
  GuestThreadSubmissionType,
} from './types'

export const GUEST_THREAD_ACTIONS = new Set(['confirm', 'cancel', 'complete', 'resolve', 'reopen', 'reply', 'retry_delivery'])

type SuccessfulOperationOutcome = { ok: true; status: 200 | 202; thread: GuestThreadRow; availableActions: string[] }

export type OperationOutcome =
  | SuccessfulOperationOutcome
  | { ok: false; status: 404; reason: 'thread_not_found' | 'source_not_found' | 'delivery_not_found' }
  | { ok: false; status: 409; reason: 'invalid_transition'; message: string }
  | { ok: false; status: 400; reason: 'no_guest_email' | 'empty_body' | 'missing_delivery_id' }
  | { ok: false; status: 400; reason: 'missing_idempotency_key' }
  | { ok: false; status: 502; reason: 'delivery_failed'; message: string }
  | { ok: false; status: 504; reason: 'delivery_unknown'; message: string }

export type ExecuteOperationInput = {
  threadId: string
  siteId: string
  action: string
  body?: string
  deliveryId?: string
  env: ReplyEmailEnv
  idempotencyKey?: string
} & ({ actorUserId: string; completionSource?: 'manual' } | { actorUserId: null; action: 'complete'; completionSource: 'auto' })

interface ThreadContext {
  thread: GuestThreadRow
  /**
   * The booking or reservation this thread refers to, loaded once.
   *
   * Operational status lives there, not on the thread, so every transition
   * below reads and writes that record. A contact thread has none.
   */
  record: ThreadOperationalRecord | null
}

interface SourceMutationPlan {
  kind: 'reservation' | 'booking'
  action: 'confirm' | 'cancel' | 'complete'
  beforeStatus: string
  afterStatus: 'confirmed' | 'cancelled' | 'completed'
  requiresNotification: boolean
}

async function loadThreadContext(
  db: DbClient,
  threadId: string,
  siteId: string,
): Promise<ThreadContext | OperationOutcome> {
  const thread = await getGuestRequest(db, threadId, siteId)
  if (!thread) return { ok: false, status: 404, reason: 'thread_not_found' }
  return { thread, record: await getThreadOperationalRecord(db, thread.id) }
}

function operationDedupeKey(input: ExecuteOperationInput): string {
  return `guest-thread-operation:${input.threadId}:${input.idempotencyKey}`
}

function deliveryDedupeKey(input: ExecuteOperationInput): string {
  return `guest-thread-email:${input.threadId}:${input.idempotencyKey}`
}

function emailProvider(env: ReplyEmailEnv, recipient: string): GuestThreadDeliveryProvider {
  return shouldSendRealEmail(env) && !isReservedTestDomain(recipient) ? 'resend' : 'log_only'
}

function entryMatchesRequest(entry: GuestThreadEntryRow, eventName: string, body?: string): boolean {
  return entry.event_name === eventName && (body === undefined || entry.body === body)
}

function conflict(message = 'Idempotency key was reused with a different request'): OperationOutcome {
  return { ok: false, status: 409, reason: 'invalid_transition', message }
}

async function successfulOutcome(
  db: DbClient,
  context: ThreadContext,
  status: SuccessfulOperationOutcome['status'] = 200,
): Promise<SuccessfulOperationOutcome> {
  const thread = await getGuestRequest(db, context.thread.id, context.thread.site_id)
  const record = await getThreadOperationalRecord(db, context.thread.id)
  return {
    ok: true,
    status,
    thread: thread ?? context.thread,
    availableActions: requestActions(record),
  }
}

function sourceMutationPlan(context: ThreadContext, action: string): SourceMutationPlan | null {
  if (context.thread.kind === 'contact' || !context.record) return null
  const { kind, status: beforeStatus } = context.record
  if (beforeStatus === 'pending' && action === 'confirm') {
    return { kind, action, beforeStatus, afterStatus: 'confirmed', requiresNotification: true }
  }
  if ((beforeStatus === 'pending' || beforeStatus === 'confirmed') && action === 'cancel') {
    return { kind, action, beforeStatus, afterStatus: 'cancelled', requiresNotification: true }
  }
  if (beforeStatus === 'confirmed' && action === 'complete') {
    return { kind, action, beforeStatus, afterStatus: 'completed', requiresNotification: false }
  }
  return null
}

function operationEntryQuery(
  context: ThreadContext,
  plan: SourceMutationPlan,
  input: ExecuteOperationInput,
  entryId: string,
  dedupeKey: string,
  now: string,
  subject: string | null,
): BatchQuery {
  return {
    query: `
      INSERT INTO activity_entries
        (id, request_id, kind, scope_kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
      SELECT ?, gt.id, 'operation', 'request', ?, ?, NULL, ?, ?, ?, ?,
             COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id = gt.id), 0) + 1,
             ?, ?
      FROM requests gt
      WHERE gt.id = ? AND gt.site_id = ? AND gt.kind = ? AND gt.status = ?
      ON CONFLICT(dedupe_key) DO NOTHING
    `,
    params: [
      entryId,
      input.actorUserId === null ? 'system' : 'member',
      input.actorUserId,
      plan.requiresNotification ? operationBody(plan.action, context.thread, context.record) : null,
      `${plan.kind}.${plan.action}`,
      JSON.stringify({ action: plan.action, beforeStatus: plan.beforeStatus, afterStatus: plan.afterStatus, subject }),
      dedupeKey,
      now,
      now,
      context.thread.id,
      context.thread.site_id,
      plan.kind,
      plan.beforeStatus,
    ],
  }
}

/**
 * Move the operational record, not the thread.
 *
 * Cancelling here is what releases the seats, because availability is always
 * the sum over live bookings — there is no counter to keep in step. The
 * transition is guarded on the status the caller read, so two dashboards
 * confirming at once cannot both win.
 */
function sourceUpdateQuery(context: ThreadContext, plan: SourceMutationPlan, input: ExecuteOperationInput, entryId: string, now: string): BatchQuery {
  const table = plan.kind === 'reservation' ? 'reservations' : 'bookings'
  const stamps = plan.action === 'complete'
    ? ', completed_at = COALESCE(completed_at, ?)'
    : plan.action === 'cancel' ? ', cancelled_at = COALESCE(cancelled_at, ?), cancellation_reason = ?' : ''
  const stampParams = plan.action === 'complete'
    ? [now]
    : plan.action === 'cancel' ? [now, input.completionSource === 'auto' ? 'auto_cancelled' : 'host_cancelled'] : []
  return {
    query: `
      UPDATE ${table}
      SET status = ?, updated_at = ?${stamps}${plan.action !== 'complete' ? ', hold_expires_at = NULL' : ''}
      WHERE id = ? AND status = ?
        AND EXISTS (SELECT 1 FROM activity_entries WHERE id = ?)
    `,
    params: [plan.afterStatus, now, ...stampParams, context.record!.id, plan.beforeStatus, entryId],
  }
}

function resolveThreadQuery(threadId: string, entryId: string, now: string): BatchQuery {
  return {
    query: `
      UPDATE requests
      SET conversation_state = 'resolved', resolved_at = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM activity_entries WHERE id = ?)
    `,
    params: [now, now, threadId, entryId],
  }
}

function revokeReviewRequestQuery(context: ThreadContext, plan: SourceMutationPlan, entryId: string, now: string): BatchQuery | null {
  if (plan.action !== 'cancel') return null
  return {
    query: `
      UPDATE review_requests
      SET revoked_at = COALESCE(revoked_at, ?), updated_at = ?
      WHERE booking_type = ? AND booking_id = ? AND submitted_at IS NULL AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM activity_entries WHERE id = ?)
    `,
    params: [now, now, plan.kind, context.thread.id, entryId],
  }
}

function deliveryReceiptQuery(
  context: ThreadContext,
  input: ExecuteOperationInput,
  entryId: string,
  deliveryId: string,
  now: string,
  recipient: string,
): BatchQuery {
  return {
    query: `
      INSERT INTO guest_thread_deliveries
        (id, entry_id, channel, provider, purpose, status, created_at, updated_at)
      SELECT ?, id, 'email', ?, 'status_update', 'pending', ?, ?
      FROM activity_entries
      WHERE id = ? AND request_id = ?
      ON CONFLICT(id) DO NOTHING
    `,
    params: [
      deliveryId,
      emailProvider(input.env, recipient),
      now,
      now,
      entryId,
      context.thread.id,
    ],
  }
}

async function getSiteBrandName(db: DbClient, siteId: string): Promise<string> {
  const row = await queryFirst<{ brand_name: string | null }>(db, 'SELECT brand_name FROM sites WHERE id = ? LIMIT 1', [siteId])
  if (!row?.brand_name?.trim()) throw new Error(`Site ${siteId} has no configured brand name`)
  return row.brand_name.trim()
}

function operationSubject(action: string, fromName: string): string {
  if (action === 'confirm') return `Your reservation at ${fromName} is confirmed`
  if (action === 'cancel') return `Your booking at ${fromName} was cancelled`
  if (action === 'complete') return `Thanks for visiting ${fromName}`
  return `Update on your booking at ${fromName}`
}

function operationBody(action: string, request: GuestRequest, record: ThreadOperationalRecord | null): string {
  if (request.kind === 'contact') throw new Error('Contact threads have no booking operations')
  if (!record) throw new Error('This thread has no booking or reservation')
  // Rendered in the record's own timezone, which is the only zone the guest
  // agreed to. Formatting from a server-local clock is how a 7pm table became
  // a noon one in the confirmation email.
  const when = new Intl.DateTimeFormat('en-US', { timeZone: record.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.starts_at))
  const context = `${when} for ${record.party_size}${request.payload.party_size_is_minimum ? '+' : ''} guests`
  const noun = request.kind === 'reservation' ? 'reservation' : 'booking'
  if (action === 'confirm') return `Your ${noun} is confirmed: ${context}.`
  if (action === 'cancel') return `Your ${noun} for ${context} has been cancelled.`
  return `Thanks for visiting us on ${when}.`
}

function replySubject(submissionType: GuestThreadSubmissionType, fromName: string): string {
  if (submissionType === 'contact') return `Re: your message to ${fromName}`
  if (submissionType === 'reservation') return `Re: your reservation at ${fromName}`
  return `Re: your booking at ${fromName}`
}

function recordedEmailSubject(entry: GuestThreadEntryRow): string | null {
  if (!entry.payload_json) return null
  const payload: unknown = JSON.parse(entry.payload_json)
  if (typeof payload !== 'object' || payload === null) return null
  const subject = Reflect.get(payload, 'subject')
  return typeof subject === 'string' && subject.trim() ? subject : null
}

async function sendStatusUpdate(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
  entry: GuestThreadEntryRow,
  delivery: GuestThreadDeliveryRow,
): Promise<GuestThreadDeliveryRow | OperationOutcome> {
  if (getDeliveryClaimEligibility(delivery) !== 'claimable') return delivery
  const subject = recordedEmailSubject(entry)
  if (!entry.body || !subject) return conflict('Status update has no recorded email content')
  const payload = JSON.parse(entry.payload_json!) as { action?: string; afterStatus?: string }
  if (payload.action && (
    payload.afterStatus !== context.record?.status
    || entry.body !== operationBody(payload.action, context.thread, context.record)
  )) return conflict('Status update was superseded by a booking change')
  const summary = await requestSummary(db, context.thread)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }
  const fromName = await getSiteBrandName(db, context.thread.site_id)
  return await deliverGuestThreadEmail(db, {
    delivery,
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject,
    body: entry.body,
    submissionType: context.thread.kind,
    submissionId: context.thread.id,
  })
}

async function executeSourceMutation(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
): Promise<OperationOutcome> {
  const dedupeKey = operationDedupeKey(input)
  const eventName = `${context.thread.kind}.${input.action}`
  const existing = await findEntryByDedupeKey(db, dedupeKey)
  if (existing) {
    if (!entryMatchesRequest(existing, eventName)) return conflict()
    if (input.action !== 'complete') {
      const delivery = await getDeliveryById(db, deliveryDedupeKey(input))
      if (!delivery) throw new Error('Status update delivery receipt was not created')
      const outcome = await sendStatusUpdate(db, context, input, existing, delivery)
      if ('ok' in outcome) return outcome
    }
    return await successfulOutcome(db, context)
  }

  const plan = sourceMutationPlan(context, input.action)
  if (!plan) return conflict(`"${input.action}" is not a valid action for the current state`)
  const summary = await requestSummary(db, context.thread)
  if (plan.requiresNotification && !summary.guestEmail) {
    return { ok: false, status: 400, reason: 'no_guest_email' }
  }

  const entryId = crypto.randomUUID()
  const deliveryId = deliveryDedupeKey(input)
  const now = new Date().toISOString()
  const subject = plan.requiresNotification
    ? operationSubject(plan.action, await getSiteBrandName(db, context.thread.site_id))
    : null
  const queries = [
    operationEntryQuery(context, plan, input, entryId, dedupeKey, now, subject),
    sourceUpdateQuery(context, plan, input, entryId, now),
    resolveThreadQuery(context.thread.id, entryId, now),
  ]
  const revokeReview = revokeReviewRequestQuery(context, plan, entryId, now)
  if (revokeReview) queries.push(revokeReview)
  if (plan.requiresNotification && summary.guestEmail) {
    queries.push(deliveryReceiptQuery(context, input, entryId, deliveryId, now, summary.guestEmail))
  }

  await executeBatch(db, queries, { operation: `guest thread ${plan.kind}.${plan.action}` })
  const applied = await findEntryByDedupeKey(db, dedupeKey)
  if (!applied) return conflict(`"${input.action}" is not a valid action for the current state`)
  if (!entryMatchesRequest(applied, eventName)) return conflict()
  if (plan.requiresNotification) {
    const delivery = await getDeliveryById(db, deliveryId)
    if (!delivery) throw new Error('Status update delivery receipt was not created')
    const refreshed = await loadThreadContext(db, input.threadId, input.siteId)
    if ('ok' in refreshed) return refreshed
    const outcome = await sendStatusUpdate(db, refreshed, input, applied, delivery)
    if ('ok' in outcome) return outcome
  }
  return await successfulOutcome(db, context)
}

async function executeManualTransition(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
): Promise<OperationOutcome> {
  const resolving = input.action === 'resolve'
  const eventName = resolving ? 'thread.resolved' : 'thread.reopened'
  const targetState = resolving ? 'resolved' : 'needs_attention'
  const statePredicate = resolving ? "conversation_state != 'resolved'" : "conversation_state = 'resolved'"
  const dedupeKey = operationDedupeKey(input)
  const existing = await findEntryByDedupeKey(db, dedupeKey)
  if (existing) {
    if (!entryMatchesRequest(existing, eventName)) return conflict()
    return await successfulOutcome(db, context)
  }

  const entryId = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `
        INSERT INTO activity_entries
          (id, request_id, kind, scope_kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
        SELECT ?, id, 'resolution', 'request', 'member', ?, NULL, NULL, ?, '{}', ?,
               COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id = requests.id), 0) + 1,
               ?, ?
        FROM requests
        WHERE id = ? AND site_id = ? AND ${statePredicate}
        ON CONFLICT(dedupe_key) DO NOTHING
      `,
      params: [entryId, input.actorUserId, eventName, dedupeKey, now, now, context.thread.id, context.thread.site_id],
    },
    {
      query: `
        UPDATE requests
        SET conversation_state = ?, resolved_at = ?, updated_at = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM activity_entries WHERE id = ?)
      `,
      params: [targetState, resolving ? now : null, now, context.thread.id, entryId],
    },
  ], { operation: `guest thread ${input.action}` })

  const applied = await findEntryByDedupeKey(db, dedupeKey)
  if (!applied) return conflict(`Thread is already ${resolving ? 'resolved' : 'open'}`)
  if (!entryMatchesRequest(applied, eventName)) return conflict()
  return await successfulOutcome(db, context)
}

async function executeReply(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
): Promise<OperationOutcome> {
  const summary = await requestSummary(db, context.thread)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }
  const body = (input.body ?? '').trim()
  if (!body) return { ok: false, status: 400, reason: 'empty_body' }

  const dedupeKey = operationDedupeKey(input)
  const deliveryKey = deliveryDedupeKey(input)
  let entry = await findEntryByDedupeKey(db, dedupeKey)
  if (entry && !entryMatchesRequest(entry, 'thread.member_reply', body)) return conflict()

  if (!entry) {
    const entryId = crypto.randomUUID()
    const deliveryId = deliveryKey
    const now = new Date().toISOString()
    await executeBatch(db, [
      {
        query: `
          INSERT INTO activity_entries
            (id, request_id, kind, scope_kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
          SELECT ?, id, 'message', 'request', 'member', ?, 'email', ?, 'thread.member_reply', '{}', ?,
                 COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id = requests.id), 0) + 1,
                 ?, ?
          FROM requests
          WHERE id = ? AND site_id = ?
          ON CONFLICT(dedupe_key) DO NOTHING
        `,
        params: [entryId, input.actorUserId, body, dedupeKey, now, now, context.thread.id, context.thread.site_id],
      },
      {
        query: `
          INSERT INTO guest_thread_deliveries
            (id, entry_id, channel, provider, purpose, status, created_at, updated_at)
          SELECT ?, id, 'email', ?, 'member_reply', 'pending', ?, ?
          FROM activity_entries
          WHERE id = ? AND request_id = ?
          ON CONFLICT(id) DO NOTHING
        `,
        params: [deliveryId, emailProvider(input.env, summary.guestEmail), now, now, entryId, context.thread.id],
      },
    ], { operation: 'guest thread reply receipt' })
    entry = await findEntryByDedupeKey(db, dedupeKey)
  }

  if (!entry) return { ok: false, status: 404, reason: 'thread_not_found' }
  if (!entryMatchesRequest(entry, 'thread.member_reply', body)) return conflict()
  const delivery = await getDeliveryById(db, deliveryKey)
  if (!delivery || delivery.entry_id !== entry.id) throw new Error('Reply delivery receipt does not match its ledger entry')

  const fromName = await getSiteBrandName(db, context.thread.site_id)
  const outcome = await deliverGuestThreadEmail(db, {
    delivery,
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject: replySubject(context.thread.kind, fromName),
    body,
    submissionType: context.thread.kind,
    submissionId: context.thread.id,
  })

  if (outcome.status === 'sent' || outcome.status === 'accepted' || outcome.status === 'delivered' || outcome.status === 'read') {
    await updateThreadProjectionIfLatestEntry(db, context.thread.id, entry.id, { conversationState: 'waiting_on_guest' })
    return await successfulOutcome(db, context)
  }
  if (isDeliveryClaimInFlight(outcome)) return await successfulOutcome(db, context, 202)
  if (outcome.status === 'failed') {
    return { ok: false, status: 502, reason: 'delivery_failed', message: outcome.error ?? 'Email provider rejected the reply' }
  }
  return { ok: false, status: 504, reason: 'delivery_unknown', message: outcome.error ?? 'Email delivery outcome is unknown' }
}

async function retryDelivery(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
): Promise<OperationOutcome> {
  if (!input.deliveryId) return { ok: false, status: 400, reason: 'missing_delivery_id' }
  const delivery = await getDeliveryById(db, input.deliveryId)
  if (!delivery) {
    return { ok: false, status: 404, reason: 'delivery_not_found' }
  }
  const entry = await getEntryById(db, delivery.entry_id)
  if (!entry || entry.request_id !== context.thread.id) return { ok: false, status: 404, reason: 'delivery_not_found' }
  if (isDeliveryClaimInFlight(delivery)) return await successfulOutcome(db, context, 202)
  const retryEligibility = getDeliveryRetryEligibility(delivery)
  if (retryEligibility === 'unsupported') {
    return conflict('Only guest-facing email deliveries can be retried here')
  }
  if (retryEligibility === 'settled') {
    return conflict('This email delivery is not currently eligible for retry')
  }

  const summary = await requestSummary(db, context.thread)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }
  const fromName = await getSiteBrandName(db, context.thread.site_id)
  if (!entry.body) return conflict('Delivery entry has no email body')
  const retried = delivery.purpose === 'status_update'
    ? await sendStatusUpdate(db, context, input, entry, delivery)
    : await deliverGuestThreadEmail(db, {
        delivery,
        env: input.env,
        to: summary.guestEmail,
        fromName,
        subject: replySubject(context.thread.kind, fromName),
        body: entry.body,
        submissionType: context.thread.kind,
        submissionId: context.thread.id,
      })
  if ('ok' in retried) return retried
  if (delivery.purpose === 'member_reply' && (retried.status === 'sent' || retried.status === 'accepted')) {
    await updateThreadProjectionIfLatestEntry(db, context.thread.id, entry.id, { conversationState: 'waiting_on_guest' })
  }
  if (retried.status === 'failed') {
    return { ok: false, status: 502, reason: 'delivery_failed', message: retried.error ?? 'Email provider rejected the retry' }
  }
  if (isDeliveryClaimInFlight(retried)) return await successfulOutcome(db, context, 202)
  if (retried.status === 'unknown') {
    return { ok: false, status: 504, reason: 'delivery_unknown', message: retried.error ?? 'Email retry outcome is unknown' }
  }
  return await successfulOutcome(db, context)
}

export async function executeGuestThreadOperation(db: DbClient, input: ExecuteOperationInput): Promise<OperationOutcome> {
  if (!input.idempotencyKey) return { ok: false, status: 400, reason: 'missing_idempotency_key' }
  const context = await loadThreadContext(db, input.threadId, input.siteId)
  if ('ok' in context) return context

  if (input.action === 'reply') return await executeReply(db, context, input)
  if (input.action === 'resolve' || input.action === 'reopen') return await executeManualTransition(db, context, input)
  if (input.action === 'retry_delivery') return await retryDelivery(db, context, input)
  return await executeSourceMutation(db, context, input)
}
