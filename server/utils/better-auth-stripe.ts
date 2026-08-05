import type Stripe from 'stripe'
import type { StripePlan, Subscription as BetterAuthSubscription } from '@better-auth/stripe'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { grantQuota } from '~/server/utils/usage-metering'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'

const WEBHOOK_LEASE_MS = 5 * 60 * 1000
const INVOICE_QUOTA_BILLING_REASONS = new Set(['subscription_create', 'subscription_cycle'])

export function selectCanonicalStripePrice(
  product: Stripe.Product,
  prices: Stripe.Price[],
  interval: 'month' | 'year',
): Stripe.Price | null {
  const candidates = prices.filter(price =>
    price.recurring?.interval === interval
    && price.recurring.interval_count === 1
    && typeof price.unit_amount === 'number'
    && price.unit_amount > 0
    && typeof price.currency === 'string'
    && price.currency.length > 0,
  )
  if (candidates.length === 0) return null

  const metadataKey = interval === 'month' ? 'monthly_price_id' : 'annual_price_id'
  const metadataPriceId = product.metadata?.[metadataKey]?.trim()
  if (metadataPriceId) {
    const selected = candidates.find(price => price.id === metadataPriceId)
    if (!selected || candidates.length !== 1) {
      throw new Error(`Stripe product ${product.id} has an invalid ${metadataKey} canonical price`)
    }
    return selected
  }

  const lookupKeyCandidates = candidates.filter(price => {
    const lookupKey = price.lookup_key?.toLowerCase() ?? ''
    return interval === 'month'
      ? lookupKey.includes('month')
      : lookupKey.includes('annual') || lookupKey.includes('year')
  })
  if (lookupKeyCandidates.length > 1) {
    throw new Error(`Stripe product ${product.id} has multiple ${interval} prices marked by lookup_key`)
  }
  if (lookupKeyCandidates.length === 1) {
    if (candidates.length !== 1) {
      throw new Error(`Stripe product ${product.id} has ambiguous ${interval} prices`)
    }
    return lookupKeyCandidates[0] ?? null
  }
  if (candidates.length !== 1) {
    throw new Error(`Stripe product ${product.id} must have exactly one canonical ${interval} price`)
  }
  return candidates[0] ?? null
}

export async function getBetterAuthStripePlans(stripe: Stripe): Promise<StripePlan[]> {
  const products: Stripe.Product[] = []
  let productsStartingAfter: string | undefined
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(productsStartingAfter ? { starting_after: productsStartingAfter } : {}),
    })
    products.push(...page.data)
    productsStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined
  } while (productsStartingAfter)

  const prices: Stripe.Price[] = []
  let pricesStartingAfter: string | undefined
  do {
    const page = await stripe.prices.list({
      active: true,
      type: 'recurring',
      limit: 100,
      ...(pricesStartingAfter ? { starting_after: pricesStartingAfter } : {}),
    })
    prices.push(...page.data)
    pricesStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined
  } while (pricesStartingAfter)

  const pricesByProduct = new Map<string, Stripe.Price[]>()
  for (const price of prices) {
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    const productPrices = pricesByProduct.get(productId) ?? []
    productPrices.push(price)
    pricesByProduct.set(productId, productPrices)
  }

  const plans: StripePlan[] = []
  const planIds = new Set<string>()

  for (const product of products) {
    const planId = product.metadata?.plan_id?.trim()
    if (!planId) continue
    if (planIds.has(planId)) throw new Error(`Stripe has multiple active products for plan ${planId}`)

    const billablePrices = (pricesByProduct.get(product.id) ?? []).filter(
      price => typeof price.unit_amount === 'number' && price.unit_amount > 0,
    )
    const monthly = selectCanonicalStripePrice(product, billablePrices, 'month')
    if (!monthly) {
      throw new Error(`Stripe product ${product.id} for plan ${planId} is missing a canonical monthly price`)
    }
    const yearly = selectCanonicalStripePrice(product, billablePrices, 'year')
    if (yearly && yearly.currency !== monthly.currency) {
      throw new Error(`Stripe product ${product.id} has monthly and annual prices in different currencies`)
    }
    const configuredCurrency = product.metadata?.currency?.trim().toLowerCase()
    if (configuredCurrency && configuredCurrency !== monthly.currency.toLowerCase()) {
      throw new Error(`Stripe product ${product.id} currency metadata does not match its canonical price`)
    }

    plans.push({
      name: planId,
      priceId: monthly.id,
      annualDiscountPriceId: yearly?.id,
      limits: getPlanEntitlements(planId),
      group: 'krabiclaw',
    })
    planIds.add(planId)
  }

  return plans
}

export interface SubscriptionProjectionInput {
  organizationId: string
  customerId: string | null
  subscriptionId: string | null
  plan: string
  status: string
  periodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
}

function isoDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null
}

/**
 * Projects Better Auth Stripe's organization subscription into the existing
 * app-owned billing/entitlement read models. Better Auth remains the billing
 * authority; these rows exist so feature checks and legacy dashboard reads
 * resolve the same organization-level subscription during the migration.
 */
export async function projectOrganizationSubscription(
  db: DbClient,
  input: SubscriptionProjectionInput,
): Promise<void> {
  const now = new Date().toISOString()
  const accessPlan = getEffectiveAccessPlan(input)
  const entitlements = getPlanEntitlements(accessPlan)
  const sites = await queryAll<{ id: string }>(db, `
    SELECT id FROM sites WHERE organization_id = ? ORDER BY id
  `, [input.organizationId])
  const queries: Array<{ query: string; params: unknown[] }> = [
    {
      query: `
        INSERT INTO organization_billing
          (id, organization_id, stripe_customer_id, stripe_subscription_id,
           status, plan, current_period_end, cancel_at_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          status = excluded.status,
          plan = excluded.plan,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          updated_at = excluded.updated_at
      `,
      params: [
        `billing-${input.organizationId}`,
        input.organizationId,
        input.customerId,
        input.subscriptionId,
        input.status,
        input.plan,
        isoDate(input.periodEnd),
        input.cancelAtPeriodEnd ? 1 : 0,
        now,
      ],
    },
    {
      query: `DELETE FROM organization_entitlements WHERE organization_id = ? AND source = 'better-auth-stripe'`,
      params: [input.organizationId],
    },
  ]

  for (const [key, value] of Object.entries(entitlements)) {
    queries.push({
      query: `
        INSERT INTO organization_entitlements
          (id, organization_id, key, value, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'better-auth-stripe', ?, ?)
        ON CONFLICT(organization_id, key) DO UPDATE SET
          value = excluded.value,
          source = excluded.source,
          updated_at = excluded.updated_at
      `,
      params: [`org-${input.organizationId}-${key}`, input.organizationId, key, String(value), now, now],
    })
  }

  for (const site of sites) {
    queries.push({
      query: `DELETE FROM site_entitlements WHERE site_id = ? AND source = 'better-auth-stripe'`,
      params: [site.id],
    })
    for (const [key, value] of Object.entries(entitlements)) {
      queries.push({
        query: `
          INSERT INTO site_entitlements
            (id, site_id, organization_id, key, value, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'better-auth-stripe', ?, ?)
          ON CONFLICT(site_id, key) DO UPDATE SET
            value = excluded.value,
            source = excluded.source,
            updated_at = excluded.updated_at
        `,
        params: [`sent-${site.id}-${key}`, site.id, input.organizationId, key, String(value), now, now],
      })
    }

    queries.push({
      query: `
        INSERT INTO site_billing
          (id, site_id, organization_id, stripe_subscription_id, plan, status,
           current_period_end, cancel_at_period_end, stripe_customer_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(site_id) DO UPDATE SET
          stripe_subscription_id = excluded.stripe_subscription_id,
          plan = excluded.plan,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          stripe_customer_id = excluded.stripe_customer_id,
          updated_at = excluded.updated_at
      `,
      params: [
        `sb-${site.id}`,
        site.id,
        input.organizationId,
        input.subscriptionId,
        input.plan,
        input.status,
        isoDate(input.periodEnd),
        input.cancelAtPeriodEnd ? 1 : 0,
        input.customerId,
        now,
      ],
    })
    queries.push({
      query: `UPDATE sites SET plan = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      params: [accessPlan, now, site.id, input.organizationId],
    })
  }

  const BATCH_SIZE = 50
  for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
    await executeBatch(db, queries.slice(offset, offset + BATCH_SIZE))
  }
}

function stripeCustomerId(customer: Stripe.Subscription['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

export async function projectBetterAuthSubscription(
  db: DbClient,
  subscription: BetterAuthSubscription,
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  await projectOrganizationSubscription(db, {
    organizationId: subscription.referenceId,
    customerId: subscription.stripeCustomerId ?? stripeCustomerId(stripeSubscription.customer),
    subscriptionId: subscription.stripeSubscriptionId ?? stripeSubscription.id ?? null,
    plan: subscription.plan,
    status: subscription.status,
    periodEnd: subscription.periodEnd ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  })
}

export async function projectDeletedBetterAuthSubscription(
  db: DbClient,
  subscription: BetterAuthSubscription,
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  await projectOrganizationSubscription(db, {
    organizationId: subscription.referenceId,
    customerId: subscription.stripeCustomerId ?? stripeCustomerId(stripeSubscription.customer),
    subscriptionId: subscription.stripeSubscriptionId ?? stripeSubscription.id ?? null,
    plan: subscription.plan,
    status: 'canceled',
    periodEnd: subscription.periodEnd ?? null,
    cancelAtPeriodEnd: false,
  })
}

interface ReconciledSubscriptionRow {
  referenceId: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  status: string
  periodStart: number | string | null
  periodEnd: number | string | null
  cancelAtPeriodEnd: number | null
}

function stripeSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnd = subscription.items.data[0]?.current_period_end
  return periodEnd ? new Date(periodEnd * 1000) : null
}

/**
 * Re-runs the application projection after Better Auth handles a lifecycle
 * event. The beta Stripe plugin logs callback failures and still acknowledges
 * the webhook, so this second pass is the durable failure boundary: a missing
 * Better Auth row or a projection error leaves the event retryable.
 */
export async function reconcileBetterAuthSubscriptionEvent(
  db: DbClient,
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription' || session.metadata?.type === 'site_transfer') return
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id
    if (!subscriptionId) throw new Error(`Subscription checkout ${session.id} has no subscription; retrying`)
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId)
    await reconcileSubscriptionRow(db, stripeSubscription, false)
    return
  }

  if (
    event.type !== 'customer.subscription.created'
    && event.type !== 'customer.subscription.updated'
    && event.type !== 'customer.subscription.deleted'
  ) return

  await reconcileSubscriptionRow(
    db,
    event.data.object as Stripe.Subscription,
    event.type === 'customer.subscription.deleted',
  )
}

async function reconcileSubscriptionRow(
  db: DbClient,
  stripeSubscription: Stripe.Subscription,
  deleted: boolean,
): Promise<void> {
  const subscription = await queryFirst<ReconciledSubscriptionRow>(db, `
    SELECT referenceId, plan, stripeCustomerId, stripeSubscriptionId, status,
           periodStart, periodEnd, cancelAtPeriodEnd
    FROM subscription
    WHERE stripeSubscriptionId = ?
    LIMIT 1
  `, [stripeSubscription.id])
  if (!subscription) {
    throw new Error(`Better Auth subscription ${stripeSubscription.id} is missing; retrying`)
  }

  const periodEnd = subscription.periodEnd === null
    ? stripeSubscriptionPeriodEnd(stripeSubscription)
    : new Date(betterAuthTimestampToIso(subscription.periodEnd, 'subscription.periodEnd'))
  await projectOrganizationSubscription(db, {
    organizationId: subscription.referenceId,
    customerId: subscription.stripeCustomerId ?? stripeCustomerIdValue(stripeSubscription.customer),
    subscriptionId: subscription.stripeSubscriptionId ?? stripeSubscription.id,
    plan: subscription.plan,
    status: deleted ? 'canceled' : subscription.status,
    periodEnd,
    cancelAtPeriodEnd: deleted ? false : Boolean(subscription.cancelAtPeriodEnd),
  })
}

export async function recordStripeEvent(
  db: DbClient,
  event: Stripe.Event,
  work: () => Promise<void>,
): Promise<boolean> {
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString()
  const inserted = await execute(db, `
    INSERT OR IGNORE INTO stripe_webhook_events
      (id, stripe_event_id, event_type, status, payload, claimed_at, lease_expires_at, attempt_count, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, 1, ?)
  `, [crypto.randomUUID(), event.id, event.type, JSON.stringify(event), nowIso, leaseExpiresAt, nowIso])

  if (Number(inserted?.meta.changes ?? 0) === 0) {
    const existing = await queryFirst<{
      status: string | null
      lease_expires_at: string | null
    }>(db, `
      SELECT status, lease_expires_at
      FROM stripe_webhook_events
      WHERE stripe_event_id = ? LIMIT 1
    `, [event.id])
    if (!existing || existing.status === 'processed') return false
    if (existing.status === 'pending' && existing.lease_expires_at && existing.lease_expires_at > nowIso) return false

    const reclaimed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'pending', event_type = ?, payload = ?, error = NULL,
          claimed_at = ?, lease_expires_at = ?, attempt_count = attempt_count + 1
      WHERE stripe_event_id = ?
        AND (status = 'failed' OR (status = 'pending' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)))
    `, [event.type, JSON.stringify(event), nowIso, leaseExpiresAt, event.id, nowIso])
    if (Number(reclaimed?.meta.changes ?? 0) === 0) return false
  }

  try {
    await work()
    await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'processed', error = NULL, claimed_at = NULL, lease_expires_at = NULL
      WHERE stripe_event_id = ?
    `, [event.id])
    return true
  } catch (error) {
    await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'failed', error = ?, claimed_at = NULL, lease_expires_at = NULL
      WHERE stripe_event_id = ?
    `, [
      error instanceof Error ? error.message : String(error),
      event.id,
    ]).catch((updateError) => console.error('stripe_webhook_failure_state_update_failed', updateError))
    throw error
  }
}

interface InvoiceSubscriptionResolution {
  organizationId: string
  plan: string
  status: string
  periodStart: string
  periodEnd: string | null
}

function invoiceSubscriptionId(invoice: Stripe.Invoice & {
  subscription?: string | { id: string } | null
  parent?: {
    subscription_details?: {
      subscription?: string | { id: string } | null
    } | null
  } | null
}): string | null {
  const subscriptionValue = invoice.subscription ?? invoice.parent?.subscription_details?.subscription
  return typeof subscriptionValue === 'string' ? subscriptionValue : subscriptionValue?.id ?? null
}

function stripeSubscriptionPeriod(subscription: Stripe.Subscription): {
  start: string
  end: string | null
} {
  const item = subscription.items.data[0]
  const start = item?.current_period_start
    ? new Date(item.current_period_start * 1000).toISOString()
    : new Date().toISOString()
  const end = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null
  return { start, end }
}

async function resolveInvoiceSubscription(
  db: DbClient,
  stripe: Stripe,
  stripeSubscriptionId: string,
): Promise<InvoiceSubscriptionResolution> {
  const local = await queryFirst<{
    referenceId: string
    plan: string
  }>(db, `
    SELECT referenceId, plan
    FROM subscription
    WHERE stripeSubscriptionId = ?
    LIMIT 1
  `, [stripeSubscriptionId])

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  const period = stripeSubscriptionPeriod(stripeSubscription)
  if (local) {
    return {
      organizationId: local.referenceId,
      plan: local.plan,
      status: stripeSubscription.status,
      periodStart: period.start,
      periodEnd: period.end,
    }
  }

  const stripeCustomerId = stripeCustomerIdValue(stripeSubscription.customer)
  const metadataReferenceId = stripeSubscription.metadata?.referenceId?.trim()
  const customerOrganization = stripeCustomerId
    ? await queryFirst<{ id: string }>(db, `
        SELECT id FROM organization WHERE stripeCustomerId = ? LIMIT 1
      `, [stripeCustomerId])
    : null
  const organizationId = metadataReferenceId || customerOrganization?.id
  if (!organizationId) {
    throw new Error(`Stripe invoice subscription ${stripeSubscriptionId} has no organization reference; retrying`)
  }

  const priceId = stripeSubscription.items.data[0]?.price.id
  if (!priceId) throw new Error(`Stripe subscription ${stripeSubscriptionId} has no recurring price; retrying`)
  const configuredPlans = await getBetterAuthStripePlans(stripe)
  const configuredPlan = configuredPlans.find(plan =>
    plan.priceId === priceId || plan.annualDiscountPriceId === priceId,
  )
  if (!configuredPlan) {
    throw new Error(`Stripe subscription ${stripeSubscriptionId} price ${priceId} is not a configured plan; retrying`)
  }

  return {
    organizationId,
    plan: configuredPlan.name,
    status: stripeSubscription.status,
    periodStart: period.start,
    periodEnd: period.end,
  }
}

function stripeCustomerIdValue(customer: Stripe.Subscription['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

export async function grantInvoiceQuota(db: DbClient, stripe: Stripe, event: Stripe.Event): Promise<void> {
  if (event.type !== 'invoice.paid') return
  const invoice = event.data.object as Stripe.Invoice & {
    subscription?: string | { id: string } | null
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null
      } | null
    } | null
  }
  if (!INVOICE_QUOTA_BILLING_REASONS.has(String(invoice.billing_reason ?? ''))) return
  const stripeSubscriptionId = invoiceSubscriptionId(invoice)
  if (!stripeSubscriptionId) return

  const subscription = await resolveInvoiceSubscription(db, stripe, stripeSubscriptionId)
  const accessPlan = getEffectiveAccessPlan(subscription)
  if (accessPlan === 'free') return

  const entitlements = getPlanEntitlements(accessPlan)
  const aiCredits = entitlements.ai_credits
  if (typeof aiCredits !== 'number' || aiCredits <= 0) return

  const periodKey = `stripe-subscription:${stripeSubscriptionId}:ai_inference:${subscription.periodStart}`
  await grantQuota(db, {
    organizationId: subscription.organizationId,
    resource: 'ai_inference',
    quantity: aiCredits,
    unit: 'credit',
    periodKey,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    grantType: 'plan',
    reason: `Stripe invoice ${invoice.id} paid for ${accessPlan}`,
    idempotencyKey: periodKey,
  })
}

export function entitlementLimits(plan: string): EntitlementsMap {
  return getPlanEntitlements(plan)
}
