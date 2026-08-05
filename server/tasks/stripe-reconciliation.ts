import Stripe from 'stripe'
import { queryAll, type DbClient } from '~/server/db'
import { recordStripeEvent, grantInvoiceQuota, reconcileBetterAuthSubscriptionEvent } from '~/server/utils/better-auth-stripe'
import { handleApplicationStripeEvent } from '~/server/utils/billing-webhook-app-events'

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

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 10_000 })
    const events = await queryAll<RetryableStripeEvent>(db, `
      SELECT stripe_event_id, payload
      FROM stripe_webhook_events
      WHERE status = 'failed'
         OR (status = 'pending' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
      ORDER BY created_at
      LIMIT 100
    `, [new Date().toISOString()])

    let processed = 0
    let failed = 0
    for (const row of events) {
      if (!row.payload) {
        failed += 1
        continue
      }
      let event: Stripe.Event
      try {
        event = JSON.parse(row.payload) as Stripe.Event
      } catch {
        failed += 1
        continue
      }

      try {
        const claimed = await recordStripeEvent(db, event, async () => {
          await reconcileBetterAuthSubscriptionEvent(db, event, stripe)
          await handleApplicationStripeEvent(env, db as D1Database, event)
          await grantInvoiceQuota(db, stripe, event)
        })
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
