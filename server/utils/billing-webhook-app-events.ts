import type Stripe from 'stripe'
import type { CloudflareEnv } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import {
  completePaidSiteTransfer,
  isTransferClaimSentinel,
} from '~/server/utils/site-transfer'
import {
  invoiceSubscriptionId,
  markOrganizationPayment,
  projectOrganizationSubscription,
  resolveCanonicalSubscriptionPlan,
  type BetterAuthSubscriptionAdapter,
  type StripePlanLoader,
} from '~/server/utils/better-auth-stripe'
import {
  invoiceLineExactQuantity,
  invoiceLineIsProration,
  invoiceLineIsSubscription,
  invoiceLinePrice,
  invoiceLineSubscriptionId,
  invoiceLineSubscriptionItemId,
  loadStripeInvoiceLines,
} from '~/server/utils/stripe-invoice-lines'

async function markSubscriptionPayment(
  db: D1Database,
  subscriptionId: string,
  paymentStatus: 'paid' | 'processing' | 'failed',
  adapter: BetterAuthSubscriptionAdapter,
  metadataOrganizationId?: string,
  event?: Stripe.Event,
  invoiceId?: string | null,
  basePlanPriceId?: string | null,
  invoicePeriodStart?: string | null,
  invoicePeriodEnd?: string | null,
  pastDueSince?: string | null,
  canonicalPaidEvidence = false,
): Promise<{
  organizationId: string
  customerId: string | null
}> {
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
  const customerId = local?.customerId ?? legacy?.customerId ?? null
  await markOrganizationPayment(db, {
    organizationId,
    customerId,
    subscriptionId,
    paymentStatus,
    eventCreated: event?.created ?? 0,
    eventId: event?.id ?? `payment:${subscriptionId}:${paymentStatus}`,
    invoiceId,
    basePlanPriceId,
    invoicePeriodStart,
    invoicePeriodEnd,
    pastDueSince,
    canonicalPaidEvidence,
  })
  return {
    organizationId,
    customerId,
  }
}

function priceId(value: string | Stripe.Price | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null
}

function periodIso(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : null
}

interface SiteTransferCheckoutRow {
  id: string
  site_id: string
  status: string
  invited_plan: string | null
  requires_payment: number
  stripe_checkout_session_id: string | null
  claiming_user_id: string | null
  claiming_organization_id: string | null
  payment_completed_at: string | null
}

function checkoutSubscriptionId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.subscription === 'string') {
    return session.subscription.startsWith('sub_') && session.subscription.length > 4
      ? session.subscription
      : null
  }
  if (session.subscription && typeof session.subscription === 'object' && 'id' in session.subscription) {
    return typeof session.subscription.id === 'string'
      && session.subscription.id.startsWith('sub_')
      && session.subscription.id.length > 4
      ? session.subscription.id
      : null
  }
  return null
}

function stripeCustomerId(value: Stripe.Checkout.Session['customer'] | Stripe.Subscription['customer']): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id.trim()) {
    return value.id
  }
  return null
}

function requiredTransferMetadata(metadata: Stripe.Metadata, key: string, checkoutSessionId: string): string {
  const value = metadata[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid site transfer metadata for checkout ${checkoutSessionId}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function validateSiteTransferCheckout(
  db: D1Database,
  session: Stripe.Checkout.Session,
  metadata: Stripe.Metadata,
  adapter: BetterAuthSubscriptionAdapter,
  stripe: Stripe,
  loadStripePlans: StripePlanLoader,
): Promise<string> {
  if (
    typeof session.id !== 'string'
    || !session.id.startsWith('cs_')
    || session.id.length <= 3
    || isTransferClaimSentinel(session.id)
  ) {
    throw new Error(`Site transfer checkout ${session.id} is not a real Checkout session`)
  }
  if (session.status !== 'complete') {
    throw new Error(`Site transfer checkout ${session.id} is not complete`)
  }
  if (session.payment_status !== 'paid') {
    throw new Error(`Site transfer checkout ${session.id} is not paid`)
  }
  if (session.mode !== 'subscription' || !checkoutSubscriptionId(session)) {
    throw new Error(`Site transfer checkout ${session.id} is missing subscription-mode evidence`)
  }

  const transferId = requiredTransferMetadata(metadata, 'transfer_request_id', session.id)
  const organizationId = requiredTransferMetadata(metadata, 'organization_id', session.id)
  const referenceId = requiredTransferMetadata(metadata, 'referenceId', session.id)
  const siteId = requiredTransferMetadata(metadata, 'transfer_site_id', session.id)
  const plan = requiredTransferMetadata(metadata, 'plan', session.id)
  const claimingUserId = requiredTransferMetadata(metadata, 'transfer_claiming_user_id', session.id)
  const claimingOrganizationId = requiredTransferMetadata(metadata, 'transfer_claiming_organization_id', session.id)
  if (referenceId !== organizationId || session.client_reference_id !== organizationId) {
    throw new Error(`Checkout reference does not match site transfer ${transferId}`)
  }

  const transfer = await queryFirst<SiteTransferCheckoutRow>(db, `
    SELECT id, site_id, status, invited_plan, requires_payment,
           stripe_checkout_session_id, claiming_user_id, claiming_organization_id,
           payment_completed_at
      FROM site_transfer_requests
     WHERE id = ?
     LIMIT 1
  `, [transferId])

  if (!transfer) throw new Error(`Site transfer ${transferId} was not found for checkout ${session.id}`)
  if (transfer.id !== transferId) throw new Error(`Site transfer id mismatch for checkout ${session.id}`)
  if (transfer.status === 'cancelled') {
    throw new Error(`Site transfer ${transferId} is cancelled`)
  }
  if (transfer.status !== 'pending' && transfer.status !== 'accepted') {
    throw new Error(`Site transfer ${transferId} is not payable in status ${transfer.status}`)
  }
  if (isTransferClaimSentinel(transfer.stripe_checkout_session_id)) {
    throw new Error(`Site transfer ${transferId} still has a claim reservation instead of a Checkout session`)
  }
  if (transfer.stripe_checkout_session_id !== session.id) {
    throw new Error(`Checkout session ${session.id} is not the stored session for site transfer ${transferId}`)
  }
  if (transfer.site_id !== siteId) throw new Error(`Checkout site does not match site transfer ${transferId}`)
  if (transfer.invited_plan !== plan) throw new Error(`Checkout plan does not match site transfer ${transferId}`)
  if (transfer.requires_payment !== 1) throw new Error(`Site transfer ${transferId} does not require payment`)
  if (transfer.claiming_organization_id !== organizationId || transfer.claiming_organization_id !== claimingOrganizationId) {
    throw new Error(`Checkout organization does not match site transfer ${transferId}`)
  }
  if (transfer.claiming_user_id !== claimingUserId) {
    throw new Error(`Checkout claimant does not match site transfer ${transferId}`)
  }

  const subscriptionId = checkoutSubscriptionId(session)
  if (!subscriptionId || !subscriptionId.trim()) {
    throw new Error(`Site transfer checkout ${session.id} is missing subscription-mode evidence`)
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })
  if (!isRecord(subscription) || subscription.id !== subscriptionId) {
    throw new Error(`Stripe subscription ${subscriptionId} did not match the Checkout session; retrying`)
  }

  const checkoutCustomerId = stripeCustomerId(session.customer)
  const subscriptionCustomerId = stripeCustomerId(subscription.customer)
  if (!checkoutCustomerId || !subscriptionCustomerId || checkoutCustomerId !== subscriptionCustomerId) {
    throw new Error(`Stripe Checkout customer does not match subscription ${subscriptionId}`)
  }

  const resolved = await resolveCanonicalSubscriptionPlan(stripe, subscription, loadStripePlans)
  const canonicalPlan = resolved?.plan?.name
  const baseItem = resolved?.item
  if (
    typeof canonicalPlan !== 'string'
    || !canonicalPlan.trim()
    || !baseItem
    || typeof baseItem !== 'object'
  ) {
    throw new Error(`Stripe subscription ${subscriptionId} has malformed canonical plan evidence; retrying`)
  }
  if (canonicalPlan !== plan || canonicalPlan !== transfer.invited_plan) {
    throw new Error(`Stripe subscription plan does not match site transfer ${transferId}`)
  }

  const recurring = baseItem?.price?.recurring
  if (!recurring || recurring.interval_count !== 1 || baseItem.quantity !== 1) {
    throw new Error(`Stripe subscription ${subscriptionId} has invalid canonical base quantity; retrying`)
  }

  const betterAuthSubscription = await adapter.findOne<Record<string, unknown>>({
    model: 'subscription',
    where: [{ field: 'stripeSubscriptionId', value: subscriptionId }],
  })
  if (!isRecord(betterAuthSubscription)) {
    throw new Error(`Better Auth subscription ${subscriptionId} was not found; retrying`)
  }
  if (
    betterAuthSubscription.referenceId !== organizationId
    || betterAuthSubscription.stripeCustomerId !== checkoutCustomerId
    || betterAuthSubscription.plan !== canonicalPlan
    || betterAuthSubscription.stripeSubscriptionId !== subscriptionId
  ) {
    throw new Error(`Better Auth subscription ${subscriptionId} does not match site transfer ${transferId}; retrying`)
  }

  return transferId
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
  stripe: Stripe,
  loadStripePlans: StripePlanLoader,
): Promise<void> {
  if (
    event.type === 'invoice.paid'
    || event.type === 'invoice.payment_failed'
    || event.type === 'invoice.voided'
    || event.type === 'invoice.marked_uncollectible'
  ) {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | { id: string } | null
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
      period_start?: number
      period_end?: number
    }
    const subscriptionId = invoiceSubscriptionId(invoice)
    if (!subscriptionId) return

    // Invoice lifecycle events are authoritative only when the complete
    // invoice contains the exact configured-or-historical base subscription
    // item for this subscription. Seat/add-on-only invoices are ignored so
    // they cannot grant or revoke plan coverage.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    })
    const resolved = await resolveCanonicalSubscriptionPlan(stripe, subscription, loadStripePlans)
    const lines = await loadStripeInvoiceLines(stripe, invoice)
    const baseLines = lines.filter((line) => {
      if (invoiceLineSubscriptionId(line) !== subscriptionId) return false
      if (invoiceLineSubscriptionItemId(line) !== resolved.item.id) return false
      if (!invoiceLineIsSubscription(line) || invoiceLineIsProration(line)) return false
      if (resolved.item.quantity !== 1 || invoiceLineExactQuantity(line) !== 1) return false
      return priceId(invoiceLinePrice(line)) === resolved.item.price.id
    })
    if (baseLines.length > 1) {
      throw new Error(`Stripe invoice ${invoice.id} has ambiguous canonical base plan lines; retrying`)
    }
    const baseLine = baseLines[0]
    if (!baseLine) return

    const canonicalPeriodStart = periodIso(baseLine.period?.start)
    const canonicalPeriodEnd = periodIso(baseLine.period?.end)
    if (
      !canonicalPeriodStart
      || !canonicalPeriodEnd
      || Date.parse(canonicalPeriodStart) >= Date.parse(canonicalPeriodEnd)
    ) {
      throw new Error(`Stripe invoice ${invoice.id} has malformed canonical base plan period; retrying`)
    }
    const periodStart = canonicalPeriodStart
    const periodEnd = canonicalPeriodEnd
    const payment = await markSubscriptionPayment(
      db,
      subscriptionId,
      event.type === 'invoice.paid' ? 'paid' : 'failed',
      adapter,
      undefined,
      event,
      invoice.id,
      resolved.item.price.id,
      periodStart,
      periodEnd,
      event.type === 'invoice.paid'
        ? null
        : typeof invoice.created === 'number' ? new Date(invoice.created * 1000).toISOString() : null,
      event.type === 'invoice.paid',
    )

    // Checkout reconciliation can run before invoice.paid. Re-project after
    // the ledger write in this same event attempt so the newly authoritative
    // payment status is reflected in organization and site entitlements.
    await projectOrganizationSubscription(db, {
      organizationId: payment.organizationId,
      customerId: typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id ?? payment.customerId,
      subscriptionId,
      plan: resolved.plan.name,
      status: subscription.status,
      periodEnd: new Date(periodEnd),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    })
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
    // payment coverage. Quota follows the Better Auth subscription-period
    // projection.
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
    const transferId = await validateSiteTransferCheckout(db, session, metadata, adapter, stripe, loadStripePlans)
    await completePaidSiteTransfer(env, db, transferId)
  }
}
