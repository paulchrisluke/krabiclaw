import type Stripe from 'stripe'
import { HTTPError } from 'nitro';
import { queryFirst } from '~/server/db'
import type { DbClient } from '~/server/db'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { getOrgAdapter, hasPermission } from 'better-auth/plugins'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { getOrganizationEntitlements, planFromSubscriptions, readOrganizationSubscriptions } from '~/server/utils/billing-access'
import { createStripeClient } from '~/server/utils/stripe-client'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'
import { assertNewSalePlan } from '~/shared/billing-model'
import {
  assertGrowthStripeCatalogPrices,
  resolveStripeCatalogPrice,
  selectStripeCatalogPrice,
} from '~/server/utils/stripe-catalog'

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

export interface SiteBillingStatus {
  plan: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  entitlements: EntitlementsMap
}

const billingAuthorizationOptions = {
  ac: organizationAccessControl,
  roles: organizationRoles,
} as const

export function getStripe(env: BillingEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe secret key not configured')
  return createStripeClient(env.STRIPE_SECRET_KEY)
}


export async function getSiteBillingStatus(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
): Promise<SiteBillingStatus> {
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM organization WHERE id = ? LIMIT 1
  `, [organizationId])
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  return getOrganizationBillingStatus(env, db, site.id)
}

export async function getOrganizationBillingStatus(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
): Promise<SiteBillingStatus> {
  const authContext = await createAuth(env).$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
  // One read of the subscription rows answers both questions asked of them
  // here: which subscription this organization is billed on, and which plan it
  // is entitled to. Those are different rules — a past_due row is the current
  // subscription but grants nothing — so both are applied to the same rows
  // rather than read twice.
  const [organization, subscriptionsByOrganization] = await Promise.all([
    organizationAdapter.findOrganizationById(organizationId),
    readOrganizationSubscriptions(env, [organizationId]),
  ])
  if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  const subscriptions = subscriptionsByOrganization.get(organizationId) ?? []
  const current = subscriptions.filter(row => row.status !== 'canceled' && row.status !== 'incomplete_expired')
  if (current.length > 1) throw new Error('Organization has multiple current subscriptions')
  const subscription = current[0]
  const plan = planFromSubscriptions(organizationId, subscriptions)
  const customerId = 'stripeCustomerId' in organization && typeof organization.stripeCustomerId === 'string'
    ? organization.stripeCustomerId
    : undefined
  if (subscription?.stripeCustomerId && subscription.stripeCustomerId !== customerId) {
    throw new Error('Subscription customer does not match its organization')
  }
  return {
    plan,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? undefined,
    subscriptionStatus: subscription?.status ?? undefined,
    currentPeriodEnd: subscription?.periodEnd ? betterAuthTimestampToIso(subscription.periodEnd, 'subscription.periodEnd') : undefined,
    cancelAtPeriodEnd: subscription ? Boolean(subscription.cancelAtPeriodEnd) : undefined,
    entitlements: getPlanEntitlements(plan),
  }
}

// ── Per-site entitlements ─────────────────────────────────────────────────────

export async function hasSiteEntitlement(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
  key: string,
): Promise<boolean> {
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM organization WHERE id = ? LIMIT 1
  `, [organizationId])
  if (!site) return false
  return (await getOrganizationEntitlements(env, site.id))[key] === true
}

export async function hasOrganizationEntitlement(
  env: CloudflareEnv,
  organizationId: string,
  key: string,
): Promise<boolean> {
  return (await getOrganizationEntitlements(env, organizationId))[key] === true
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

export async function getPriceIdForPlan(env: BillingEnv, plan: string, interval: 'month' | 'year' = 'month'): Promise<string> {
  const validatedPlan = assertNewSalePlan(plan)
  const stripe = getStripe(env)
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

  const monthly = resolveStripeCatalogPrice(products, prices, validatedPlan, 'month')
  const annual = selectStripeCatalogPrice(monthly.product, prices, 'year')
  assertGrowthStripeCatalogPrices(monthly.price, annual)
  if (interval === 'year') {
    if (!annual) throw new Error('No active Stripe year price found for plan growth')
    return annual.id
  }
  return monthly.price.id
}

export async function requireBillingAccess(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  void db
  const auth = createAuth(env)
  const authContext = await auth.$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], billingAuthorizationOptions)
  const membership = await organizationAdapter.findMemberByOrgId({
    userId,
    organizationId,
  })
  if (!membership) throw new HTTPError({ statusCode: 403, statusMessage: 'Access denied: Not a member of this organization' })
  if (!await hasBillingUpdatePermission(organizationId, String(membership.role))) {
    throw new HTTPError({ statusCode: 403, statusMessage: 'Access denied: Only owners can manage billing' })
  }
}

export async function hasBillingUpdatePermission(organizationId: string, role: string): Promise<boolean> {
  return await hasPermission({
    organizationId,
    role,
    options: billingAuthorizationOptions,
    permissions: { billing: ['update'] },
  }, undefined as never)
}

export async function verifyStripeWebhook(
  env: BillingEnv,
  payload: string,
  signature: string,
): Promise<{ ok: true; event: Stripe.Event } | { ok: false; error: string }> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook secret not configured')
  const stripe = getStripe(env)
  try {
    const event = await stripe.webhooks.constructEventAsync(payload, signature, env.STRIPE_WEBHOOK_SECRET)
    return { ok: true, event }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Stripe webhook verification error',
    }
  }
}
