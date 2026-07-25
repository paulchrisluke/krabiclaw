import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { sendReplyEmail, type ReplyEmailEnv, type SubmissionType } from '~/server/utils/submission-messages'
import type { GuestThreadDeliveryChannel, GuestThreadDeliveryRow, GuestThreadSubmissionType } from './types'

/**
 * Persists a durable delivery intent BEFORE any external send is attempted (issue #442
 * Locked Decision #9). Idempotent on `idempotencyKey` — a retried request for the same
 * intent returns the existing row instead of creating a duplicate.
 */
export async function createDeliveryIntent(
  db: DbClient,
  input: {
    threadId: string
    entryId: string | null
    channel: GuestThreadDeliveryChannel
    idempotencyKey: string
    toAddress: string | null
    provider?: string | null
  },
): Promise<GuestThreadDeliveryRow> {
  const existing = await getDeliveryByIdempotencyKey(db, input.idempotencyKey)
  if (existing) return existing

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    await execute(db, `
      INSERT INTO guest_thread_deliveries
        (id, thread_id, entry_id, channel, provider, idempotency_key, status, attempt_count, to_address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
    `, [id, input.threadId, input.entryId, input.channel, input.provider ?? null, input.idempotencyKey, input.toAddress, now, now])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      const concurrent = await getDeliveryByIdempotencyKey(db, input.idempotencyKey)
      if (concurrent) return concurrent
    }
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await queryFirst<GuestThreadDeliveryRow>(db, `SELECT * FROM guest_thread_deliveries WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error('Failed to load created delivery intent')
  return created
}

export async function getDeliveryByIdempotencyKey(db: DbClient, idempotencyKey: string): Promise<GuestThreadDeliveryRow | null> {
  return await queryFirst<GuestThreadDeliveryRow>(db, `
    SELECT * FROM guest_thread_deliveries WHERE idempotency_key = ? LIMIT 1
  `, [idempotencyKey])
}

export async function getDeliveryById(db: DbClient, id: string): Promise<GuestThreadDeliveryRow | null> {
  return await queryFirst<GuestThreadDeliveryRow>(db, `SELECT * FROM guest_thread_deliveries WHERE id = ? LIMIT 1`, [id])
}

async function markDeliveryAttempt(
  db: DbClient,
  deliveryId: string,
  outcome: { status: 'sent' | 'failed'; providerMessageId?: string | null; lastError?: string | null },
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET status = ?, attempt_count = attempt_count + 1, provider_message_id = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `, [outcome.status, outcome.providerMessageId ?? null, outcome.lastError ?? null, now, deliveryId])
}

export interface DeliverGuestEmailInput {
  delivery: GuestThreadDeliveryRow
  env: ReplyEmailEnv
  to: string
  fromName: string
  subject: string
  body: string
  submissionType: GuestThreadSubmissionType
  submissionId: string
}

/**
 * Attempts (or retries) the actual email send for an existing durable delivery intent,
 * via the canonical reply-channel sender — never a bespoke fetch to the email provider.
 */
export async function attemptEmailDelivery(db: DbClient, input: DeliverGuestEmailInput): Promise<{ success: boolean; error?: string }> {
  const result = await sendReplyEmail(input.env, {
    to: input.to,
    fromName: input.fromName,
    subject: input.subject,
    body: input.body,
    submissionType: input.submissionType as SubmissionType,
    submissionId: input.submissionId,
  })

  await markDeliveryAttempt(db, input.delivery.id, {
    status: result.success ? 'sent' : 'failed',
    providerMessageId: result.messageId ?? null,
    lastError: result.error ?? null,
  })

  return { success: result.success, error: result.error }
}

export async function listDeliveryFailures(db: DbClient, threadId: string): Promise<GuestThreadDeliveryRow[]> {
  const rows = await queryAll<GuestThreadDeliveryRow>(db, `
    SELECT * FROM guest_thread_deliveries
    WHERE thread_id = ? AND status = 'failed'
    ORDER BY created_at DESC
  `, [threadId])
  return rows ?? []
}
