import type Stripe from 'stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
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
  pastDueSince?: string | null,
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
    pastDueSince,
  })
}

function invoicePeriodEndIso(invoice: Stripe.Invoice & { period_end?: number; lines?: { data?: Array<{ period?: { end?: number } | null }> } }): string | null {
  const seconds = invoice.period_end ?? invoice.lines?.data?.map(line => line.period?.end).find((value): value is number => typeof value === 'number')
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

/**
 * Handles the non-subscription application events that remain outside Better
 * Auth Stripe. Subscription events are intentionally excluded: Better Auth
 * Stripe owns those lifecycle events. Historical one-time checkout metadata
 * is acknowledged and ignored; it must not create new credits or add-ons.
 */
export async function handleApplicationStripeEvent(
  env: CloudflareEnv,
  db: D1Database,
  event: Stripe.Event,
  adapter: BetterAuthSubscriptionAdapter,
): Promise<void> {
  if (
    event.type === 'invoice.payment_succeeded'
    || event.type === 'invoice.payment_failed'
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
      event.type === 'invoice.payment_succeeded' ? 'paid' : 'failed',
      adapter,
      undefined,
      event,
      invoice.id,
      invoicePeriodEndIso(invoice),
      event.type === 'invoice.payment_succeeded'
        ? null
        : typeof invoice.created === 'number' ? new Date(invoice.created * 1000).toISOString() : null,
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
    // Checkout completion is only a UX/payment-processing signal. It does not
    // identify a paid billing period reliably (and may not even have a
    // finalized invoice yet); invoice.paid is the sole source of subscription
    // coverage and quota grants.
    return
  }
  if (session.payment_status !== 'paid') return

  if (metadata.type === 'credit_topup' || metadata.type === 'service_addon') {
    console.info('retired_stripe_checkout_ignored', {
      checkoutSessionId: session.id,
      organizationId: organizationId ?? null,
      type: metadata.type,
    })
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
