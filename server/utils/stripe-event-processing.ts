import type Stripe from 'stripe'
import type { DbClient } from '~/server/db'
import {
  reconcileBetterAuthSubscriptionEvent,
  recordStripeEvent,
  type BetterAuthSubscriptionAdapter,
  type StripePlanLoader,
} from '~/server/utils/better-auth-stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { handleApplicationStripeEvent } from '~/server/utils/billing-webhook-app-events'
import { handleStripeGa4Event } from '~/server/utils/stripe-ga4'

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
    await handleApplicationStripeEvent(env, db as D1Database, event, adapter, stripe, loadStripePlans)
    await handleStripeGa4Event(env, db, stripe, event)
  })
}
