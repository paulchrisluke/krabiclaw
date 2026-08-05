import type Stripe from 'stripe'
import type { StripePlan, Subscription as BetterAuthSubscription } from '@better-auth/stripe'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { grantQuota } from '~/server/utils/usage-metering'

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

  for (const product of products) {
    const planId = product.metadata?.plan_id?.trim()
    if (!planId) continue

    const billablePrices = (pricesByProduct.get(product.id) ?? []).filter(
      price => typeof price.unit_amount === 'number' && price.unit_amount > 0,
    )
    const monthly = billablePrices.find(
      price => price.recurring?.interval === 'month' && price.recurring.interval_count === 1,
    )
    const yearly = billablePrices.find(
      price => price.recurring?.interval === 'year' && price.recurring.interval_count === 1,
    )
    if (!monthly && !yearly) continue

    plans.push({
      name: planId,
      priceId: monthly?.id,
      annualDiscountPriceId: yearly?.id,
      limits: getPlanEntitlements(planId),
      group: 'krabiclaw',
    })
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
  const entitlements = getPlanEntitlements(input.plan)
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
      params: [input.plan, now, site.id, input.organizationId],
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
    plan: 'free',
    status: 'canceled',
    periodEnd: subscription.periodEnd ?? null,
    cancelAtPeriodEnd: false,
  })
}

export async function recordStripeEvent(
  db: DbClient,
  event: Stripe.Event,
  work: () => Promise<void>,
): Promise<boolean> {
  const inserted = await execute(db, `
    INSERT OR IGNORE INTO stripe_webhook_events
      (id, stripe_event_id, event_type, status, payload, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `, [crypto.randomUUID(), event.id, event.type, JSON.stringify(event), new Date().toISOString()])

  if (Number(inserted?.meta.changes ?? 0) === 0) {
    const existing = await queryFirst<{ status: string | null }>(db, `
      SELECT status FROM stripe_webhook_events WHERE stripe_event_id = ? LIMIT 1
    `, [event.id])
    if (!existing || existing.status === 'processed' || existing.status === 'pending') return false

    const reclaimed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'pending', event_type = ?, payload = ?, error = NULL
      WHERE stripe_event_id = ? AND status = 'failed'
    `, [event.type, JSON.stringify(event), event.id])
    if (Number(reclaimed?.meta.changes ?? 0) === 0) return false
  }

  try {
    await work()
    await execute(db, `UPDATE stripe_webhook_events SET status = 'processed', error = NULL WHERE stripe_event_id = ?`, [event.id])
    return true
  } catch (error) {
    await execute(db, `UPDATE stripe_webhook_events SET status = 'failed', error = ? WHERE stripe_event_id = ?`, [
      error instanceof Error ? error.message : String(error),
      event.id,
    ]).catch((updateError) => console.error('stripe_webhook_failure_state_update_failed', updateError))
    throw error
  }
}

export async function grantInvoiceQuota(db: DbClient, event: Stripe.Event): Promise<void> {
  if (event.type !== 'invoice.payment_succeeded') return
  const invoice = event.data.object as Stripe.Invoice & {
    subscription?: string | { id: string } | null
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null
      } | null
    } | null
  }
  const subscriptionValue = invoice.subscription ?? invoice.parent?.subscription_details?.subscription
  const stripeSubscriptionId = typeof subscriptionValue === 'string'
    ? subscriptionValue
    : subscriptionValue?.id
  if (!stripeSubscriptionId) return

  const subscription = await queryFirst<{
    referenceId: string
    plan: string
    periodStart: number | null
    periodEnd: number | null
  }>(db, `
    SELECT referenceId, plan, periodStart, periodEnd
    FROM subscription
    WHERE stripeSubscriptionId = ?
    LIMIT 1
  `, [stripeSubscriptionId])
  if (!subscription) return

  const entitlements = getPlanEntitlements(subscription.plan)
  const aiCredits = entitlements.ai_credits
  if (typeof aiCredits !== 'number' || aiCredits <= 0) return

  const start = subscription.periodStart ? new Date(subscription.periodStart * 1000).toISOString() : new Date().toISOString()
  const end = subscription.periodEnd ? new Date(subscription.periodEnd * 1000).toISOString() : null
  await grantQuota(db, {
    organizationId: subscription.referenceId,
    resource: 'ai_inference',
    quantity: aiCredits,
    unit: 'credit',
    periodKey: `stripe-invoice:${invoice.id}`,
    periodStart: start,
    periodEnd: end,
    grantType: 'plan',
    reason: `Stripe invoice ${invoice.id} paid for ${subscription.plan}`,
    idempotencyKey: `stripe-invoice:${invoice.id}:ai_inference`,
  })
}

export function entitlementLimits(plan: string): EntitlementsMap {
  return getPlanEntitlements(plan)
}
