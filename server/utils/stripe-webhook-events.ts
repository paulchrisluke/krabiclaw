import { execute, queryFirst, type DbClient } from '~/server/db'

export type StripeWebhookProcessor = 'connect_marketplace' | 'tenant_payments'

export interface StripeWebhookEventInput {
  id: string
  type: string
  payload: string
  processor: StripeWebhookProcessor
}

const WEBHOOK_LEASE_MS = 5 * 60 * 1000

/** Deduplicate concurrent handlers; Stripe owns failed-delivery retries. */
export async function processStripeWebhookEvent(
  db: DbClient,
  event: StripeWebhookEventInput,
  work: () => Promise<void>,
): Promise<boolean> {
  const now = new Date()
  const nowIso = now.toISOString()
  await execute(db, `
    INSERT OR IGNORE INTO stripe_webhook_events
      (id, stripe_event_id, event_type, processor, status, payload, attempt_count, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, 0, ?)
  `, [crypto.randomUUID(), event.id, event.type, event.processor, event.payload, nowIso])
  const claimToken = crypto.randomUUID()
  const claimed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', claimed_at = ?, lease_expires_at = ?, claim_token = ?,
        attempt_count = attempt_count + 1, error = NULL
    WHERE stripe_event_id = ? AND processor = ?
      AND status <> 'processed'
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
  `, [nowIso, new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString(), claimToken, event.id, event.processor, nowIso])
  if (Number(claimed.meta.changes) !== 1) {
    const existing = await queryFirst<{ status: string }>(db, `
      SELECT status FROM stripe_webhook_events WHERE stripe_event_id = ? AND processor = ?
    `, [event.id, event.processor])
    return existing?.status === 'processed'
  }

  try {
    await work()
    const completed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'processed', error = NULL, claimed_at = NULL,
          lease_expires_at = NULL, claim_token = NULL,
          payload = NULL
      WHERE stripe_event_id = ? AND processor = ? AND status = 'pending' AND claim_token = ?
    `, [event.id, event.processor, claimToken])
    if (Number(completed.meta.changes) !== 1) throw new Error(`Lost Stripe webhook lease for ${event.id}`)
    return true
  } catch (error) {
    const failed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'failed', error = ?, claimed_at = NULL, lease_expires_at = NULL,
          claim_token = NULL
      WHERE stripe_event_id = ? AND processor = ? AND status = 'pending' AND claim_token = ?
    `, [error instanceof Error ? error.message : String(error), event.id, event.processor, claimToken])
    if (Number(failed.meta.changes) !== 1) throw new Error(`Lost Stripe webhook failure lease for ${event.id}`, { cause: error })
    throw error
  }
}
