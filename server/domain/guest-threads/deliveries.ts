import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import type { WebhookEventPayload } from 'resend'
import { sendReplyEmail, type ReplyEmailEnv, type SubmissionType } from '~/server/utils/submission-messages'
import { publishGuestInboxThreadEvent, type GuestInboxPublicationEnv } from '~/server/cloudflare/guest-inbox-events'
import type {
  GuestThreadDeliveryChannel,
  GuestThreadDeliveryPurpose,
  GuestThreadDeliveryProvider,
  GuestThreadDeliveryRow,
  GuestThreadDeliveryStatus,
  GuestThreadSubmissionType,
} from './types'

export type DeliveryRetryEligibility = 'retryable' | 'unsupported' | 'settled'

export type DeliveryClaimEligibility = 'claimable' | 'in_flight' | 'expired' | 'unsupported' | 'settled'

export type DeliveryClaimResult =
  | { claimed: true; delivery: GuestThreadDeliveryRow; claimVersion: string }
  | { claimed: false; delivery: GuestThreadDeliveryRow }

const DELIVERY_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000
const UNKNOWN_DELIVERY_LEASE_MS = 10 * 1000

function timestampMs(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nextTimestamp(current: string, nowMs: number): string {
  const currentMs = timestampMs(current)
  return new Date(currentMs === null ? nowMs : Math.max(nowMs, currentMs + 1)).toISOString()
}

export function getDeliveryClaimEligibility(
  delivery: GuestThreadDeliveryRow,
  nowMs = Date.now(),
): DeliveryClaimEligibility {
  if (delivery.status === 'pending') return 'claimable'
  if (delivery.status !== 'failed' && delivery.status !== 'unknown') return 'settled'
  if (delivery.provider === 'meta') return 'unsupported'

  const createdAtMs = timestampMs(delivery.created_at)
  const keyAgeMs = createdAtMs === null ? null : nowMs - createdAtMs
  if (keyAgeMs === null || keyAgeMs < 0 || keyAgeMs >= DELIVERY_KEY_LIFETIME_MS) return 'expired'
  if (delivery.status === 'failed') {
    return delivery.provider === 'resend' ? 'claimable' : 'unsupported'
  }

  const updatedAtMs = timestampMs(delivery.updated_at)
  if (updatedAtMs === null || nowMs - updatedAtMs <= UNKNOWN_DELIVERY_LEASE_MS) return 'in_flight'
  return 'claimable'
}

export function getDeliveryRetryEligibility(
  delivery: GuestThreadDeliveryRow,
  nowMs = Date.now(),
): DeliveryRetryEligibility {
  if (delivery.channel !== 'email' || (delivery.purpose !== 'member_reply' && delivery.purpose !== 'status_update')) {
    return 'unsupported'
  }
  if (delivery.status !== 'failed' && delivery.status !== 'unknown') return 'settled'
  return getDeliveryClaimEligibility(delivery, nowMs) === 'claimable' ? 'retryable' : 'settled'
}

export function isDeliveryClaimInFlight(
  delivery: GuestThreadDeliveryRow,
  nowMs = Date.now(),
): boolean {
  return delivery.status === 'unknown'
    && delivery.error === null
    && getDeliveryClaimEligibility(delivery, nowMs) === 'in_flight'
}

export async function createDeliveryReceipt(
  db: DbClient,
  input: {
    entryId: string
    channel: GuestThreadDeliveryChannel
    provider: GuestThreadDeliveryProvider
    purpose: GuestThreadDeliveryPurpose
    idempotencyKey: string
  },
): Promise<GuestThreadDeliveryRow> {
  const existing = await getDeliveryById(db, input.idempotencyKey)
  if (existing) return existing

  const id = input.idempotencyKey
  const now = new Date().toISOString()
  try {
    await execute(db, `
      INSERT INTO guest_thread_deliveries
        (id, entry_id, channel, provider, purpose, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [
      id,
      input.entryId,
      input.channel,
      input.provider,
      input.purpose,
      now,
      now,
    ])
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) {
      const concurrent = await getDeliveryById(db, input.idempotencyKey)
      if (concurrent) return concurrent
    }
    throw error
  }

  const created = await getDeliveryById(db, id)
  if (!created) throw new Error('Failed to load created guest thread delivery')
  return created
}

export async function getDeliveryById(db: DbClient, id: string): Promise<GuestThreadDeliveryRow | null> {
  return await queryFirst<GuestThreadDeliveryRow>(db, `
    SELECT * FROM guest_thread_deliveries WHERE id = ? LIMIT 1
  `, [id])
}

export async function getDeliveryByProviderMessageId(
  db: DbClient,
  provider: Exclude<GuestThreadDeliveryProvider, 'log_only'>,
  providerMessageId: string,
): Promise<GuestThreadDeliveryRow | null> {
  return await queryFirst<GuestThreadDeliveryRow>(db, `
    SELECT * FROM guest_thread_deliveries
    WHERE provider = ? AND provider_message_id = ?
    LIMIT 1
  `, [provider, providerMessageId])
}

/**
 * Provider delivery stages in the order they can only move forward. Meta sends
 * accepted/sent/delivered/read; Resend events project onto sent/delivered.
 * Webhooks are not ordered, so a later call for the same provider message must
 * never regress a stage already observed.
 */
const DELIVERY_STATUS_RANK: Partial<Record<GuestThreadDeliveryStatus, number>> = {
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
}

/**
 * Whether a provider-reported status moves a delivery forward.
 *
 * `failed` is terminal: once recorded nothing overwrites it, and it never
 * clobbers an already-recorded `delivered`/`read` — a late failure report for
 * a message that arrived is not the message's state. A repeat of the current
 * status is not a change.
 */
export function compareDeliveryStatus(current: string | null, incoming: GuestThreadDeliveryStatus): boolean {
  if (!current) return true
  if (current === 'failed') return false
  if (incoming === 'failed') return current !== 'delivered' && current !== 'read'
  const currentRank = DELIVERY_STATUS_RANK[current as GuestThreadDeliveryStatus] ?? 0
  const incomingRank = DELIVERY_STATUS_RANK[incoming] ?? 0
  return incomingRank > currentRank
}

/**
 * Applies a provider-reported status to one delivery, forward only.
 *
 * Compare-and-set on the observed status, so two webhooks racing on one
 * delivery cannot both write and a regression cannot land between the read
 * and the write. Returns whether the stored status changed.
 */
export async function advanceDeliveryStatus(
  db: DbClient,
  delivery: { id: string; status: string },
  incoming: GuestThreadDeliveryStatus,
  error: string | null,
): Promise<boolean> {
  let observed = delivery.status
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!compareDeliveryStatus(observed, incoming)) return false
    const result = await execute(db, `
      UPDATE guest_thread_deliveries
      SET status = ?, error = ?, updated_at = ?
      WHERE id = ? AND status = ?
    `, [incoming, error, new Date().toISOString(), delivery.id, observed])
    if (result.meta.changes > 0) return true
    const current = await getDeliveryById(db, delivery.id)
    if (!current) throw new Error(`Guest thread delivery ${delivery.id} disappeared while its status was advanced`)
    observed = current.status
  }
  throw new Error(`Guest thread delivery ${delivery.id} kept changing while ${incoming} was applied`)
}

/**
 * The KrabiClaw delivery status a Resend email event means, or null for an
 * event that says nothing about whether the message arrived. A complaint is
 * a delivered message; the complaint itself is Resend's to keep.
 */
function resendProjectedStatus(event: WebhookEventPayload): GuestThreadDeliveryStatus | null {
  switch (event.type) {
    case 'email.sent': return 'sent'
    case 'email.delivered': return 'delivered'
    case 'email.complained': return 'delivered'
    case 'email.failed':
    case 'email.bounced':
    case 'email.suppressed': return 'failed'
    default: return null
  }
}

function resendFailureReason(event: WebhookEventPayload): string | null {
  switch (event.type) {
    case 'email.failed': return `Resend failed: ${event.data.failed.reason}`
    case 'email.bounced': return `Resend bounced (${event.data.bounce.type}): ${event.data.bounce.message}`
    case 'email.suppressed': return `Resend suppressed (${event.data.suppressed.type}): ${event.data.suppressed.message}`
    default: return null
  }
}

/**
 * Projects one verified Resend email event onto the guest-thread delivery it
 * belongs to. Events for mail that is not a guest-thread delivery — every
 * Broadcast recipient among them — match nothing and change nothing: their
 * analytics, bounces, complaints and suppressions are Resend's. A delivery
 * that moves forward republishes its thread to open inboxes.
 */
export async function applyResendEmailEvent(
  db: DbClient,
  env: GuestInboxPublicationEnv,
  event: WebhookEventPayload,
): Promise<'ignored' | 'no_delivery' | 'advanced' | 'unchanged'> {
  const status = resendProjectedStatus(event)
  if (!status || !('email_id' in event.data)) return 'ignored'
  const delivery = await getDeliveryByProviderMessageId(db, 'resend', event.data.email_id)
  if (!delivery) return 'no_delivery'
  const changed = await advanceDeliveryStatus(db, delivery, status, status === 'failed' ? resendFailureReason(event) : null)
  if (!changed) return 'unchanged'
  const entry = await queryFirst<{ request_id: string }>(db, 'SELECT request_id FROM activity_entries WHERE id = ?', [delivery.entry_id])
  if (!entry) throw new Error(`Activity entry ${delivery.entry_id} for delivery ${delivery.id} not found`)
  await publishGuestInboxThreadEvent(env, db, { threadId: entry.request_id, type: 'delivery.changed' })
  return 'advanced'
}

export async function claimDelivery(
  db: DbClient,
  deliveryId: string,
  nowMs = Date.now(),
): Promise<DeliveryClaimResult> {
  const delivery = await getDeliveryById(db, deliveryId)
  if (!delivery) throw new Error('Guest thread delivery not found')
  if (getDeliveryClaimEligibility(delivery, nowMs) !== 'claimable') {
    return { claimed: false, delivery }
  }

  const claimVersion = nextTimestamp(delivery.updated_at, nowMs)
  const claimed = await execute(db, `
    UPDATE guest_thread_deliveries
    SET status = 'unknown', error = NULL, updated_at = ?
    WHERE id = ? AND status = ? AND updated_at = ?
  `, [claimVersion, delivery.id, delivery.status, delivery.updated_at])
  const current = await getDeliveryById(db, delivery.id)
  if (!current) throw new Error('Guest thread delivery not found')
  if (claimed.meta.changes === 0 || current.status !== 'unknown' || current.updated_at !== claimVersion) {
    return { claimed: false, delivery: current }
  }
  return { claimed: true, delivery: current, claimVersion }
}

export async function recordDeliveryOutcome(
  db: DbClient,
  input: {
    claim: Extract<DeliveryClaimResult, { claimed: true }>
    status: Exclude<GuestThreadDeliveryStatus, 'pending'>
    providerMessageId?: string | null
    error?: string | null
  },
): Promise<GuestThreadDeliveryRow> {
  const outcomeVersion = nextTimestamp(input.claim.claimVersion, Date.now())
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET status = ?, provider_message_id = COALESCE(?, provider_message_id), error = ?, updated_at = ?
    WHERE id = ? AND status = 'unknown' AND updated_at = ?
  `, [
    input.status,
    input.providerMessageId ?? null,
    input.error ?? null,
    outcomeVersion,
    input.claim.delivery.id,
    input.claim.claimVersion,
  ])

  const updated = await getDeliveryById(db, input.claim.delivery.id)
  if (!updated) throw new Error('Guest thread delivery not found')
  return updated
}

export async function deliverGuestThreadEmail(
  db: DbClient,
  input: {
    delivery: GuestThreadDeliveryRow
    env: ReplyEmailEnv
    to: string
    fromName: string
    subject: string
    email: { html: string; text: string }
    submissionType: GuestThreadSubmissionType
    submissionId: string
  },
): Promise<GuestThreadDeliveryRow> {
  if (input.delivery.channel !== 'email') throw new Error('Delivery channel is not email')
  const claim = await claimDelivery(db, input.delivery.id)
  if (!claim.claimed) return claim.delivery

  try {
    const result = await sendReplyEmail(input.env, {
      to: input.to,
      fromName: input.fromName,
      subject: input.subject,
      email: input.email,
      submissionType: input.submissionType as SubmissionType,
      submissionId: input.submissionId,
      idempotencyKey: input.delivery.id,
    })

    return await recordDeliveryOutcome(db, {
      claim,
      status: result.status,
      providerMessageId: result.messageId ?? null,
      error: result.error ?? null,
    })
  } catch (error) {
    return await recordDeliveryOutcome(db, {
      claim,
      status: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Every delivery this thread produced, newest first. The thread is the only
 * place that knows a message went out over WhatsApp rather than email, so the
 * detail view reads all of them from here and decides what to show; a query
 * that returned failures alone is why a successful send had no channel on it.
 */
export async function listThreadDeliveries(db: DbClient, threadId: string): Promise<GuestThreadDeliveryRow[]> {
  return queryAll<GuestThreadDeliveryRow>(db, `
    SELECT d.* FROM guest_thread_deliveries d
    JOIN activity_entries e ON e.id = d.entry_id
    WHERE e.request_id = ?
    ORDER BY d.created_at DESC
  `, [threadId])
}

/** A failure worth showing: settled badly, and not a claim still in flight. */
export function isVisibleDeliveryFailure(delivery: GuestThreadDeliveryRow, nowMs = Date.now()): boolean {
  if (delivery.status !== 'failed' && delivery.status !== 'unknown') return false
  return !isDeliveryClaimInFlight(delivery, nowMs)
}
