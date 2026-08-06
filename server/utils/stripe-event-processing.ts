import type Stripe from 'stripe'
import type { DbClient } from '~/server/db'
import {
  grantInvoiceQuota,
  reconcileBetterAuthSubscriptionEvent,
  recordStripeEvent,
  type BetterAuthSubscriptionAdapter,
  type StripePlanLoader,
} from '~/server/utils/better-auth-stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { handleApplicationStripeEvent } from '~/server/utils/billing-webhook-app-events'

export async function processStripeEvent(
  env: CloudflareEnv,
  db: DbClient,
  event: Stripe.Event,
  stripe: Stripe,
  adapter: BetterAuthSubscriptionAdapter,
  loadStripePlans: StripePlanLoader,
): Promise<boolean> {
  return recordStripeEvent(db, event, async () => {
    await reconcileBetterAuthSubscriptionEvent(db, event, stripe, adapter, loadStripePlans)
    await handleApplicationStripeEvent(env, db as D1Database, event, adapter)
    await grantInvoiceQuota(db, stripe, event, adapter, loadStripePlans)
  })
}
