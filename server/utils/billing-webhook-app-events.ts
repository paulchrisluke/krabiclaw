import type Stripe from 'stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { execute } from '~/server/db'
import { completePaidSiteTransfer } from '~/server/utils/site-transfer'

/**
 * Handles the remaining one-time application purchases. Subscription events
 * are intentionally excluded: Better Auth Stripe owns those lifecycle events.
 */
export async function handleApplicationStripeEvent(
  env: CloudflareEnv,
  db: D1Database,
  event: Stripe.Event,
): Promise<void> {
  if (event.type !== 'checkout.session.completed') return
  const session = event.data.object as Stripe.Checkout.Session
  if (session.mode === 'subscription') return

  const metadata = session.metadata ?? {}
  const organizationId = metadata.organization_id

  if (metadata.type === 'credit_topup') {
    const credits = Number(metadata.credits)
    if (!organizationId || !Number.isSafeInteger(credits) || credits <= 0) {
      throw new Error(`Invalid credit top-up metadata for checkout ${session.id}`)
    }
    const now = new Date().toISOString()
    await execute(db, `
      INSERT INTO ai_credits (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        balance = balance + excluded.balance,
        last_topped_up_at = excluded.last_topped_up_at,
        updated_at = excluded.updated_at
    `, [organizationId, credits, now, now])
    return
  }

  if (metadata.type === 'service_addon') {
    const addonType = metadata.addon_type
    if (!organizationId || !addonType) throw new Error(`Invalid service add-on metadata for checkout ${session.id}`)
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null
    await execute(db, `
      INSERT OR IGNORE INTO service_addon_purchases
        (id, organization_id, addon_type, stripe_payment_intent_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [crypto.randomUUID(), organizationId, addonType, paymentIntentId, new Date().toISOString()])
    return
  }

  if (metadata.type === 'site_transfer') {
    const transferId = metadata.transfer_request_id
    const plan = metadata.plan
    const siteId = metadata.transfer_site_id ?? metadata.site_id
    if (!organizationId || !transferId || !plan || !siteId) {
      throw new Error(`Invalid site transfer metadata for checkout ${session.id}`)
    }
    await completePaidSiteTransfer(env, db, transferId)
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!subscriptionId) throw new Error(`Site transfer checkout ${session.id} has no subscription`)
    await execute(db, `
      UPDATE site_billing
      SET stripe_subscription_id = ?, plan = ?, status = 'active', updated_at = ?
      WHERE site_id = ? AND organization_id = ?
    `, [subscriptionId, plan, new Date().toISOString(), siteId, organizationId])
  }
}
