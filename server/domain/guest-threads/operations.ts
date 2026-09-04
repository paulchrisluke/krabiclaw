import { executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'
import { getAdapter } from './adapters/registry'
import { deliverGuestThreadEmail, getDeliveryById, getDeliveryByIdempotencyKey, getDeliveryRetryEligibility } from './deliveries'
import { findEntryByDedupeKey, getEntryById } from './entries'
import { getGuestThreadById } from './repository'
import type {
  AnyGuestThreadSourceAdapter,
  GuestThreadDeliveryProvider,
  GuestThreadDeliveryRow,
  GuestThreadEntryRow,
  GuestThreadRow,
  GuestThreadSubmissionType,
} from './types'

export const GUEST_THREAD_ACTIONS = new Set(['confirm', 'cancel', 'complete', 'resolve', 'reopen', 'reply', 'retry_delivery'])

export type OperationOutcome =
  | { ok: true; thread: GuestThreadRow; availableActions: string[] }
  | { ok: false; status: 404; reason: 'thread_not_found' | 'source_not_found' | 'delivery_not_found' }
  | { ok: false; status: 409; reason: 'invalid_transition'; message: string }
  | { ok: false; status: 400; reason: 'no_guest_email' | 'empty_body' | 'missing_delivery_id' }
  | { ok: false; status: 400; reason: 'missing_idempotency_key' }
  | { ok: false; status: 502; reason: 'delivery_failed'; message: string }
  | { ok: false; status: 504; reason: 'delivery_unknown'; message: string }

export interface ExecuteOperationInput {
  threadId: string
  siteId: string
  action: string
  actorUserId: string
  body?: string
  deliveryId?: string
  env: ReplyEmailEnv
  idempotencyKey?: string
}

interface ThreadContext {
  thread: GuestThreadRow
  adapter: AnyGuestThreadSourceAdapter
  source: unknown
}

type SourceMutationPlan =
  | {
      kind: 'reservation'
      action: 'confirm' | 'cancel' | 'complete'
      beforeStatus: string
      afterStatus: 'confirmed' | 'cancelled' | 'completed'
      requiresNotification: boolean
    }
  | {
      kind: 'experience_booking'
      action: 'confirm' | 'cancel'
      beforeStatus: string
      afterStatus: 'confirmed' | 'cancelled'
      requiresNotification: true
    }

async function loadThreadContext(
  db: DbClient,
  threadId: string,
  siteId: string,
): Promise<ThreadContext | OperationOutcome> {
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return { ok: false, status: 404, reason: 'thread_not_found' }
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!source) return { ok: false, status: 404, reason: 'source_not_found' }
  return { thread, adapter, source }
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

async function successfulOutcome(db: DbClient, context: ThreadContext): Promise<OperationOutcome> {
  const thread = await getGuestThreadById(db, context.thread.id, context.thread.site_id)
  const source = await context.adapter.loadSource({ db }, context.thread.submission_id)
  return {
    ok: true,
    thread: thread ?? context.thread,
    availableActions: source ? context.adapter.listAvailableActions(source) : [],
  }
}

function sourceMutationPlan(context: ThreadContext, action: string): SourceMutationPlan | null {
  const beforeStatus = context.adapter.getOperationalStatus(context.source)
  if (context.thread.submission_type === 'reservation') {
    if (beforeStatus === 'new' && action === 'confirm') {
      return { kind: 'reservation', action, beforeStatus, afterStatus: 'confirmed', requiresNotification: true }
    }
    if ((beforeStatus === 'new' || beforeStatus === 'confirmed') && action === 'cancel') {
      return { kind: 'reservation', action, beforeStatus, afterStatus: 'cancelled', requiresNotification: true }
    }
    if (beforeStatus === 'confirmed' && action === 'complete') {
      return { kind: 'reservation', action, beforeStatus, afterStatus: 'completed', requiresNotification: false }
    }
    return null
  }
  if (context.thread.submission_type === 'experience_booking') {
    if (beforeStatus === 'pending' && action === 'confirm') {
      return { kind: 'experience_booking', action, beforeStatus, afterStatus: 'confirmed', requiresNotification: true }
    }
    if ((beforeStatus === 'pending' || beforeStatus === 'confirmed') && action === 'cancel') {
      return { kind: 'experience_booking', action, beforeStatus, afterStatus: 'cancelled', requiresNotification: true }
    }
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
): BatchQuery {
  const sourceTable = plan.kind === 'reservation' ? 'reservation_submissions' : 'experience_bookings'
  return {
    query: `
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
      SELECT ?, gt.id, gt.organization_id, gt.site_id, 'operation', 'member', ?, NULL, NULL, ?, ?, ?,
             COALESCE((SELECT MAX(sequence) FROM guest_thread_entries WHERE thread_id = gt.id), 0) + 1,
             ?, ?
      FROM guest_threads gt
      JOIN ${sourceTable} source ON source.id = gt.submission_id AND source.site_id = gt.site_id
      WHERE gt.id = ? AND gt.site_id = ? AND gt.submission_type = ? AND source.status = ?
      ON CONFLICT(dedupe_key) DO NOTHING
    `,
    params: [
      entryId,
      input.actorUserId,
      `${plan.kind}.${plan.action}`,
      JSON.stringify({ action: plan.action, beforeStatus: plan.beforeStatus, afterStatus: plan.afterStatus }),
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

function sourceUpdateQuery(context: ThreadContext, plan: SourceMutationPlan, entryId: string, now: string): BatchQuery {
  const sourceTable = plan.kind === 'reservation' ? 'reservation_submissions' : 'experience_bookings'
  const completion = plan.kind === 'reservation' && plan.action === 'complete'
    ? ", completed_at = COALESCE(completed_at, ?), completion_source = COALESCE(completion_source, 'manual')"
    : ''
  const params = completion
    ? [plan.afterStatus, now, now, context.thread.submission_id, context.thread.site_id, plan.beforeStatus, entryId]
    : [plan.afterStatus, now, context.thread.submission_id, context.thread.site_id, plan.beforeStatus, entryId]
  return {
    query: `
      UPDATE ${sourceTable}
      SET status = ?, updated_at = ?${completion}
      WHERE id = ? AND site_id = ? AND status = ?
        AND EXISTS (SELECT 1 FROM guest_thread_entries WHERE id = ?)
    `,
    params,
  }
}

function resolveThreadQuery(threadId: string, entryId: string, now: string): BatchQuery {
  return {
    query: `
      UPDATE guest_threads
      SET conversation_state = 'resolved', resolved_at = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM guest_thread_entries WHERE id = ?)
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
        AND EXISTS (SELECT 1 FROM guest_thread_entries WHERE id = ?)
    `,
    params: [now, now, plan.kind, context.thread.submission_id, entryId],
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
        (id, thread_id, entry_id, channel, provider, purpose, idempotency_key, status, created_at, updated_at)
      SELECT ?, ?, id, 'email', ?, 'status_update', ?, 'pending', ?, ?
      FROM guest_thread_entries
      WHERE id = ? AND thread_id = ?
      ON CONFLICT(idempotency_key) DO NOTHING
    `,
    params: [
      deliveryId,
      context.thread.id,
      emailProvider(input.env, recipient),
      deliveryDedupeKey(input),
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

function operationBody(action: string, adapter: AnyGuestThreadSourceAdapter, source: unknown): string {
  const fields = adapter.buildCurrentDetail(source).fields
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
  return 'Your booking status has been updated.'
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
  action: string,
): Promise<GuestThreadDeliveryRow> {
  const summary = context.adapter.summarize(context.source)
  if (!summary.guestEmail) throw new Error('Status update has no guest email')
  const delivery = await getDeliveryByIdempotencyKey(db, deliveryDedupeKey(input))
  if (!delivery) throw new Error('Status update delivery receipt was not created')
  const fromName = await getSiteBrandName(db, context.thread.site_id)
  return await deliverGuestThreadEmail(db, {
    delivery,
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject: operationSubject(action, fromName),
    body: operationBody(action, context.adapter, context.source),
    submissionType: context.thread.submission_type,
    submissionId: context.thread.submission_id,
  })
}

async function executeSourceMutation(
  db: DbClient,
  context: ThreadContext,
  input: ExecuteOperationInput,
): Promise<OperationOutcome> {
  const dedupeKey = operationDedupeKey(input)
  const eventName = `${context.thread.submission_type}.${input.action}`
  const existing = await findEntryByDedupeKey(db, dedupeKey)
  if (existing) {
    if (!entryMatchesRequest(existing, eventName)) return conflict()
    if (input.action !== 'complete') await sendStatusUpdate(db, context, input, input.action)
    return await successfulOutcome(db, context)
  }

  const plan = sourceMutationPlan(context, input.action)
  if (!plan) return conflict(`"${input.action}" is not a valid action for the current state`)
  const summary = context.adapter.summarize(context.source)
  if (plan.requiresNotification && !summary.guestEmail) {
    return { ok: false, status: 400, reason: 'no_guest_email' }
  }

  const entryId = crypto.randomUUID()
  const deliveryId = crypto.randomUUID()
  const now = new Date().toISOString()
  const queries = [
    operationEntryQuery(context, plan, input, entryId, dedupeKey, now),
    sourceUpdateQuery(context, plan, entryId, now),
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
  if (plan.requiresNotification) await sendStatusUpdate(db, context, input, plan.action)
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
        INSERT INTO guest_thread_entries
          (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
        SELECT ?, id, organization_id, site_id, 'resolution', 'member', ?, NULL, NULL, ?, NULL, ?,
               COALESCE((SELECT MAX(sequence) FROM guest_thread_entries WHERE thread_id = guest_threads.id), 0) + 1,
               ?, ?
        FROM guest_threads
        WHERE id = ? AND site_id = ? AND ${statePredicate}
        ON CONFLICT(dedupe_key) DO NOTHING
      `,
      params: [entryId, input.actorUserId, eventName, dedupeKey, now, now, context.thread.id, context.thread.site_id],
    },
    {
      query: `
        UPDATE guest_threads
        SET conversation_state = ?, resolved_at = ?, updated_at = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM guest_thread_entries WHERE id = ?)
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
  const summary = context.adapter.summarize(context.source)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }
  const body = (input.body ?? '').trim()
  if (!body) return { ok: false, status: 400, reason: 'empty_body' }

  const dedupeKey = operationDedupeKey(input)
  const deliveryKey = deliveryDedupeKey(input)
  let entry = await findEntryByDedupeKey(db, dedupeKey)
  if (entry && !entryMatchesRequest(entry, 'thread.member_reply', body)) return conflict()

  if (!entry) {
    const entryId = crypto.randomUUID()
    const deliveryId = crypto.randomUUID()
    const now = new Date().toISOString()
    await executeBatch(db, [
      {
        query: `
          INSERT INTO guest_thread_entries
            (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
          SELECT ?, id, organization_id, site_id, 'message', 'member', ?, 'email', ?, 'thread.member_reply', NULL, ?,
                 COALESCE((SELECT MAX(sequence) FROM guest_thread_entries WHERE thread_id = guest_threads.id), 0) + 1,
                 ?, ?
          FROM guest_threads
          WHERE id = ? AND site_id = ?
          ON CONFLICT(dedupe_key) DO NOTHING
        `,
        params: [entryId, input.actorUserId, body, dedupeKey, now, now, context.thread.id, context.thread.site_id],
      },
      {
        query: `
          INSERT INTO guest_thread_deliveries
            (id, thread_id, entry_id, channel, provider, purpose, idempotency_key, status, created_at, updated_at)
          SELECT ?, ?, id, 'email', ?, 'member_reply', ?, 'pending', ?, ?
          FROM guest_thread_entries
          WHERE id = ? AND thread_id = ?
          ON CONFLICT(idempotency_key) DO NOTHING
        `,
        params: [deliveryId, context.thread.id, emailProvider(input.env, summary.guestEmail), deliveryKey, now, now, entryId, context.thread.id],
      },
    ], { operation: 'guest thread reply receipt' })
    entry = await findEntryByDedupeKey(db, dedupeKey)
  }

  if (!entry) return { ok: false, status: 404, reason: 'thread_not_found' }
  if (!entryMatchesRequest(entry, 'thread.member_reply', body)) return conflict()
  const delivery = await getDeliveryByIdempotencyKey(db, deliveryKey)
  if (!delivery || delivery.entry_id !== entry.id) throw new Error('Reply delivery receipt does not match its ledger entry')

  const fromName = await getSiteBrandName(db, context.thread.site_id)
  const outcome = await deliverGuestThreadEmail(db, {
    delivery,
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject: replySubject(context.thread.submission_type, fromName),
    body,
    submissionType: context.thread.submission_type,
    submissionId: context.thread.submission_id,
  })

  if (outcome.status === 'sent' || outcome.status === 'accepted' || outcome.status === 'delivered' || outcome.status === 'read') {
    const now = new Date().toISOString()
    await executeBatch(db, [{
      query: `
        UPDATE guest_threads
        SET conversation_state = 'waiting_on_guest', resolved_at = NULL, updated_at = ?
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM guest_thread_deliveries
            WHERE id = ? AND status IN ('accepted', 'sent', 'delivered', 'read')
          )
      `,
      params: [now, context.thread.id, outcome.id],
    }], { operation: 'guest thread reply acceptance' })
    return await successfulOutcome(db, context)
  }
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
  if (!delivery || delivery.thread_id !== context.thread.id) {
    return { ok: false, status: 404, reason: 'delivery_not_found' }
  }
  const retryEligibility = getDeliveryRetryEligibility(delivery)
  if (retryEligibility === 'unsupported') {
    return conflict('Only guest-facing email deliveries can be retried here')
  }
  if (retryEligibility === 'settled') {
    return conflict('Only failed or unknown email deliveries can be retried')
  }

  const entry = await getEntryById(db, delivery.entry_id)
  if (!entry) throw new Error('Delivery ledger entry was not found')
  const summary = context.adapter.summarize(context.source)
  if (!summary.guestEmail) return { ok: false, status: 400, reason: 'no_guest_email' }
  const fromName = await getSiteBrandName(db, context.thread.site_id)
  const action = entry.event_name?.split('.').at(-1) ?? ''
  const recordedSubject = recordedEmailSubject(entry)
  const recordedBody = delivery.purpose === 'member_reply' || recordedSubject ? entry.body : null
  const body = recordedBody ?? operationBody(action, context.adapter, context.source)
  if (!body) return conflict('Delivery entry has no email body')

  const retried = await deliverGuestThreadEmail(db, {
    delivery: { ...delivery, status: 'unknown' },
    env: input.env,
    to: summary.guestEmail,
    fromName,
    subject: delivery.purpose === 'member_reply'
      ? replySubject(context.thread.submission_type, fromName)
      : recordedSubject ?? operationSubject(action, fromName),
    body,
    submissionType: context.thread.submission_type,
    submissionId: context.thread.submission_id,
  })
  if (delivery.purpose === 'member_reply' && (retried.status === 'sent' || retried.status === 'accepted')) {
    const now = new Date().toISOString()
    await executeBatch(db, [{
      query: `
        UPDATE guest_threads
        SET conversation_state = 'waiting_on_guest', resolved_at = NULL, updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM guest_thread_deliveries WHERE id = ? AND status IN ('accepted', 'sent', 'delivered', 'read')
        )
      `,
      params: [now, context.thread.id, retried.id],
    }], { operation: 'guest thread reply retry acceptance' })
  }
  if (retried.status === 'failed') {
    return { ok: false, status: 502, reason: 'delivery_failed', message: retried.error ?? 'Email provider rejected the retry' }
  }
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
