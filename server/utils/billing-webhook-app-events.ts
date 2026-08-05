import type Stripe from 'stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { completePaidSiteTransfer } from '~/server/utils/site-transfer'
import { markOrganizationPayment, type BetterAuthSubscriptionAdapter } from '~/server/utils/better-auth-stripe'

function invoiceSubscriptionId(invoice: Stripe.Invoice & {
  subscription?: string | { id: string } | null
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
}): string | null {
  const value = invoice.subscription ?? invoice.parent?.subscription_details?.subscription
  return typeof value === 'string' ? value : value?.id ?? null
}

async function markSubscriptionPayment(
  db: D1Database,
  subscriptionId: string,
  paymentStatus: 'processing' | 'failed',
  metadataOrganizationId?: string,
  adapter?: BetterAuthSubscriptionAdapter,
  event?: Stripe.Event,
): Promise<void> {
  const local = adapter
    ? await adapter.findOne<{ referenceId: string; stripeCustomerId: string | null }>({
        model: 'subscription',
        where: [{ field: 'stripeSubscriptionId', value: subscriptionId }],
      }).then(row => row
        ? { organizationId: row.referenceId, customerId: row.stripeCustomerId }
        : null)
    : await queryFirst<{ organizationId: string; customerId: string | null }>(db, `
        SELECT referenceId AS organizationId, stripeCustomerId AS customerId
        FROM subscription WHERE stripeSubscriptionId = ? LIMIT 1
      `, [subscriptionId])
  const legacy = await queryFirst<{ organizationId: string; customerId: string | null }>(db, `
    SELECT organization_id AS organizationId, stripe_customer_id AS customerId
    FROM organization_billing WHERE stripe_subscription_id = ? LIMIT 1
  `, [subscriptionId])
  const organizationId = local?.organizationId ?? legacy?.organizationId ?? metadataOrganizationId
  if (!organizationId) throw new Error(`Subscription ${subscriptionId} has no organization reference; retrying`)
  await markOrganizationPayment(db, {
    organizationId,
    customerId: local?.customerId ?? legacy?.customerId ?? null,
    subscriptionId,
    paymentStatus,
    eventCreated: event?.created ?? 0,
    eventId: event?.id ?? `payment:${subscriptionId}:${paymentStatus}`,
  })
}

/**
 * Handles the remaining one-time application purchases. Subscription events
 * are intentionally excluded: Better Auth Stripe owns those lifecycle events.
 */
export async function handleApplicationStripeEvent(
  env: CloudflareEnv,
  db: D1Database,
  event: Stripe.Event,
  adapter?: BetterAuthSubscriptionAdapter,
): Promise<void> {
  if (
    event.type === 'invoice.payment_failed'
    || event.type === 'invoice.voided'
    || event.type === 'invoice.marked_uncollectible'
  ) {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | { id: string } | null
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
    }
    const subscriptionId = invoiceSubscriptionId(invoice)
    if (subscriptionId) await markSubscriptionPayment(db, subscriptionId, 'failed', undefined, adapter, event)
    return
  }

  if (
    event.type !== 'checkout.session.completed'
    && event.type !== 'checkout.session.async_payment_succeeded'
    && event.type !== 'checkout.session.async_payment_failed'
  ) return
  const session = event.data.object as Stripe.Checkout.Session

  const metadata = session.metadata ?? {}
  const organizationId = metadata.organization_id
  if (session.mode === 'subscription' && metadata.type !== 'site_transfer') {
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (subscriptionId) {
      await markSubscriptionPayment(
        db,
        subscriptionId,
        event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'processing',
        organizationId,
        adapter,
        event,
      )
    }
    return
  }
  if (session.payment_status !== 'paid') return

  if (metadata.type === 'credit_topup') {
    const credits = Number(metadata.credits)
    if (!organizationId || !Number.isSafeInteger(credits) || credits <= 0) {
      throw new Error(`Invalid credit top-up metadata for checkout ${session.id}`)
    }
    const now = new Date().toISOString()
    await executeBatch(db, [
      {
        query: `
          INSERT OR IGNORE INTO ai_credits
            (organization_id, balance, lifetime_used, last_topped_up_at, updated_at)
          VALUES (?, 0, 0, NULL, ?)
        `,
        params: [organizationId, now],
      },
      {
        query: `
          INSERT OR IGNORE INTO stripe_credit_topups
            (checkout_session_id, organization_id, credits, created_at)
          VALUES (?, ?, ?, ?)
        `,
        params: [session.id, organizationId, credits, now],
      },
      {
        query: `
          UPDATE ai_credits
          SET balance = balance + ?, last_topped_up_at = ?, updated_at = ?
          WHERE organization_id = ?
            AND EXISTS (
              SELECT 1 FROM stripe_credit_topups
              WHERE checkout_session_id = ?
                AND organization_id = ?
                AND credits = ?
                AND processed_at IS NULL
            )
        `,
        params: [credits, now, now, organizationId, session.id, organizationId, credits],
      },
      {
        query: `
          UPDATE stripe_credit_topups
          SET processed_at = ?
          WHERE checkout_session_id = ? AND processed_at IS NULL
        `,
        params: [now, session.id],
      },
    ])
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
    if (!organizationId || !transferId || !metadata.plan || !(metadata.transfer_site_id ?? metadata.site_id)) {
      throw new Error(`Invalid site transfer metadata for checkout ${session.id}`)
    }
    await completePaidSiteTransfer(env, db, transferId)
  }
}
