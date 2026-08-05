import type Stripe from 'stripe'
import type { StripePlan, Subscription as BetterAuthSubscription } from '@better-auth/stripe'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { grantQuota } from '~/server/utils/usage-metering'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'
import { isManagedServiceEnabled } from '~/server/utils/feature-flags'

const WEBHOOK_LEASE_MS = 5 * 60 * 1000
const INVOICE_QUOTA_BILLING_REASONS = new Set(['subscription_create', 'subscription_cycle'])
export const CONCIERGE_PLAN_IDS = new Set(['managed', 'seo_accelerator'])

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
    if (!selected) {
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
    return lookupKeyCandidates[0] ?? null
  }
  if (candidates.length !== 1) {
    throw new Error(`Stripe product ${product.id} must have exactly one canonical ${interval} price`)
  }
  return candidates[0] ?? null
}

export async function getBetterAuthStripePlans(
  stripe: Stripe,
  env?: ApiRecord,
  options: { includeFeatureDisabled?: boolean } = {},
): Promise<StripePlan[]> {
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
    if (planId === 'free') continue
    if (
      !options.includeFeatureDisabled
      && CONCIERGE_PLAN_IDS.has(planId)
      && !isManagedServiceEnabled(env)
    ) continue
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

export type StripePlanLoader = (
  _options?: { includeFeatureDisabled?: boolean },
) => Promise<StripePlan[]>

const STRIPE_PLAN_CACHE_TTL_MS = 60_000

/**
 * Keeps one validated Stripe catalog snapshot per option set and coalesces
 * concurrent refreshes. A transient refresh failure serves the last known-good
 * snapshot so checkout and reconciliation do not multiply catalog requests.
 */
export function createStripePlanLoader(
  stripe: Stripe,
  env?: ApiRecord,
  ttlMs = STRIPE_PLAN_CACHE_TTL_MS,
): StripePlanLoader {
  const snapshots = new Map<string, { plans: StripePlan[]; expiresAt: number }>()
  const pending = new Map<string, Promise<StripePlan[]>>()

  return async (options = {}) => {
    const key = String(Boolean(options.includeFeatureDisabled))
    const now = Date.now()
    const snapshot = snapshots.get(key)
    if (snapshot && snapshot.expiresAt > now) return snapshot.plans

    const existing = pending.get(key)
    if (existing) return existing

    const refresh = getBetterAuthStripePlans(stripe, env, options)
      .then((plans) => {
        snapshots.set(key, { plans, expiresAt: Date.now() + ttlMs })
        return plans
      })
      .catch((error) => {
        if (snapshot) return snapshot.plans
        throw error
      })
      .finally(() => pending.delete(key))
    pending.set(key, refresh)
    return refresh
  }
}

export interface SubscriptionProjectionInput {
  organizationId: string
  customerId: string | null
  subscriptionId: string | null
  plan: string
  status: string
  paymentStatus?: string | null
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
  const paymentRow = await queryFirst<{
    payment_status: string | null
    paid_through: string | null
    last_paid_invoice_id: string | null
  }>(db, `
    SELECT payment_status, paid_through, last_paid_invoice_id
    FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [input.organizationId])
  const paymentStatus = input.paymentStatus ?? paymentRow?.payment_status ?? 'unknown'
  const accessPlan = getEffectiveAccessPlan({ ...input, paymentStatus })
  const entitlements = getPlanEntitlements(accessPlan)
  const entitlementEntries = Object.entries(entitlements)
  const entitlementKeys = entitlementEntries.map(([key]) => key)
  const sites = await queryAll<{ id: string }>(db, `
    SELECT id FROM sites WHERE organization_id = ? ORDER BY id
  `, [input.organizationId])
  const organizationQueries: Array<{ query: string; params: unknown[] }> = [
    {
      query: `
        INSERT INTO organization_billing
          (id, organization_id, stripe_customer_id, stripe_subscription_id,
           status, plan, payment_status, current_period_end, cancel_at_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          status = excluded.status,
          plan = excluded.plan,
          payment_status = excluded.payment_status,
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
        paymentStatus,
        isoDate(input.periodEnd),
        input.cancelAtPeriodEnd ? 1 : 0,
        now,
      ],
    },
  ]

  for (const [key, value] of entitlementEntries) {
    organizationQueries.push({
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
  organizationQueries.push({
    query: `DELETE FROM organization_entitlements
      WHERE organization_id = ? AND source = 'better-auth-stripe'
      AND key NOT IN (${entitlementKeys.map(() => '?').join(', ')})`,
    params: [input.organizationId, ...entitlementKeys],
  })
  await executeBatch(db, organizationQueries)

  for (const site of sites) {
    const siteQueries: Array<{ query: string; params: unknown[] }> = []
    for (const [key, value] of entitlementEntries) {
      siteQueries.push({
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

    siteQueries.push({
      query: `DELETE FROM site_entitlements
        WHERE site_id = ? AND source = 'better-auth-stripe'
        AND key NOT IN (${entitlementKeys.map(() => '?').join(', ')})`,
      params: [site.id, ...entitlementKeys],
    })
    siteQueries.push({
      query: `
        INSERT INTO site_billing
          (id, site_id, organization_id, stripe_subscription_id, plan, status,
           current_period_end, payment_status, paid_through, last_paid_invoice_id,
           cancel_at_period_end, stripe_customer_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(site_id) DO UPDATE SET
          stripe_subscription_id = excluded.stripe_subscription_id,
          plan = excluded.plan,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          payment_status = excluded.payment_status,
          cancel_at_period_end = excluded.cancel_at_period_end,
          stripe_customer_id = excluded.stripe_customer_id,
          updated_at = excluded.updated_at
      `,
      params: [
        `sb-${site.id}`,
        site.id,
        input.organizationId,
        null,
        input.plan,
        input.status,
        isoDate(input.periodEnd),
        paymentStatus,
        paymentRow?.paid_through ?? null,
        paymentRow?.last_paid_invoice_id ?? null,
        input.cancelAtPeriodEnd ? 1 : 0,
        input.customerId,
        now,
      ],
    })
    siteQueries.push({
      query: `UPDATE sites SET plan = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      params: [accessPlan, now, site.id, input.organizationId],
    })
    await executeBatch(db, siteQueries)
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
  id?: string
  referenceId: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  status: string
  periodStart: Date | number | string | null
  periodEnd: Date | number | string | null
  cancelAtPeriodEnd: boolean | number | null
}

export interface BetterAuthSubscriptionAdapter {
  findOne<T>(_input: { model: string; where: Array<{ field: string; value: unknown }> }): Promise<T | null>
  create<T>(_input: { model: string; data: T }): Promise<T>
  update<T>(_input: { model: string; where: Array<{ field: string; value: unknown }>; update: Record<string, unknown> }): Promise<T | null>
}

function stripeSubscriptionPeriod(subscription: Stripe.Subscription): { start: Date; end: Date } {
  const item = subscription.items.data[0]
  if (!item?.current_period_start || !item.current_period_end) {
    throw new Error(`Stripe subscription ${subscription.id} has no deterministic billing period; retrying`)
  }
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  }
}

async function resolveSubscriptionPlan(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  loadPlans: StripePlanLoader,
): Promise<StripePlan> {
  const priceId = subscription.items.data[0]?.price.id
  if (!priceId) throw new Error(`Stripe subscription ${subscription.id} has no recurring price; retrying`)
  const configuredPlans = await loadPlans({ includeFeatureDisabled: true })
  const plan = configuredPlans.find(candidate => candidate.priceId === priceId || candidate.annualDiscountPriceId === priceId)
  if (!plan) throw new Error(`Stripe subscription ${subscription.id} price ${priceId} is not configured; retrying`)
  return plan
}

async function repairBetterAuthSubscriptionRow(
  db: DbClient,
  stripe: Stripe,
  stripeSubscription: Stripe.Subscription,
  event: Stripe.Event,
  deleted: boolean,
  adapter: BetterAuthSubscriptionAdapter,
  loadPlans: StripePlanLoader,
): Promise<ReconciledSubscriptionRow> {
  const existing = await adapter.findOne<ReconciledSubscriptionRow>({
    model: 'subscription',
    where: [{ field: 'stripeSubscriptionId', value: stripeSubscription.id }],
  })

  const version = await queryFirst<{ last_event_created: number }>(db, `
    SELECT last_event_created FROM stripe_subscription_versions
    WHERE stripe_subscription_id = ? LIMIT 1
  `, [stripeSubscription.id])
  if (version && event.created < version.last_event_created && existing) return existing

  let plan: StripePlan
  try {
    plan = await resolveSubscriptionPlan(stripe, stripeSubscription, loadPlans)
  } catch (error) {
    if (!deleted || !existing?.plan) throw error
    plan = { name: existing.plan } as StripePlan
  }
  const customerId = existing?.stripeCustomerId ?? stripeCustomerIdValue(stripeSubscription.customer)
  let referenceId = existing?.referenceId ?? stripeSubscription.metadata?.referenceId?.trim()
  if (!referenceId && customerId) {
    const organization = await adapter.findOne<{ id: string }>({
      model: 'organization',
      where: [{ field: 'stripeCustomerId', value: customerId }],
    })
    referenceId = organization?.id
  }
  if (!referenceId) throw new Error(`Stripe subscription ${stripeSubscription.id} has no organization reference; retrying`)

  const period = stripeSubscriptionPeriod(stripeSubscription)
  const data = {
    plan: plan.name.toLowerCase(),
    referenceId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSubscription.id,
    status: deleted ? 'canceled' : stripeSubscription.status,
    periodStart: period.start,
    periodEnd: period.end,
    cancelAtPeriodEnd: deleted ? false : stripeSubscription.cancel_at_period_end,
    cancelAt: deleted || !stripeSubscription.cancel_at ? null : new Date(stripeSubscription.cancel_at * 1000),
    canceledAt: deleted || !stripeSubscription.canceled_at ? null : new Date(stripeSubscription.canceled_at * 1000),
    endedAt: deleted || !stripeSubscription.ended_at ? null : new Date(stripeSubscription.ended_at * 1000),
    seats: stripeSubscription.items.data[0]?.quantity ?? 1,
    billingInterval: stripeSubscription.items.data[0]?.price.recurring?.interval,
    updatedAt: new Date(),
  }

  const repaired = existing?.id
    ? await adapter.update<ReconciledSubscriptionRow>({ model: 'subscription', where: [{ field: 'id', value: existing.id }], update: data })
    : await adapter.create<ReconciledSubscriptionRow>({ model: 'subscription', data })
  if (!repaired) {
    throw new Error(`Better Auth subscription ${stripeSubscription.id} could not be repaired; retrying`)
  }

  await execute(db, `
    INSERT INTO stripe_subscription_versions (stripe_subscription_id, last_event_created, last_event_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      last_event_created = MAX(last_event_created, excluded.last_event_created),
      last_event_id = CASE WHEN excluded.last_event_created >= last_event_created THEN excluded.last_event_id ELSE last_event_id END,
      updated_at = excluded.updated_at
  `, [stripeSubscription.id, event.created, event.id, new Date().toISOString()])
  return { ...repaired, ...data, referenceId, plan: data.plan, stripeCustomerId: customerId, stripeSubscriptionId: stripeSubscription.id }
}

async function projectCurrentStripeSubscription(
  db: DbClient,
  stripeSubscription: Stripe.Subscription,
  deleted: boolean,
  stripe: Stripe,
  event: Stripe.Event,
  adapter: BetterAuthSubscriptionAdapter,
  loadPlans: StripePlanLoader,
): Promise<void> {
  const subscription = await repairBetterAuthSubscriptionRow(db, stripe, stripeSubscription, event, deleted, adapter, loadPlans)
  const periodEnd = subscription.periodEnd instanceof Date
    ? subscription.periodEnd
    : new Date(betterAuthTimestampToIso(subscription.periodEnd as number | string, 'subscription.periodEnd'))
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

export async function reconcileBetterAuthSubscriptionEvent(
  db: DbClient,
  event: Stripe.Event,
  stripe: Stripe,
  adapter: BetterAuthSubscriptionAdapter,
  loadPlans: StripePlanLoader,
): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription' || session.metadata?.type === 'site_transfer') return
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!subscriptionId) throw new Error(`Subscription checkout ${session.id} has no subscription; retrying`)
    await projectCurrentStripeSubscription(db, await stripe.subscriptions.retrieve(subscriptionId), false, stripe, event, adapter, loadPlans)
    return
  }
  if (!event.type.startsWith('customer.subscription.')) return

  const eventSubscription = event.data.object as Stripe.Subscription
  let currentSubscription = eventSubscription
  let deleted = event.type === 'customer.subscription.deleted'
  try {
    currentSubscription = await stripe.subscriptions.retrieve(eventSubscription.id)
    deleted = false
  } catch (error) {
    if (!deleted || (error as { code?: string })?.code !== 'resource_missing') throw error
  }
  await projectCurrentStripeSubscription(db, currentSubscription, deleted, stripe, event, adapter, loadPlans)
}

export async function enqueueStripeEvent(db: DbClient, event: Stripe.Event): Promise<boolean> {
  const payload = JSON.stringify(event)
  const createdAt = new Date().toISOString()
  const inserted = await execute(db, `
    INSERT OR IGNORE INTO stripe_webhook_events
      (id, stripe_event_id, event_type, status, payload, attempt_count, created_at)
    VALUES (?, ?, ?, 'pending', ?, 0, ?)
  `, [crypto.randomUUID(), event.id, event.type, payload, createdAt])
  if (Number(inserted?.meta.changes ?? 0) > 0) return true
  const requeued = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', event_type = ?, payload = ?, error = NULL,
        claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
        next_attempt_at = NULL, dead_lettered_at = NULL, attempt_count = 0
    WHERE stripe_event_id = ? AND status = 'processed'
  `, [event.type, payload, event.id])
  return Number(requeued?.meta.changes ?? 0) > 0
}

export const MAX_STRIPE_WEBHOOK_ATTEMPTS = 5

export async function recordStripeEventFailure(
  db: DbClient,
  stripeEventId: string,
  message: string,
): Promise<boolean> {
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString()
  const claimToken = crypto.randomUUID()
  const claimed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', claimed_at = ?, lease_expires_at = ?, claim_token = ?,
        attempt_count = attempt_count + 1, error = ?, next_attempt_at = NULL
    WHERE stripe_event_id = ?
      AND status IN ('pending', 'failed')
      AND attempt_count < ?
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `, [nowIso, leaseExpiresAt, claimToken, message, stripeEventId, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, nowIso])
  if (Number(claimed?.meta.changes ?? 0) !== 1) return false

  const retryAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const failed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = CASE WHEN attempt_count >= ? THEN 'dead_letter' ELSE 'failed' END,
        error = ?, claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
        next_attempt_at = CASE WHEN attempt_count >= ? THEN NULL ELSE ? END,
        dead_lettered_at = CASE WHEN attempt_count >= ? THEN ? ELSE NULL END
    WHERE stripe_event_id = ? AND status = 'pending' AND claim_token = ?
  `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, message, MAX_STRIPE_WEBHOOK_ATTEMPTS, retryAt, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, stripeEventId, claimToken])
  if (Number(failed?.meta.changes ?? 0) !== 1) {
    console.error('stripe_webhook_failure_state_update_skipped', { stripeEventId })
    return false
  }
  if (message) console.error('stripe_webhook_event_failed', { stripeEventId, error: message })
  return true
}

export async function recordStripeEvent(
  db: DbClient,
  event: Stripe.Event,
  work: () => Promise<void>,
): Promise<boolean> {
  await enqueueStripeEvent(db, event)
  const now = new Date()
  const nowIso = now.toISOString()
  const leaseExpiresAt = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString()
  const claimToken = crypto.randomUUID()
  const claimed = await execute(db, `
    UPDATE stripe_webhook_events
    SET status = 'pending', claimed_at = ?, lease_expires_at = ?, claim_token = ?,
        attempt_count = attempt_count + 1, error = NULL, next_attempt_at = NULL
    WHERE stripe_event_id = ?
      AND status IN ('pending', 'failed')
      AND attempt_count < ?
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `, [nowIso, leaseExpiresAt, claimToken, event.id, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, nowIso])
  if (Number(claimed?.meta.changes ?? 0) !== 1) return false

  try {
    await work()
    const completed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = 'processed', error = NULL, claimed_at = NULL,
          lease_expires_at = NULL, claim_token = NULL, next_attempt_at = NULL
      WHERE stripe_event_id = ? AND status = 'pending' AND claim_token = ?
    `, [event.id, claimToken])
    if (Number(completed?.meta.changes ?? 0) !== 1) throw new Error(`Lost Stripe webhook lease for ${event.id}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const retryAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    const failed = await execute(db, `
      UPDATE stripe_webhook_events
      SET status = CASE WHEN attempt_count >= ? THEN 'dead_letter' ELSE 'failed' END,
          error = ?, claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
          next_attempt_at = CASE WHEN attempt_count >= ? THEN NULL ELSE ? END,
          dead_lettered_at = CASE WHEN attempt_count >= ? THEN ? ELSE NULL END
      WHERE stripe_event_id = ? AND status = 'pending' AND claim_token = ?
    `, [MAX_STRIPE_WEBHOOK_ATTEMPTS, message, MAX_STRIPE_WEBHOOK_ATTEMPTS, retryAt, MAX_STRIPE_WEBHOOK_ATTEMPTS, nowIso, event.id, claimToken])
    if (Number(failed?.meta.changes ?? 0) !== 1) {
      console.error('stripe_webhook_failure_state_update_skipped', { stripeEventId: event.id })
    } else if (message && failed?.meta && Number(failed.meta.changes) === 1) {
      const attempts = await queryFirst<{ attempt_count: number }>(db, `
        SELECT attempt_count FROM stripe_webhook_events WHERE stripe_event_id = ? LIMIT 1
      `, [event.id])
      if ((attempts?.attempt_count ?? 0) >= MAX_STRIPE_WEBHOOK_ATTEMPTS) {
        console.error('stripe_webhook_dead_lettered', { stripeEventId: event.id, error: message })
      }
    }
    throw error
  }
}

interface InvoiceSubscriptionResolution {
  organizationId: string
  customerId: string | null
  stripeSubscription: Stripe.Subscription
  betterAuthRowExists: boolean
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice & {
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

async function resolveInvoiceSubscription(
  db: DbClient,
  stripe: Stripe,
  stripeSubscriptionId: string,
  adapter: BetterAuthSubscriptionAdapter,
): Promise<InvoiceSubscriptionResolution> {
  const local = await adapter.findOne<{ referenceId: string }>({
    model: 'subscription',
    where: [{ field: 'stripeSubscriptionId', value: stripeSubscriptionId }],
  })

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  const stripeCustomerId = stripeCustomerIdValue(stripeSubscription.customer)
  const metadataReferenceId = stripeSubscription.metadata?.referenceId?.trim()
  const customerOrganization = stripeCustomerId
    ? await adapter.findOne<{ id: string }>({
        model: 'organization',
        where: [{ field: 'stripeCustomerId', value: stripeCustomerId }],
      })
    : null
  const organizationId = local?.referenceId || metadataReferenceId || customerOrganization?.id
  if (!organizationId) {
    throw new Error(`Stripe invoice subscription ${stripeSubscriptionId} has no organization reference; retrying`)
  }
  return {
    organizationId,
    customerId: stripeCustomerId,
    stripeSubscription,
    betterAuthRowExists: Boolean(local),
  }
}

function stripeCustomerIdValue(customer: Stripe.Subscription['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

export async function markOrganizationPayment(
  db: DbClient,
  input: {
    organizationId: string
    customerId: string | null
    subscriptionId: string
    paymentStatus: 'paid' | 'processing' | 'failed'
    eventCreated: number
    eventId: string
    paidThrough?: string | null
    invoiceId?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `
        INSERT INTO organization_billing
          (id, organization_id, stripe_customer_id, stripe_subscription_id,
           status, plan, payment_status, paid_through, last_paid_invoice_id,
           last_payment_event_created, last_payment_event_id, updated_at)
        VALUES (?, ?, ?, ?, 'free', 'free', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          stripe_customer_id = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN COALESCE(excluded.stripe_customer_id, organization_billing.stripe_customer_id)
            ELSE organization_billing.stripe_customer_id END,
          stripe_subscription_id = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN COALESCE(excluded.stripe_subscription_id, organization_billing.stripe_subscription_id)
            ELSE organization_billing.stripe_subscription_id END,
          payment_status = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN excluded.payment_status ELSE organization_billing.payment_status END,
          paid_through = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN COALESCE(excluded.paid_through, organization_billing.paid_through)
            ELSE organization_billing.paid_through END,
          last_paid_invoice_id = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN COALESCE(excluded.last_paid_invoice_id, organization_billing.last_paid_invoice_id)
            ELSE organization_billing.last_paid_invoice_id END,
          last_payment_event_created = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN excluded.last_payment_event_created ELSE organization_billing.last_payment_event_created END,
          last_payment_event_id = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN excluded.last_payment_event_id ELSE organization_billing.last_payment_event_id END,
          updated_at = CASE WHEN excluded.last_payment_event_created >= COALESCE(organization_billing.last_payment_event_created, -1)
            THEN excluded.updated_at ELSE organization_billing.updated_at END
      `,
      params: [
        `billing-${input.organizationId}`,
        input.organizationId,
        input.customerId,
        input.subscriptionId,
        input.paymentStatus,
        input.paidThrough ?? null,
        input.invoiceId ?? null,
        input.eventCreated,
        input.eventId,
        now,
      ],
    },
    {
        query: `
          UPDATE site_billing
          SET payment_status = ?, paid_through = COALESCE(?, paid_through),
            last_paid_invoice_id = COALESCE(?, last_paid_invoice_id),
            last_payment_event_created = ?, last_payment_event_id = ?, updated_at = ?
        WHERE organization_id = ?
          AND ? >= COALESCE(last_payment_event_created, -1)
          AND ? >= COALESCE((
            SELECT ob.last_payment_event_created FROM organization_billing ob
            WHERE ob.organization_id = ? LIMIT 1
          ), -1)
      `,
      params: [
        input.paymentStatus,
        input.paidThrough ?? null,
        input.invoiceId ?? null,
        input.eventCreated,
        input.eventId,
        now,
        input.organizationId,
        input.eventCreated,
        input.eventCreated,
        input.organizationId,
      ],
    },
  ])
}

async function resolveHistoricalInvoicePlan(
  stripe: Stripe,
  price: Stripe.Price | null | undefined,
): Promise<StripePlan | null> {
  if (!price?.id) return null
  const product = typeof price.product === 'string'
    ? await stripe.products.retrieve(price.product)
    : price.product
  if (!product || 'deleted' in product) return null
  const planId = product?.metadata?.plan_id?.trim()
  if (!planId || planId === 'free') return null
  return {
    name: planId,
    priceId: price.id,
    limits: getPlanEntitlements(planId),
    group: 'krabiclaw',
  }
}

export async function grantInvoiceQuota(
  db: DbClient,
  stripe: Stripe,
  event: Stripe.Event,
  adapter: BetterAuthSubscriptionAdapter,
  loadPlans: StripePlanLoader,
): Promise<void> {
  if (event.type !== 'invoice.paid') return
  const invoice = event.data.object as Stripe.Invoice & {
    lines: Stripe.ApiList<Stripe.InvoiceLineItem>
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

  const subscription = await resolveInvoiceSubscription(db, stripe, stripeSubscriptionId, adapter)
  type InvoiceLine = Stripe.InvoiceLineItem & {
    type?: string
    subscription?: string | Stripe.Subscription | null
    price?: string | Stripe.Price | null
    period?: { start?: number; end?: number } | null
    proration?: boolean
    pricing?: {
      type?: string
      price_details?: { price?: string | Stripe.Price | null } | null
    } | null
    parent?: {
      type?: string
      subscription_item_details?: {
        subscription?: string | null
        subscription_item?: string | null
        proration?: boolean
      } | null
      invoice_item_details?: {
        subscription?: string | null
        proration?: boolean
      } | null
    } | null
  }
  const linePrice = (line: InvoiceLine): string | Stripe.Price | null | undefined =>
    line.price ?? line.pricing?.price_details?.price
  let invoiceLines: InvoiceLine[] = [...(invoice.lines?.data ?? []) as InvoiceLine[]]
  let startingAfter = invoiceLines.at(-1)?.id
  const mustReloadFirstPage = invoiceLines.some(line => typeof linePrice(line) === 'string')
  if (mustReloadFirstPage) {
    invoiceLines = []
    startingAfter = undefined
  }
  while (invoice.lines?.has_more || mustReloadFirstPage) {
    const page = await stripe.invoices.listLineItems(invoice.id, {
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.pricing.price_details.price'],
    })
    invoiceLines.push(...page.data)
    if (!page.has_more) break
    const next = page.data.at(-1)?.id
    if (!next || next === startingAfter) throw new Error(`Stripe invoice ${invoice.id} line pagination did not advance; retrying`)
    startingAfter = next
  }
  invoiceLines = await Promise.all(invoiceLines.map(async (line) => {
    const price = linePrice(line)
    if (typeof price !== 'string') return line
    return {
      ...line,
      price: await stripe.prices.retrieve(price, { expand: ['product'] }),
    }
  }))

  const recurringLines = invoiceLines.filter((line) => {
    const parent = line.parent
    const lineSubscription = line.subscription
    const lineSubscriptionId = typeof lineSubscription === 'string'
      ? lineSubscription
      : lineSubscription?.id
        ?? parent?.subscription_item_details?.subscription
        ?? parent?.invoice_item_details?.subscription
    const proration = Boolean(line.proration)
      || Boolean(parent?.subscription_item_details?.proration)
      || Boolean(parent?.invoice_item_details?.proration)
    const price = linePrice(line)
    const isSubscriptionLine = line.type === 'subscription' || parent?.type === 'subscription_item_details'
    return lineSubscriptionId === stripeSubscriptionId
      && isSubscriptionLine
      && !proration
      && typeof price !== 'string'
      && Boolean(price?.recurring)
      && Boolean(line.period?.start && line.period?.end)
  })
  if (recurringLines.length === 0) {
    throw new Error(`Stripe invoice ${invoice.id} has no deterministic recurring subscription line; retrying`)
  }

  const configuredPlans = await loadPlans({ includeFeatureDisabled: true })
  const planLines = [] as Array<{ line: InvoiceLine; plan: StripePlan; priceId: string }>
  for (const line of recurringLines) {
    const price = linePrice(line)
    if (!price || typeof price === 'string') continue
    const priceId = price?.id
    if (!priceId) continue
    const plan = configuredPlans.find(candidate => candidate.priceId === priceId || candidate.annualDiscountPriceId === priceId)
      ?? await resolveHistoricalInvoicePlan(stripe, price)
    if (plan) planLines.push({ line, plan, priceId })
  }
  if (planLines.length !== 1) {
    throw new Error(`Stripe invoice ${invoice.id} does not identify exactly one configured recurring plan line; retrying`)
  }
  const selectedPlanLine = planLines[0]
  if (!selectedPlanLine) throw new Error(`Stripe invoice ${invoice.id} has no configured recurring plan line; retrying`)
  const { line, plan, priceId } = selectedPlanLine
  const periodStartSeconds = line.period?.start
  const periodEndSeconds = line.period?.end
  if (!periodStartSeconds || !periodEndSeconds) {
    throw new Error(`Stripe invoice ${invoice.id} plan line has no deterministic billing period; retrying`)
  }
  const periodStart = new Date(periodStartSeconds * 1000).toISOString()
  const periodEnd = new Date(periodEndSeconds * 1000).toISOString()
  const accessPlan = getEffectiveAccessPlan({
    plan: plan.name,
    status: subscription.stripeSubscription.status,
    paymentStatus: 'paid',
    periodEnd,
  })
  await markOrganizationPayment(db, {
    organizationId: subscription.organizationId,
    customerId: subscription.customerId,
    subscriptionId: stripeSubscriptionId,
    paymentStatus: 'paid',
    eventCreated: event.created,
    eventId: event.id,
    paidThrough: periodEnd,
    invoiceId: invoice.id,
  })
  if (subscription.betterAuthRowExists) {
    await projectCurrentStripeSubscription(db, subscription.stripeSubscription, false, stripe, event, adapter, loadPlans)
  }
  if (accessPlan === 'free') return

  const entitlements = getPlanEntitlements(plan.name)
  const aiCredits = entitlements.ai_credits
  if (typeof aiCredits !== 'number' || aiCredits <= 0) return

  const periodKey = `stripe-invoice:${invoice.id}:subscription:${stripeSubscriptionId}:price:${priceId}:${periodStart}:${periodEnd}`
  await grantQuota(db, {
    organizationId: subscription.organizationId,
    resource: 'ai_inference',
    quantity: aiCredits,
    unit: 'credit',
    periodKey,
    periodStart,
    periodEnd,
    grantType: 'plan',
    reason: `Stripe invoice ${invoice.id} paid for ${plan.name}`,
    idempotencyKey: periodKey,
  })
}

export function entitlementLimits(plan: string): EntitlementsMap {
  return getPlanEntitlements(plan)
}
