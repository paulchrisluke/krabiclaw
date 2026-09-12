import { execute, queryFirst, type DbClient } from '~/server/db'

export type StripeWebhookProcessor = 'platform_billing' | 'connect_marketplace'

export interface StripeWebhookEventInput {
  id: string
  type: string
  payload: string
  processor: StripeWebhookProcessor
}

const WEBHOOK_LEASE_MS = 5 * 60 * 1000
const WEBHOOK_RETRY_MS = 60 * 60 * 1000
export const MAX_STRIPE_WEBHOOK_ATTEMPTS = 5

export async function enqueueStripeWebhookEvent(db: DbClient, event: StripeWebhookEventInput): Promise<boolean> {
  const inserted = await execute(db, `
    INSERT OR IGNORE INTO stripe_webhook_events
      (id, stripe_event_id, event_type, processor, status, payload, attempt_count, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, 0, ?)
  `, [crypto.randomUUID(), event.id, event.type, event.processor, event.payload, new Date().toISOString()])
  return Number(inserted.meta.changes) > 0
}

export async function recordStripeWebhookEventFailure(
  db: DbClient,
  processor: StripeWebhookProcessor,
  stripeEventId: string,
  message: string,
): Promise<boolean> {
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString()
  const claimToken = crypto.randomUUID()
  const claimed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', claimed_at = ?, lease_expires_at = ?, claim_token = ?,
        attempt_count = attempt_count + 1, error = ?, next_attempt_at = NULL
    WHERE stripe_event_id = ? AND processor = ?
      AND status IN ('pending', 'failed')
      AND attempt_count < ?
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `, [nowIso, leaseExpiresAt, claimToken, message, stripeEventId, processor, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, nowIso])
  if (Number(claimed.meta.changes) !== 1) return false

  return await failClaimedStripeWebhookEvent(db, processor, stripeEventId, claimToken, message, now)
}

async function failClaimedStripeWebhookEvent(
  db: DbClient,
  processor: StripeWebhookProcessor,
  stripeEventId: string,
  claimToken: string,
  message: string,
  now: Date,
): Promise<boolean> {
  const nowIso = now.toISOString()
  const retryAt = new Date(now.getTime() + WEBHOOK_RETRY_MS).toISOString()
  const failed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = CASE WHEN attempt_count >= ? THEN 'dead_letter' ELSE 'failed' END,
        error = ?, claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
        next_attempt_at = CASE WHEN attempt_count >= ? THEN NULL ELSE ? END,
        dead_lettered_at = CASE WHEN attempt_count >= ? THEN ? ELSE NULL END
    WHERE stripe_event_id = ? AND processor = ? AND status = 'pending' AND claim_token = ?
  `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, message, MAX_STRIPE_WEBHOOK_ATTEMPTS, retryAt, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, stripeEventId, processor, claimToken])
  if (Number(failed.meta.changes) !== 1) {
    console.error('stripe_webhook_failure_state_update_skipped', { stripeEventId, processor })
    return false
  }
  const attempts = await queryFirst<{ attempt_count: number }>(db, `
    SELECT attempt_count
    FROM stripe_webhook_events
    WHERE stripe_event_id = ? AND processor = ?
    LIMIT 1
  `, [stripeEventId, processor])
  if (attempts && attempts.attempt_count >= MAX_STRIPE_WEBHOOK_ATTEMPTS) {
    console.error('stripe_webhook_dead_lettered', { stripeEventId, processor, error: message })
  } else {
    console.error('stripe_webhook_event_failed', { stripeEventId, processor, error: message })
  }
  return true
}

export async function processStripeWebhookEvent(
  db: DbClient,
  event: StripeWebhookEventInput,
  work: () => Promise<void>,
): Promise<boolean> {
  await enqueueStripeWebhookEvent(db, event)
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString()
  const claimToken = crypto.randomUUID()
  const claimed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', claimed_at = ?, lease_expires_at = ?, claim_token = ?,
        attempt_count = attempt_count + 1, error = NULL, next_attempt_at = NULL
    WHERE stripe_event_id = ? AND processor = ?
      AND status IN ('pending', 'failed')
      AND attempt_count < ?
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `, [nowIso, leaseExpiresAt, claimToken, event.id, event.processor, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, nowIso])
  if (Number(claimed.meta.changes) !== 1) return false

  try {
    await work()
    const completed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'processed', error = NULL, claimed_at = NULL,
          lease_expires_at = NULL, claim_token = NULL, next_attempt_at = NULL
      WHERE stripe_event_id = ? AND processor = ? AND status = 'pending' AND claim_token = ?
    `, [event.id, event.processor, claimToken])
    if (Number(completed.meta.changes) !== 1) throw new Error(`Lost Stripe webhook lease for ${event.id}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failClaimedStripeWebhookEvent(db, event.processor, event.id, claimToken, message, now)
    throw error
  }
}
