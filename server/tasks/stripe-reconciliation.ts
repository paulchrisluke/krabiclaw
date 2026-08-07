import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, queryAll, type DbClient } from '~/server/db'
import { createStripePlanLoader, recordStripeEventFailure, MAX_STRIPE_WEBHOOK_ATTEMPTS, type BetterAuthSubscriptionAdapter } from '~/server/utils/better-auth-stripe'
import type Stripe from 'stripe'
import { processStripeEvent } from '~/server/utils/stripe-event-processing'
import { createStripeClient } from '~/server/utils/stripe-client'
import { expireStripeGa4Intents } from '~/server/utils/stripe-ga4-intents'

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

export default defineTask({
  meta: {
    name: 'billing:stripe-reconciliation',
    description: 'Retry leased Stripe events whose Better Auth or app projection did not complete',
  },
  async run({ context }): Promise<{ result: StripeTaskResult }> {
    const env = (context as StripeTaskContext | undefined)?.cloudflare?.env ?? {}
    const db = env.DB as DbClient | undefined
    const empty: StripeTaskResult = { checked: 0, processed: 0, failed: 0 }
    if (!db && import.meta.dev) return { result: { ...empty, skipped: 'DB unavailable in local scheduled task context' } }
    if (!db) throw new Error('DB is required')
    if (!env.STRIPE_SECRET_KEY) return { result: { ...empty, skipped: 'STRIPE_SECRET_KEY is not configured' } }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
    const loadStripePlans = createStripePlanLoader(stripe, env)
    const auth = createAuth(env as CloudflareEnv)
    const authContext = await auth.$context
    const adapter = authContext.adapter as unknown as BetterAuthSubscriptionAdapter
    await clearExpiredStripeEventPayloads(db)
    await expireStripeGa4Intents(db)
    const events = await queryAll<RetryableStripeEvent>(db, `
      SELECT stripe_event_id, payload
      FROM stripe_webhook_events
      WHERE attempt_count < ?
        AND status IN ('failed', 'pending')
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at
      LIMIT 100
    `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, new Date().toISOString(), new Date().toISOString()])

    let processed = 0
    let failed = 0
    for (const row of events) {
      if (!row.payload) {
        await recordStripeEventFailure(db, row.stripe_event_id, 'Stripe webhook payload is missing after retention cleanup')
        failed += 1
        continue
      }
      let event: Stripe.Event
      try {
        event = JSON.parse(row.payload) as Stripe.Event
      } catch {
        await recordStripeEventFailure(db, row.stripe_event_id, 'Stripe webhook payload is not valid JSON')
        failed += 1
        continue
      }

      try {
        const claimed = await processStripeEvent(env as CloudflareEnv, db, event, stripe, adapter, loadStripePlans)
        if (claimed) processed += 1
      } catch (error) {
        failed += 1
        console.error('stripe_reconciliation_event_failed', {
          stripeEventId: row.stripe_event_id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { result: { checked: events.length, processed, failed } }
  },
})
