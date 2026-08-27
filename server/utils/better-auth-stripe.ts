import type Stripe from 'stripe'
import type { StripePlan, Subscription as BetterAuthSubscription } from '@better-auth/stripe'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'
import {
  isKnownRecurringPlan,
  isNewSalePlan,
} from '~/shared/billing-model'
import {
  assertGrowthStripeCatalogPrices,
  resolveStripeCatalogPrice,
  selectStripeCatalogPrice,
  type StripeCatalogPriceResolution,
} from '~/server/utils/stripe-catalog'

const WEBHOOK_LEASE_MS = 5 * 60 * 1000
export function selectCanonicalStripePrice(
  product: Stripe.Product,
  prices: Stripe.Price[],
  interval: 'month' | 'year',
): Stripe.Price | null {
  return selectStripeCatalogPrice(product, prices, interval)
}

export function resolveCanonicalStripePrice(
  products: Stripe.Product[],
  prices: Stripe.Price[],
  planId: string,
  interval: 'month' | 'year',
): StripeCatalogPriceResolution {
  return resolveStripeCatalogPrice(products, prices, planId, interval)
}

export async function getBetterAuthStripePlans(
  stripe: Stripe,
  _env?: ApiRecord,
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
    // Stripe may contain old or unrelated products. Only the canonical
    // recurring plans are meaningful to Better Auth billing. Runtime plan
    // identity is intentionally Starter/Growth only; retired catalog products
    // remain an operator cleanup concern, not an entitlement source.
    if (!isKnownRecurringPlan(planId)) continue
    if (!options.includeFeatureDisabled && !isNewSalePlan(planId)) continue
    if (planIds.has(planId)) throw new Error(`Stripe has multiple active products for plan ${planId}`)

    const billablePrices = (pricesByProduct.get(product.id) ?? []).filter(
      price => typeof price.unit_amount === 'number' && price.unit_amount > 0,
    )
    const monthly = selectCanonicalStripePrice(product, billablePrices, 'month')
    if (!monthly) {
      throw new Error(`Stripe product ${product.id} for plan ${planId} is missing a canonical monthly price`)
    }
    const yearly = selectCanonicalStripePrice(product, billablePrices, 'year')
    if (isNewSalePlan(planId)) {
      assertGrowthStripeCatalogPrices(monthly, yearly)
    }
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
      ...(monthly.lookup_key?.trim() ? { lookupKey: monthly.lookup_key.trim() } : {}),
      annualDiscountPriceId: yearly?.id,
      ...(yearly?.lookup_key?.trim() ? { annualDiscountLookupKey: yearly.lookup_key.trim() } : {}),
      limits: getPlanEntitlements(planId),
      group: 'krabiclaw',
      ...(product.metadata?.seat_price_id?.trim()
        ? { seatPriceId: product.metadata.seat_price_id.trim() }
        : {}),
    })
    planIds.add(planId)
  }

  return plans
}

export type StripePlanLoader = (
  _options?: { includeFeatureDisabled?: boolean },
) => Promise<StripePlan[]>

const STRIPE_PLAN_CACHE_TTL_MS = 60_000
const stripePlanSnapshots = new Map<string, { plans: StripePlan[]; expiresAt: number }>()
const stripePlanPending = new Map<string, Promise<StripePlan[]>>()

function stripePlanCacheScope(env?: ApiRecord): string {
  const account = typeof env?.STRIPE_ACCOUNT_ID === 'string' && env.STRIPE_ACCOUNT_ID.trim()
    ? env.STRIPE_ACCOUNT_ID.trim()
    : 'platform'
  const secretKey = typeof env?.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY : ''
  const mode = /^(?:sk|rk)_live_/.test(secretKey)
    ? 'live'
    : /^(?:sk|rk)_test_/.test(secretKey)
      ? 'test'
      : 'unknown'
  return `${account}:${mode}`
}

/**
 * Keeps one validated Stripe catalog snapshot per option set and coalesces
 * concurrent refreshes. A refresh failure remains an error; callers must not
 * turn an unavailable or invalid catalog into an apparently valid checkout.
 */
export function createStripePlanLoader(
  stripe: Stripe,
  env?: ApiRecord,
  ttlMs = STRIPE_PLAN_CACHE_TTL_MS,
  cacheScope = stripePlanCacheScope(env),
): StripePlanLoader {
  return async (options = {}) => {
    const key = `${cacheScope}:${String(Boolean(options.includeFeatureDisabled))}`
    const now = Date.now()
    const snapshot = stripePlanSnapshots.get(key)
    if (snapshot && snapshot.expiresAt > now) return snapshot.plans

    const existing = stripePlanPending.get(key)
    if (existing) return existing

    const refresh = getBetterAuthStripePlans(stripe, env, options)
      .then((plans) => {
        stripePlanSnapshots.set(key, { plans, expiresAt: Date.now() + ttlMs })
        return plans
      })
      .finally(() => stripePlanPending.delete(key))
    stripePlanPending.set(key, refresh)
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
  paidThrough?: Date | string | null
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
  if (!isKnownRecurringPlan(input.plan)) {
    throw new Error(`Unsupported runtime billing plan "${input.plan}"`)
  }
  const now = new Date().toISOString()
  const paymentRow = await queryFirst<{
    payment_status: string | null
    paid_through: string | null
    past_due_since: string | null
    last_paid_invoice_id: string | null
  }>(db, `
    SELECT payment_status, paid_through, past_due_since, last_paid_invoice_id
    FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [input.organizationId])
  const paymentStatus = input.paymentStatus ?? paymentRow?.payment_status ?? 'unknown'
  const accessPlan = getEffectiveAccessPlan({
    ...input,
    paymentStatus,
    paidThrough: paymentRow?.paid_through,
    pastDueSince: paymentRow?.past_due_since,
  })
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
      AND key NOT IN (SELECT value FROM json_each(?))`,
    params: [input.organizationId, d1JsonStringSet(entitlementKeys)],
  })
  const allQueries = [...organizationQueries]
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
        AND key NOT IN (SELECT value FROM json_each(?))`,
      params: [site.id, d1JsonStringSet(entitlementKeys)],
    })
    siteQueries.push({
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
        null,
        accessPlan,
        input.status,
        isoDate(input.periodEnd),
        input.cancelAtPeriodEnd ? 1 : 0,
        input.customerId,
        now,
      ],
    })
    siteQueries.push({
      query: `UPDATE sites SET plan = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      params: [accessPlan, now, site.id, input.organizationId],
    })
    allQueries.push(...siteQueries)
  }
  await executeBatch(db, allQueries)
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
  trialStart?: Date | number | string | null
  trialEnd?: Date | number | string | null
  limits?: string | null
}

export interface BetterAuthSubscriptionAdapter {
  findOne<T>(_input: { model: string; where: Array<{ field: string; value: unknown }> }): Promise<T | null>
  create<T>(_input: { model: string; data: T }): Promise<T>
  update<T>(_input: { model: string; where: Array<{ field: string; value: unknown }>; update: Record<string, unknown> }): Promise<T | null>
}

type ResolvedSubscriptionPlan = {
  item: Stripe.SubscriptionItem
  plan: StripePlan
}

async function resolveHistoricalSubscriptionPlan(
  stripe: Stripe,
  price: Stripe.Price,
): Promise<StripePlan | null> {
  const resolvedPrice = await stripe.prices.retrieve(price.id, { expand: ['product'] })
  const product = typeof resolvedPrice.product === 'string'
    ? await stripe.products.retrieve(resolvedPrice.product)
    : resolvedPrice.product
  if (!product || 'deleted' in product) return null
  // Early catalog prices predate price_role metadata. Treat a missing role as
  // the historical base price, while rejecting any explicit non-base role.
  // Product seat metadata remains a second guard for rotated seat prices.
  const priceRole = resolvedPrice.metadata?.price_role?.trim().toLowerCase()
  if (priceRole && priceRole !== 'base') return null
  if (product.metadata?.seat_price_id?.trim() === resolvedPrice.id) return null
  const planId = product.metadata?.plan_id?.trim().toLowerCase()
  if (!planId || !isKnownRecurringPlan(planId)) return null
  return {
    name: planId,
    priceId: resolvedPrice.id,
    ...(resolvedPrice.lookup_key?.trim() ? { lookupKey: resolvedPrice.lookup_key.trim() } : {}),
    limits: getPlanEntitlements(planId),
    group: 'krabiclaw',
    ...(product.metadata?.seat_price_id?.trim()
      ? { seatPriceId: product.metadata.seat_price_id.trim() }
      : {}),
  }
}

function configuredBasePlanForItem(
  item: Stripe.SubscriptionItem,
  configuredPlans: StripePlan[],
): StripePlan | null {
  const priceId = item.price.id
  const lookupKey = item.price.lookup_key
  return configuredPlans.find(candidate =>
    candidate.priceId === priceId
    || candidate.annualDiscountPriceId === priceId
    || (lookupKey && (candidate.lookupKey === lookupKey || candidate.annualDiscountLookupKey === lookupKey)),
  ) ?? null
}

function stripeSubscriptionPeriod(subscription: Stripe.Subscription, item: Stripe.SubscriptionItem): { start: Date; end: Date } {
  if (!item?.current_period_start || !item.current_period_end) {
    throw new Error(`Stripe subscription ${subscription.id} has no deterministic billing period; retrying`)
  }
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  }
}

/**
 * Resolves the single configured or historical recurring base item for a
 * subscription. Invoice processing uses the same resolver as lifecycle
 * reconciliation so a seat/add-on item can never become plan authority.
 */
export async function resolveCanonicalSubscriptionPlan(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  loadPlans: StripePlanLoader,
): Promise<ResolvedSubscriptionPlan> {
  const first = subscription.items.data[0]
  if (!first) throw new Error(`Stripe subscription ${subscription.id} has no recurring price; retrying`)
  const configuredPlans = await loadPlans({ includeFeatureDisabled: true })
  const configuredBasePriceIds = new Set(
    configuredPlans.flatMap(candidate => [candidate.priceId, candidate.annualDiscountPriceId]
      .filter((priceId): priceId is string => Boolean(priceId))),
  )
  const seatPriceIds = new Set(configuredPlans
    .flatMap(candidate => candidate.seatPriceId ? [candidate.seatPriceId] : [])
    .filter(priceId => !configuredBasePriceIds.has(priceId)))
  const configuredBaseMatches = subscription.items.data
    .filter(item => !seatPriceIds.has(item.price.id))
    .map(item => ({ item, plan: configuredBasePlanForItem(item, configuredPlans) }))
    .filter((entry): entry is { item: Stripe.SubscriptionItem; plan: StripePlan } => Boolean(entry.plan))
  if (configuredBaseMatches.length > 1) {
    throw new Error(`Stripe subscription ${subscription.id} has multiple configured recurring plan items; retrying`)
  }
  const configuredBase = configuredBaseMatches[0]
  if (configuredBase) {
    if (!isKnownRecurringPlan(configuredBase.plan.name)) {
      throw new Error(`Stripe subscription ${subscription.id} resolved an unsupported runtime billing plan; retrying`)
    }
    return configuredBase
  }

  const historicalBaseMatches: ResolvedSubscriptionPlan[] = []
  for (const item of subscription.items.data) {
    if (seatPriceIds.has(item.price.id)) continue
    const historicalPlan = await resolveHistoricalSubscriptionPlan(stripe, item.price)
    if (historicalPlan) historicalBaseMatches.push({ item, plan: historicalPlan })
  }
  if (historicalBaseMatches.length > 1) {
    throw new Error(`Stripe subscription ${subscription.id} has multiple historical recurring plan items; retrying`)
  }
  const historicalBase = historicalBaseMatches[0]
  if (historicalBase) return historicalBase
  throw new Error(`Stripe subscription ${subscription.id} has no items matching a configured plan; retrying`)
}

async function findExistingSubscription(
  stripeSubscription: Stripe.Subscription,
  adapter: BetterAuthSubscriptionAdapter,
  metadataFallback?: Record<string, string> | null,
): Promise<ReconciledSubscriptionRow | null> {
  const metadata = { ...metadataFallback, ...stripeSubscription.metadata }
  const metadataSubscriptionId = metadata.subscriptionId?.trim()
  const metadataReferenceId = organizationReferenceFromMetadata(metadata)
  const customerId = stripeCustomerIdValue(stripeSubscription.customer)
  let existing: ReconciledSubscriptionRow | null = null
  if (metadataSubscriptionId) {
    existing = await adapter.findOne<ReconciledSubscriptionRow>({
      model: 'subscription',
      where: [{ field: 'id', value: metadataSubscriptionId }],
    })
  }
  if (!existing) {
    existing = await adapter.findOne<ReconciledSubscriptionRow>({
      model: 'subscription',
      where: [{ field: 'stripeSubscriptionId', value: stripeSubscription.id }],
    })
  }
  if (existing?.referenceId && metadataReferenceId && existing.referenceId !== metadataReferenceId) {
    throw new Error(`Stripe subscription ${stripeSubscription.id} metadata reference does not own Better Auth row; retrying`)
  }
  if (existing?.stripeCustomerId && customerId && existing.stripeCustomerId !== customerId) {
    throw new Error(`Stripe subscription ${stripeSubscription.id} customer does not own Better Auth row; retrying`)
  }
  if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== stripeSubscription.id) {
    throw new Error(`Better Auth subscription ${existing.id ?? metadataSubscriptionId ?? 'unknown'} is already linked to another Stripe subscription; retrying`)
  }
  return existing
}

/**
 * Better Auth's Stripe plugin uses `referenceId` as the subscription owner.
 * Transfer checkouts historically also emitted `organization_id`; accept that
 * key only as a compatibility fallback and fail closed when the two disagree.
 */
function organizationReferenceFromMetadata(metadata: Record<string, string>): string | null {
  const referenceId = metadata.referenceId?.trim() || null
  const legacyOrganizationId = metadata.organization_id?.trim() || null
  if (referenceId && legacyOrganizationId && referenceId !== legacyOrganizationId) {
    throw new Error('Stripe subscription metadata has conflicting organization references; retrying')
  }
  return referenceId ?? legacyOrganizationId
}

async function repairBetterAuthSubscriptionRow(
  db: DbClient,
  stripe: Stripe,
  stripeSubscription: Stripe.Subscription,
  event: Stripe.Event,
  deleted: boolean,
  adapter: BetterAuthSubscriptionAdapter,
  loadPlans: StripePlanLoader,
  metadataFallback?: Record<string, string> | null,
): Promise<ReconciledSubscriptionRow> {
  const existing = await findExistingSubscription(stripeSubscription, adapter, metadataFallback)

  const version = await queryFirst<{ last_event_created: number }>(db, `
    SELECT last_event_created FROM stripe_subscription_versions
    WHERE stripe_subscription_id = ? LIMIT 1
  `, [stripeSubscription.id])
  if (version && event.created < version.last_event_created && existing) return existing

  let resolved: ResolvedSubscriptionPlan
  try {
    resolved = await resolveCanonicalSubscriptionPlan(stripe, stripeSubscription, loadPlans)
  } catch (error) {
    if (!deleted || !existing?.plan || !isKnownRecurringPlan(existing.plan)) throw error
    const item = stripeSubscription.items.data[0]
    if (!item) throw error
    resolved = { item, plan: { name: existing.plan } }
  }
  const customerId = stripeCustomerIdValue(stripeSubscription.customer) ?? existing?.stripeCustomerId ?? null
  const metadata = { ...metadataFallback, ...stripeSubscription.metadata }
  let referenceId: string | null = existing?.referenceId ?? organizationReferenceFromMetadata(metadata)
  if (!referenceId && customerId) {
    const organization = await adapter.findOne<{ id: string }>({
      model: 'organization',
      where: [{ field: 'stripeCustomerId', value: customerId }],
    })
    referenceId = organization?.id ?? null
  }
  if (!referenceId) throw new Error(`Stripe subscription ${stripeSubscription.id} has no organization reference; retrying`)

  const period = stripeSubscriptionPeriod(stripeSubscription, resolved.item)
  const quantity = resolved.plan.seatPriceId
    ? stripeSubscription.items.data.find(item => item.price.id === resolved.plan.seatPriceId)?.quantity ?? resolved.item.quantity ?? 1
    : resolved.item.quantity ?? 1
  const data = {
    plan: resolved.plan.name.toLowerCase(),
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
    trialStart: !deleted && stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
    trialEnd: !deleted && stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
    limits: resolved.plan.limits ? JSON.stringify(resolved.plan.limits) : null,
    seats: quantity,
    billingInterval: resolved.item.price.recurring?.interval,
    stripeScheduleId: deleted || !stripeSubscription.schedule
      ? null
      : typeof stripeSubscription.schedule === 'string' ? stripeSubscription.schedule : stripeSubscription.schedule.id,
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
  metadataFallback?: Record<string, string> | null,
): Promise<void> {
  const subscription = await repairBetterAuthSubscriptionRow(db, stripe, stripeSubscription, event, deleted, adapter, loadPlans, metadataFallback)
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
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription') return
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!subscriptionId) throw new Error(`Subscription checkout ${session.id} has no subscription; retrying`)
    await projectCurrentStripeSubscription(db, await stripe.subscriptions.retrieve(subscriptionId), false, stripe, event, adapter, loadPlans, session.metadata)
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
  // A duplicate Stripe delivery is not an operator replay. Leave failed and
  // dead-lettered events in their existing bounded state so provider retries
  // cannot reset the attempt budget. Operator replay is a separate, signed
  // administrative operation that never replaces the retained payload.
  return false
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

export function invoiceSubscriptionId(invoice: {
  subscription?: unknown
  parent?: unknown
}): string | null {
  const parent = invoice.parent as { subscription_details?: { subscription?: unknown } | null } | null | undefined
  const subscriptionValue = invoice.subscription ?? parent?.subscription_details?.subscription
  return typeof subscriptionValue === 'string'
    ? subscriptionValue
    : subscriptionValue && typeof subscriptionValue === 'object' && 'id' in subscriptionValue && typeof subscriptionValue.id === 'string'
      ? subscriptionValue.id
      : null
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
    basePlanPriceId?: string | null
    invoicePeriodStart?: string | null
    invoicePeriodEnd?: string | null
    pastDueSince?: string | null
    canonicalPaidEvidence?: boolean
  },
): Promise<void> {
  if (input.canonicalPaidEvidence) {
    const periodStart = input.invoicePeriodStart ? Date.parse(input.invoicePeriodStart) : Number.NaN
    const periodEnd = input.invoicePeriodEnd ? Date.parse(input.invoicePeriodEnd) : Number.NaN
    if (
      input.paymentStatus !== 'paid'
      || !input.basePlanPriceId
      || !Number.isFinite(periodStart)
      || !Number.isFinite(periodEnd)
      || periodStart >= periodEnd
    ) {
      throw new Error('Canonical paid invoice evidence requires a paid base price and ordered line period')
    }
  }
  const now = new Date().toISOString()
  if (!input.invoiceId) {
    if (input.paymentStatus === 'paid') {
      throw new Error(`Paid Stripe subscription payment ${input.subscriptionId} has no invoice; retrying`)
    }
    return
  }

  const sites = await queryAll<{ id: string }>(db, `
    SELECT id FROM sites WHERE organization_id = ? ORDER BY id
  `, [input.organizationId])
  await executeBatch(db, [
    {
      query: `
        INSERT INTO stripe_invoice_payments
          (stripe_invoice_id, organization_id, stripe_subscription_id, base_plan_price_id,
           status, period_start, period_end, past_due_since, last_event_created, last_event_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stripe_invoice_id) DO UPDATE SET
          organization_id = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.organization_id ELSE stripe_invoice_payments.organization_id END,
          stripe_subscription_id = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.stripe_subscription_id ELSE stripe_invoice_payments.stripe_subscription_id END,
          base_plan_price_id = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN COALESCE(excluded.base_plan_price_id, stripe_invoice_payments.base_plan_price_id)
            WHEN ? = 1
              AND stripe_invoice_payments.organization_id = excluded.organization_id
              AND stripe_invoice_payments.stripe_subscription_id = excluded.stripe_subscription_id
              AND excluded.status = 'paid'
              AND stripe_invoice_payments.base_plan_price_id IS NULL
              AND excluded.base_plan_price_id IS NOT NULL
              AND julianday(excluded.period_start) IS NOT NULL
              AND julianday(excluded.period_end) > julianday(excluded.period_start)
              AND (
                stripe_invoice_payments.period_end IS NULL
                OR (
                  julianday(stripe_invoice_payments.period_end) IS NOT NULL
                  AND julianday(excluded.period_end) >= julianday(stripe_invoice_payments.period_end)
                )
              )
              THEN excluded.base_plan_price_id
              ELSE stripe_invoice_payments.base_plan_price_id END,
          status = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.status ELSE stripe_invoice_payments.status END,
          period_start = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN COALESCE(excluded.period_start, stripe_invoice_payments.period_start)
            WHEN ? = 1
              AND stripe_invoice_payments.organization_id = excluded.organization_id
              AND stripe_invoice_payments.stripe_subscription_id = excluded.stripe_subscription_id
              AND excluded.status = 'paid'
              AND stripe_invoice_payments.base_plan_price_id IS NULL
              AND excluded.base_plan_price_id IS NOT NULL
              AND julianday(excluded.period_start) IS NOT NULL
              AND julianday(excluded.period_end) > julianday(excluded.period_start)
              AND (
                stripe_invoice_payments.period_end IS NULL
                OR (
                  julianday(stripe_invoice_payments.period_end) IS NOT NULL
                  AND julianday(excluded.period_end) >= julianday(stripe_invoice_payments.period_end)
                )
              )
              THEN excluded.period_start
              ELSE stripe_invoice_payments.period_start END,
          period_end = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN COALESCE(excluded.period_end, stripe_invoice_payments.period_end)
            WHEN ? = 1
              AND stripe_invoice_payments.organization_id = excluded.organization_id
              AND stripe_invoice_payments.stripe_subscription_id = excluded.stripe_subscription_id
              AND excluded.status = 'paid'
              AND stripe_invoice_payments.base_plan_price_id IS NULL
              AND excluded.base_plan_price_id IS NOT NULL
              AND julianday(excluded.period_start) IS NOT NULL
              AND julianday(excluded.period_end) > julianday(excluded.period_start)
              AND (
                stripe_invoice_payments.period_end IS NULL
                OR (
                  julianday(stripe_invoice_payments.period_end) IS NOT NULL
                  AND julianday(excluded.period_end) >= julianday(stripe_invoice_payments.period_end)
                )
              )
              THEN excluded.period_end
              ELSE stripe_invoice_payments.period_end END,
          past_due_since = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN CASE
                WHEN excluded.status = 'failed' THEN COALESCE(stripe_invoice_payments.past_due_since, excluded.past_due_since)
                ELSE NULL
              END
              ELSE stripe_invoice_payments.past_due_since END,
          last_event_created = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.last_event_created ELSE stripe_invoice_payments.last_event_created END,
          last_event_id = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.last_event_id ELSE stripe_invoice_payments.last_event_id END,
          updated_at = CASE
            WHEN excluded.last_event_created > stripe_invoice_payments.last_event_created
              OR (excluded.last_event_created = stripe_invoice_payments.last_event_created AND excluded.last_event_id > stripe_invoice_payments.last_event_id)
              THEN excluded.updated_at ELSE stripe_invoice_payments.updated_at END
      `,
      params: [
        input.invoiceId,
        input.organizationId,
        input.subscriptionId,
        input.basePlanPriceId ?? null,
        input.paymentStatus,
        input.invoicePeriodStart ?? null,
        input.invoicePeriodEnd ?? input.paidThrough ?? null,
        input.paymentStatus === 'failed'
          ? input.pastDueSince ?? new Date(input.eventCreated * 1000).toISOString()
          : null,
        input.eventCreated,
        input.eventId,
        now,
        input.canonicalPaidEvidence ? 1 : 0,
        input.canonicalPaidEvidence ? 1 : 0,
        input.canonicalPaidEvidence ? 1 : 0,
      ],
    },
    {
      query: `
        INSERT INTO organization_billing
          (id, organization_id, stripe_customer_id, stripe_subscription_id,
           status, plan, payment_status, paid_through, past_due_since, last_paid_invoice_id,
           last_payment_event_created, last_payment_event_id, updated_at)
        VALUES (?, ?, ?, ?, 'free', 'free',
          (SELECT status FROM stripe_invoice_payments WHERE organization_id = ? ORDER BY last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          (SELECT period_end FROM stripe_invoice_payments WHERE organization_id = ? AND status = 'paid' AND base_plan_price_id IS NOT NULL AND period_end IS NOT NULL ORDER BY period_end DESC, last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          (SELECT past_due_since FROM stripe_invoice_payments WHERE organization_id = ? AND status = 'failed' ORDER BY last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          (SELECT stripe_invoice_id FROM stripe_invoice_payments WHERE organization_id = ? AND status = 'paid' AND base_plan_price_id IS NOT NULL AND period_end IS NOT NULL ORDER BY period_end DESC, last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          (SELECT last_event_created FROM stripe_invoice_payments WHERE organization_id = ? ORDER BY last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          (SELECT last_event_id FROM stripe_invoice_payments WHERE organization_id = ? ORDER BY last_event_created DESC, last_event_id DESC, stripe_invoice_id DESC LIMIT 1),
          ?)
        ON CONFLICT(organization_id) DO UPDATE SET
          stripe_customer_id = COALESCE(excluded.stripe_customer_id, organization_billing.stripe_customer_id),
          stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, organization_billing.stripe_subscription_id),
          payment_status = excluded.payment_status,
          paid_through = excluded.paid_through,
          past_due_since = excluded.past_due_since,
          last_paid_invoice_id = excluded.last_paid_invoice_id,
          last_payment_event_created = excluded.last_payment_event_created,
          last_payment_event_id = excluded.last_payment_event_id,
          updated_at = excluded.updated_at
      `,
      params: [
        `billing-${input.organizationId}`,
        input.organizationId,
        input.customerId,
        input.subscriptionId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        now,
      ],
    },
    {
      query: `
        UPDATE site_billing
          SET payment_status = (SELECT payment_status FROM organization_billing WHERE organization_id = ? LIMIT 1),
            paid_through = (SELECT paid_through FROM organization_billing WHERE organization_id = ? LIMIT 1),
            past_due_since = (SELECT past_due_since FROM organization_billing WHERE organization_id = ? LIMIT 1),
            last_paid_invoice_id = (SELECT last_paid_invoice_id FROM organization_billing WHERE organization_id = ? LIMIT 1),
            last_payment_event_created = (SELECT last_payment_event_created FROM organization_billing WHERE organization_id = ? LIMIT 1),
            last_payment_event_id = (SELECT last_payment_event_id FROM organization_billing WHERE organization_id = ? LIMIT 1),
            updated_at = ?
          WHERE organization_id = ?
      `,
      params: [
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        input.organizationId,
        now,
        input.organizationId,
      ],
    },
    ...sites.map(site => ({
      query: `
        INSERT OR IGNORE INTO site_billing
          (id, site_id, organization_id, payment_status, paid_through, past_due_since, last_paid_invoice_id,
           last_payment_event_created, last_payment_event_id, updated_at)
        SELECT ?, ?, ?, payment_status, paid_through, past_due_since, last_paid_invoice_id,
               last_payment_event_created, last_payment_event_id, ?
        FROM organization_billing
        WHERE organization_id = ?
      `,
      params: [`sb-${site.id}`, site.id, input.organizationId, now, input.organizationId],
    })),
  ])
}

export function entitlementLimits(plan: string): EntitlementsMap {
  return getPlanEntitlements(plan)
}
