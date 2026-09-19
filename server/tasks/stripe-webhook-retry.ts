import { execute, queryAll, type DbClient } from '~/server/db'
import { createStripeClient } from '~/server/utils/stripe-client'
import { processStripeConnectEvent } from '~/server/utils/stripe-connect-events'
import { MAX_STRIPE_WEBHOOK_ATTEMPTS, recordStripeWebhookEventFailure } from '~/server/utils/stripe-webhook-events'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

interface StripeTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface RetryableStripeEvent {
  stripe_event_id: string
  payload: string | null
}

interface StripeTaskResult {
  checked: number
  processed: number
  failed: number
  skipped?: string
}

const STRIPE_EVENT_PAYLOAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

async function clearExpiredStripeEventPayloads(db: DbClient, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - STRIPE_EVENT_PAYLOAD_RETENTION_MS).toISOString()
  await execute(db, `
    UPDATE stripe_webhook_events
    SET payload = NULL
    WHERE status IN ('processed', 'dead_letter')
      AND created_at < ?
      AND payload IS NOT NULL
  `, [cutoff])
}

/**
 * Retries Stripe Connect marketplace webhook events whose processing did not
 * complete. Platform billing has no queue any more: the @better-auth/stripe
 * plugin maintains the `subscription` table from its own webhook route and
 * Stripe's delivery retries are the retry mechanism.
 */
export default defineScheduledTask({
  meta: {
    name: 'stripe:webhook-retry',
    description: 'Retry leased Stripe Connect webhook events whose processing did not complete',
  },
  async run({ context }): Promise<{ result: StripeTaskResult }> {
    const env = (context as StripeTaskContext | undefined)?.cloudflare?.env ?? {}
    const db = env.DB as DbClient | undefined
    const empty: StripeTaskResult = { checked: 0, processed: 0, failed: 0 }
    if (!db && import.meta.dev) return { result: { ...empty, skipped: 'DB unavailable in local scheduled task context' } }
    if (!db) throw new Error('DB is required')
    if (!env.STRIPE_SECRET_KEY) return { result: { ...empty, skipped: 'STRIPE_SECRET_KEY is not configured' } }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
    await clearExpiredStripeEventPayloads(db)
    const nowIso = new Date().toISOString()
    const events = await queryAll<RetryableStripeEvent>(db, `
      SELECT stripe_event_id, payload
      FROM stripe_webhook_events
      WHERE processor = 'connect_marketplace'
        AND attempt_count < ?
        AND status IN ('failed', 'pending')
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at
      LIMIT 100
    `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, nowIso])

    let processed = 0
    let failed = 0
    for (const row of events) {
      if (!row.payload) {
        await recordStripeWebhookEventFailure(db, 'connect_marketplace', row.stripe_event_id, 'Stripe webhook payload is missing after retention cleanup')
        failed += 1
        continue
      }
      try {
        const notification = stripe.parseEventNotificationWithoutVerification(row.payload)
        if (await processStripeConnectEvent(db, stripe, notification, row.payload)) processed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await recordStripeWebhookEventFailure(db, 'connect_marketplace', row.stripe_event_id, message)
        failed += 1
        console.error('stripe_webhook_retry_event_failed', { stripeEventId: row.stripe_event_id, error: message })
      }
    }
    return { result: { checked: events.length, processed, failed } }
  },
})
