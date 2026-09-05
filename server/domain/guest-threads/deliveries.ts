import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { sendReplyEmail, type ReplyEmailEnv, type SubmissionType } from '~/server/utils/submission-messages'
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
    SET status = 'unknown', updated_at = ?
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
    body: string
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
      body: input.body,
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

export async function listDeliveryFailures(db: DbClient, threadId: string): Promise<GuestThreadDeliveryRow[]> {
  return await queryAll<GuestThreadDeliveryRow>(db, `
    SELECT d.* FROM guest_thread_deliveries d
    JOIN guest_thread_entries e ON e.id = d.entry_id
    WHERE e.thread_id = ? AND d.status IN ('failed', 'unknown')
    ORDER BY d.created_at DESC
  `, [threadId])
}
