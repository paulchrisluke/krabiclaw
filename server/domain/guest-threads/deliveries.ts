import { createHash } from 'node:crypto'
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { sendReplyEmail, type ReplyEmailEnv, type SubmissionType } from '~/server/utils/submission-messages'
import type { GuestThreadDeliveryChannel, GuestThreadDeliveryRow, GuestThreadOutboxRow, GuestThreadSubmissionType } from './types'

const OUTBOX_MAX_ATTEMPTS = 5
const OUTBOX_LOCK_MS = 2 * 60_000

export interface GuestDeliveryPayloadInput {
  toAddress: string | null
  fromName: string
  subject: string
  textBody: string
  replyTo?: string | null
  locale?: string | null
  templateVersion: string
  sourceSnapshot?: Record<string, unknown> | null
}

function payloadHash(payload: GuestDeliveryPayloadInput): string {
  return createHash('sha256').update(JSON.stringify({
    toAddress: payload.toAddress,
    fromName: payload.fromName,
    subject: payload.subject,
    textBody: payload.textBody,
    replyTo: payload.replyTo ?? null,
    locale: payload.locale ?? null,
    templateVersion: payload.templateVersion,
    sourceSnapshot: payload.sourceSnapshot ?? null,
  })).digest('hex')
}

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
    payload: GuestDeliveryPayloadInput
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
        (id, thread_id, entry_id, channel, provider, idempotency_key, status, attempt_count, to_address,
         from_name, subject, text_body, reply_to, locale, template_version, source_snapshot_json, payload_hash,
         provider_idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.threadId,
      input.entryId,
      input.channel,
      input.provider ?? 'resend',
      input.idempotencyKey,
      input.payload.toAddress,
      input.payload.fromName,
      input.payload.subject,
      input.payload.textBody,
      input.payload.replyTo ?? null,
      input.payload.locale ?? null,
      input.payload.templateVersion,
      input.payload.sourceSnapshot ? JSON.stringify(input.payload.sourceSnapshot) : null,
      payloadHash(input.payload),
      input.idempotencyKey,
      now,
      now,
    ])
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

export async function createDeliveryOutbox(
  db: DbClient,
  input: { threadId: string; deliveryId: string; eventType?: string },
): Promise<GuestThreadOutboxRow> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO guest_thread_outbox
      (id, thread_id, delivery_id, event_type, status, attempt_count, next_attempt_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `, [id, input.threadId, input.deliveryId, input.eventType ?? 'guest_delivery.send', now, now, now])
  const created = await queryFirst<GuestThreadOutboxRow>(db, `SELECT * FROM guest_thread_outbox WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error('Failed to load created guest thread outbox row')
  return created
}

export async function listPendingDeliveryOutbox(db: DbClient, limit = 25): Promise<GuestThreadOutboxRow[]> {
  const now = new Date().toISOString()
  const leaseExpiredAt = new Date(Date.now() - OUTBOX_LOCK_MS).toISOString()
  const candidates = await queryAll<{ id: string }>(db, `
    SELECT id FROM guest_thread_outbox
    WHERE status IN ('pending', 'failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND attempt_count < ?
      AND (locked_at IS NULL OR locked_at <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `, [now, OUTBOX_MAX_ATTEMPTS, leaseExpiredAt, limit])

  const claimed: GuestThreadOutboxRow[] = []
  for (const candidate of candidates) {
    await execute(db, `
      UPDATE guest_thread_outbox
      SET status = 'publishing', locked_at = ?, updated_at = ?
      WHERE id = ?
        AND status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        AND attempt_count < ?
        AND (locked_at IS NULL OR locked_at <= ?)
    `, [now, now, candidate.id, now, OUTBOX_MAX_ATTEMPTS, leaseExpiredAt])

    const row = await queryFirst<GuestThreadOutboxRow>(db, `
      SELECT * FROM guest_thread_outbox
      WHERE id = ? AND status = 'publishing' AND locked_at = ?
      LIMIT 1
    `, [candidate.id, now])
    if (row) claimed.push(row)
  }
  return claimed
}

export async function markOutboxPublished(db: DbClient, outboxId: string): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_thread_outbox
    SET status = 'published', attempt_count = attempt_count + 1, locked_at = NULL, last_error = NULL, updated_at = ?
    WHERE id = ?
  `, [now, outboxId])
}

export async function markOutboxPublishFailed(db: DbClient, outboxId: string, error: string): Promise<void> {
  const now = new Date().toISOString()
  const row = await queryFirst<{ attempt_count: number }>(db, `SELECT attempt_count FROM guest_thread_outbox WHERE id = ? LIMIT 1`, [outboxId])
  const nextAttemptCount = (row?.attempt_count ?? 0) + 1
  const terminal = nextAttemptCount >= OUTBOX_MAX_ATTEMPTS
  const backoffMs = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, nextAttemptCount - 1))
  await execute(db, `
    UPDATE guest_thread_outbox
    SET status = ?, attempt_count = attempt_count + 1, locked_at = NULL, last_error = ?, next_attempt_at = ?, updated_at = ?
    WHERE id = ?
  `, [terminal ? 'dead' : 'failed', error, terminal ? null : new Date(Date.now() + backoffMs).toISOString(), now, outboxId])
}

async function markDeliveryAttempt(
  db: DbClient,
  deliveryId: string,
  outcome: { status: 'sent' | 'failed'; providerMessageId?: string | null; lastError?: string | null },
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET status = ?, attempt_count = attempt_count + 1, provider_message_id = ?, last_error = ?, processing_lease_until = NULL, updated_at = ?
    WHERE id = ?
  `, [outcome.status, outcome.providerMessageId ?? null, outcome.lastError ?? null, now, deliveryId])
}

export interface DeliverGuestEmailInput {
  delivery: GuestThreadDeliveryRow
  env: ReplyEmailEnv
  submissionType: GuestThreadSubmissionType
  submissionId: string
}

/**
 * Attempts (or retries) the actual email send for an existing durable delivery intent,
 * via the canonical reply-channel sender — never a bespoke fetch to the email provider.
 */
export async function attemptEmailDelivery(db: DbClient, input: DeliverGuestEmailInput): Promise<{ success: boolean; error?: string }> {
  if (!input.delivery.to_address || !input.delivery.from_name || !input.delivery.subject || !input.delivery.text_body) {
    return { success: false, error: 'Delivery payload is incomplete' }
  }
  try {
    const result = await sendReplyEmail(input.env, {
      to: input.delivery.to_address,
      fromName: input.delivery.from_name,
      subject: input.delivery.subject,
      body: input.delivery.text_body,
      submissionType: input.submissionType as SubmissionType,
      submissionId: input.submissionId,
      idempotencyKey: input.delivery.provider_idempotency_key ?? input.delivery.idempotency_key,
    })

    await markDeliveryAttempt(db, input.delivery.id, {
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      lastError: result.error ?? null,
    })

    return { success: result.success, error: result.error }
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error)
    await markDeliveryAttempt(db, input.delivery.id, {
      status: 'failed',
      providerMessageId: null,
      lastError,
    })
    return { success: false, error: lastError }
  }
}

export async function listDeliveryFailures(db: DbClient, threadId: string): Promise<GuestThreadDeliveryRow[]> {
  const rows = await queryAll<GuestThreadDeliveryRow>(db, `
    SELECT * FROM guest_thread_deliveries
    WHERE thread_id = ? AND status = 'failed'
    ORDER BY created_at DESC
  `, [threadId])
  return rows ?? []
}
