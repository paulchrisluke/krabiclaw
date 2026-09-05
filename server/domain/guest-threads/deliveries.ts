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

export function getDeliveryRetryEligibility(delivery: GuestThreadDeliveryRow): DeliveryRetryEligibility {
  if (delivery.channel !== 'email' || (delivery.purpose !== 'member_reply' && delivery.purpose !== 'status_update')) {
    return 'unsupported'
  }
  return delivery.status === 'failed' || delivery.status === 'unknown' ? 'retryable' : 'settled'
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

export async function recordDeliveryOutcome(
  db: DbClient,
  input: {
    deliveryId: string
    status: GuestThreadDeliveryStatus
    providerMessageId?: string | null
    error?: string | null
  },
): Promise<GuestThreadDeliveryRow> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET status = ?, provider_message_id = COALESCE(?, provider_message_id), error = ?, updated_at = ?
    WHERE id = ?
  `, [input.status, input.providerMessageId ?? null, input.error ?? null, now, input.deliveryId])

  const updated = await getDeliveryById(db, input.deliveryId)
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
  if (input.delivery.status !== 'pending' && input.delivery.status !== 'unknown') return input.delivery

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
      deliveryId: input.delivery.id,
      status: result.status,
      providerMessageId: result.messageId ?? null,
      error: result.error ?? null,
    })
  } catch (error) {
    return await recordDeliveryOutcome(db, {
      deliveryId: input.delivery.id,
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
