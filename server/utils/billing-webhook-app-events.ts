import type Stripe from 'stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { completePaidSiteTransfer } from '~/server/utils/site-transfer'
import { invoiceSubscriptionId, markOrganizationPayment, type BetterAuthSubscriptionAdapter } from '~/server/utils/better-auth-stripe'

async function markSubscriptionPayment(
  db: D1Database,
  subscriptionId: string,
  paymentStatus: 'paid' | 'processing' | 'failed',
  adapter: BetterAuthSubscriptionAdapter,
  metadataOrganizationId?: string,
  event?: Stripe.Event,
  invoiceId?: string | null,
  invoicePeriodEnd?: string | null,
): Promise<void> {
  const local = await adapter.findOne<{ referenceId: string; stripeCustomerId: string | null }>({
    model: 'subscription',
    where: [{ field: 'stripeSubscriptionId', value: subscriptionId }],
  }).then(row => row
    ? { organizationId: row.referenceId, customerId: row.stripeCustomerId }
    : null)
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
    invoiceId,
    invoicePeriodEnd,
  })
}

function invoicePeriodEndIso(invoice: Stripe.Invoice & { period_end?: number; lines?: { data?: Array<{ period?: { end?: number } | null }> } }): string | null {
  const seconds = invoice.period_end ?? invoice.lines?.data?.map(line => line.period?.end).find((value): value is number => typeof value === 'number')
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

/**
 * Handles the remaining one-time application purchases. Subscription events
 * are intentionally excluded: Better Auth Stripe owns those lifecycle events.
 */
export async function handleApplicationStripeEvent(
  env: CloudflareEnv,
  db: D1Database,
  event: Stripe.Event,
  adapter: BetterAuthSubscriptionAdapter,
): Promise<void> {
  if (
    event.type === 'invoice.payment_failed'
    || event.type === 'invoice.voided'
    || event.type === 'invoice.marked_uncollectible'
  ) {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | { id: string } | null
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
      period_end?: number
    }
    const subscriptionId = invoiceSubscriptionId(invoice)
    if (subscriptionId) await markSubscriptionPayment(
      db,
      subscriptionId,
      'failed',
      adapter,
      undefined,
      event,
      invoice.id,
      invoicePeriodEndIso(invoice),
    )
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
        event.type === 'checkout.session.async_payment_failed'
          ? 'failed'
          : event.type === 'checkout.session.async_payment_succeeded'
            ? 'paid'
            : session.payment_status === 'paid'
              ? 'paid'
              : 'processing',
        adapter,
        organizationId,
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
      INSERT INTO service_addon_purchases
        (id, organization_id, addon_type, checkout_session_id, stripe_payment_intent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(checkout_session_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        addon_type = excluded.addon_type,
        stripe_payment_intent_id = COALESCE(excluded.stripe_payment_intent_id, service_addon_purchases.stripe_payment_intent_id)
    `, [
      `stripe-addon-${session.id}`,
      organizationId,
      addonType,
      session.id,
      paymentIntentId,
      new Date().toISOString(),
    ])
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
