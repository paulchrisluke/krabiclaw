import type Stripe from 'stripe'
import { createError } from 'h3'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { betterAuthTimestampToIso } from '~/server/utils/better-auth-timestamps'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { getOrgAdapter } from 'better-auth/plugins'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { createStripeClient } from '~/server/utils/stripe-client'

interface SiteBillingRow {
  stripe_subscription_id: string | null
  stripe_subscription_item_id: string | null
  plan: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: number | null
}

interface OrgBillingRow {
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
}

interface BetterAuthSubscriptionRow {
  plan: string
  referenceId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  status: string
  paymentStatus: string | null
  paidThrough: string | null
  pastDueSince: string | null
  periodEnd: number | string | null
  cancelAtPeriodEnd: number | null
}

interface EntitlementRow {
  key: string
  value: string
}

interface MembershipRow {
  role: string
}

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

export interface SiteBillingStatus {
  plan: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  paymentStatus?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  entitlements: EntitlementsMap
}

// Keep the old name as an alias so callers that haven't migrated yet still compile
export type BillingStatus = SiteBillingStatus
export type OrganizationEntitlement = { id: string; site_id: string; organization_id: string; key: string; value: string; source: string; created_at: string; updated_at: string }

export function getStripe(env: BillingEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe secret key not configured')
  return createStripeClient(env.STRIPE_SECRET_KEY)
}

// ── Per-site billing status ───────────────────────────────────────────────────

export async function getSiteBillingStatus(
  env: BillingEnv,
  db: D1Database,
  siteId: string,
): Promise<SiteBillingStatus> {
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM sites WHERE id = ? LIMIT 1
  `, [siteId])
  const subscription = site ? await getBetterAuthSubscription(db, site.organization_id) : null

  const siteBilling = await queryFirst<SiteBillingRow>(db, `
    SELECT stripe_subscription_id, stripe_subscription_item_id, plan, status,
           current_period_end, cancel_at_period_end
    FROM site_billing WHERE site_id = ? LIMIT 1
  `, [siteId])

  // Customer and payment projection live at org level.
  const orgBilling = await queryFirst<OrgBillingRow>(db, `
    SELECT ob.stripe_customer_id, ob.stripe_subscription_id, ob.payment_status, ob.paid_through, ob.past_due_since
    FROM sites s
    JOIN organization_billing ob ON ob.organization_id = s.organization_id
    WHERE s.id = ? LIMIT 1
  `, [siteId])

  const accessPlan = subscription
      ? getEffectiveAccessPlan({
        plan: subscription.plan,
        status: subscription.status,
        paymentStatus: subscription.paymentStatus,
        paidThrough: subscription.paidThrough ?? orgBilling?.paid_through,
        pastDueSince: subscription.pastDueSince ?? orgBilling?.past_due_since,
        periodEnd: subscription.periodEnd,
      })
    : null

  const legacyAccessPlan = 'free'

  return {
    plan: accessPlan ?? legacyAccessPlan,
    stripeCustomerId: subscription?.stripeCustomerId ?? orgBilling?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? orgBilling?.stripe_subscription_id ?? siteBilling?.stripe_subscription_id ?? undefined,
    subscriptionStatus: subscription?.status ?? siteBilling?.status ?? undefined,
    paymentStatus: subscription?.paymentStatus ?? orgBilling?.payment_status ?? undefined,
    currentPeriodEnd: subscription?.periodEnd
      ? betterAuthTimestampToIso(subscription.periodEnd, 'subscription.periodEnd')
      : siteBilling?.current_period_end ?? undefined,
    cancelAtPeriodEnd: subscription
      ? Boolean(subscription.cancelAtPeriodEnd)
      : siteBilling?.cancel_at_period_end ? Boolean(siteBilling.cancel_at_period_end) : undefined,
    entitlements: getPlanEntitlements(accessPlan ?? legacyAccessPlan),
  }
}

// Backward-compat shim — org-level callers still work during transition
export async function getOrganizationBillingStatus(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
): Promise<SiteBillingStatus> {
  const site = await queryFirst<{ id: string }>(db, `SELECT id FROM sites WHERE organization_id = ? ORDER BY id LIMIT 1`, [organizationId])
  if (site) return getSiteBillingStatus(env, db, site.id)

  const subscription = await getBetterAuthSubscription(db, organizationId)
  // No site yet — return bare org customer info
  const orgBilling = await queryFirst<OrgBillingRow>(db, `
    SELECT stripe_customer_id, payment_status, paid_through, past_due_since
    FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [organizationId])

  const accessPlan = subscription
      ? getEffectiveAccessPlan({
        plan: subscription.plan,
        status: subscription.status,
        paymentStatus: subscription.paymentStatus,
        paidThrough: subscription.paidThrough ?? orgBilling?.paid_through,
        pastDueSince: subscription.pastDueSince ?? orgBilling?.past_due_since,
        periodEnd: subscription.periodEnd,
      })
    : 'free'

  return {
    plan: accessPlan,
    stripeCustomerId: subscription?.stripeCustomerId ?? orgBilling?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? undefined,
    subscriptionStatus: subscription?.status,
    paymentStatus: subscription?.paymentStatus ?? orgBilling?.payment_status ?? undefined,
    currentPeriodEnd: subscription?.periodEnd
      ? betterAuthTimestampToIso(subscription.periodEnd, 'subscription.periodEnd')
      : undefined,
    cancelAtPeriodEnd: subscription ? Boolean(subscription.cancelAtPeriodEnd) : undefined,
    entitlements: getPlanEntitlements(accessPlan),
  }
}

// ── Per-site entitlements ─────────────────────────────────────────────────────

export async function getSiteEntitlements(db: D1Database, siteId: string): Promise<EntitlementsMap> {
  const rows = await queryAll<EntitlementRow>(db, `SELECT key, value FROM site_entitlements WHERE site_id = ?`, [siteId])
  return parseEntitlementRows(rows ?? [])
}

export async function getOrganizationEntitlements(db: D1Database, organizationId: string): Promise<EntitlementsMap> {
  const rows = await queryAll<EntitlementRow>(db, `
    SELECT key, value FROM organization_entitlements WHERE organization_id = ?
  `, [organizationId])
  return parseEntitlementRows(rows ?? [])
}

export async function hasSiteEntitlement(db: DbClient, siteId: string, key: string): Promise<boolean> {
  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM sites WHERE id = ? LIMIT 1
  `, [siteId])
  const subscription = site ? await getBetterAuthSubscription(db, site.organization_id) : null
  if (!subscription) return false
  return getPlanEntitlements(getEffectiveAccessPlan(subscription))[key] === true
}

// Backward-compat shim
export async function hasEntitlement(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
  key: string,
): Promise<boolean> {
  void env
  const subscription = await getBetterAuthSubscription(db, organizationId)
  if (!subscription) return false
  return getPlanEntitlements(getEffectiveAccessPlan(subscription))[key] === true
}

export async function setSiteEntitlementsFromPlan(
  db: D1Database,
  siteId: string,
  organizationId: string,
  plan: string,
): Promise<void> {
  const now = new Date().toISOString()
  const entitlements = getPlanEntitlements(plan)
  const queries: { query: string; params: unknown[] }[] = []
  for (const [key, value] of Object.entries(entitlements)) {
    queries.push({
      query: `
        INSERT OR REPLACE INTO site_entitlements
          (id, site_id, organization_id, key, value, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'system', ?, ?)
      `,
      params: [`sent-${siteId}-${key}`, siteId, organizationId, key, String(value), now, now],
    })
  }
  // sites.plan is a denormalized cache read directly by mcp-workflows, the
  // transfer onboarding wizard, and Google Places sync gating — it must
  // stay in sync with the site_billing.plan that triggered this entitlement
  // refresh, or those call sites keep showing whatever plan existed at
  // site-creation time.
  //
  // executeBatch runs these as a single atomic D1Database.batch() call — do
  // not swap this for batchStatements()/sequential execute(), which provide
  // no transactional guarantee and could leave entitlements and sites.plan
  // out of sync if one write fails partway through.
  queries.push({
    query: `UPDATE sites SET plan = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
    params: [plan, now, siteId, organizationId],
  })
  await executeBatch(db, queries)
}

export async function applySiteSubscription(
  db: D1Database,
  siteId: string,
  organizationId: string,
  customerId: string,
  subscriptionId: string,
  subscriptionItemId: string | null,
  plan: string,
  periodEnd: string | null,
): Promise<void> {
  const now = new Date().toISOString()

  // Ensure org has a Stripe customer record
  await execute(db, `
    INSERT INTO organization_billing (id, organization_id, stripe_customer_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      id = excluded.id,
      stripe_customer_id = excluded.stripe_customer_id,
      updated_at = excluded.updated_at
  `, [`billing-${organizationId}`, organizationId, customerId, now])

  // ON CONFLICT(site_id) DO UPDATE, not INSERT OR REPLACE — REPLACE deletes and
  // recreates the row, wiping any column (e.g. payment_method) not in this list.
  await execute(db, `
    INSERT INTO site_billing
      (id, site_id, organization_id, stripe_subscription_id, stripe_subscription_item_id,
       plan, status, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_subscription_item_id = excluded.stripe_subscription_item_id,
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at
  `, [`sb-${siteId}`, siteId, organizationId, subscriptionId, subscriptionItemId, plan, periodEnd, now])

  await setSiteEntitlementsFromPlan(db, siteId, organizationId, plan)
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

export async function getPriceIdForPlan(env: BillingEnv, plan: string, interval: 'month' | 'year' = 'month'): Promise<string> {
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

  const product = products.find(p => p.metadata?.plan_id === plan)
  if (!product) throw new Error(`No active Stripe product found for plan ${plan}`)

  const prices: Stripe.Price[] = []
  let pricesStartingAfter: string | undefined
  do {
    const page = await stripe.prices.list({
      active: true,
      product: product.id,
      type: 'recurring',
      limit: 100,
      ...(pricesStartingAfter ? { starting_after: pricesStartingAfter } : {}),
    })
    prices.push(...page.data)
    pricesStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined
  } while (pricesStartingAfter)

  const price = prices.find(p => p.recurring?.interval === interval && p.recurring.interval_count === 1)
  if (!price) throw new Error(`No active Stripe ${interval} price found for plan ${plan}`)
  return price.id
}

export async function getPlanFromStripePrice(env: BillingEnv, priceId: string): Promise<string | null> {
  const stripe = getStripe(env)
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
  const product = typeof price.product === 'string' ? null : price.product
  if (!product || product.deleted) return null
  const plan = product?.metadata?.plan_id
  return typeof plan === 'string' && plan.length > 0 ? plan : null
}

export async function requireBillingAccess(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
  userId: string,
): Promise<void> {
  void env
  const membership = await queryFirst<MembershipRow>(db, `
    SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1
  `, [organizationId, userId])
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Access denied: Not a member of this organization' })
  if (membership.role !== 'owner') throw createError({ statusCode: 403, statusMessage: 'Access denied: Only owners can manage billing' })
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

// ── User billing items ────────────────────────────────────────────────────────

export interface UserBillingItem {
  organization: {
    id: string
    name: string
    slug: string
    logo: string | null
    createdAt: string
    role: string
  }
  billing: {
    plan: string | null
    subscriptionStatus?: string | null
    organizationId: string
  }
  userRole: string
}

export async function getUserBillingItems(
  env: CloudflareEnv,
  db: D1Database,
  userId: string,
): Promise<UserBillingItem[]> {
  const auth = createAuth(env)
  const authContext = await auth.$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
  const organizations = await organizationAdapter.listOrganizations(userId)
  const organizationRows = await Promise.all(organizations.map(async (organization) => {
    const member = await organizationAdapter.findMemberByOrgId({
      userId,
      organizationId: organization.id,
    })
    if (!member) throw new Error(`Better Auth membership missing for organization ${organization.id}`)
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo ?? null,
      createdAt: betterAuthTimestampToIso(organization.createdAt, 'organization.createdAt'),
      role: String(member.role),
    }
  }))

  return await Promise.all(organizationRows.map(async (organization) => {
    const billingStatus = await getOrganizationBillingStatus(env, db, organization.id)
    return {
      organization,
      billing: { ...billingStatus, organizationId: organization.id },
      userRole: organization.role,
    }
  }))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getBetterAuthSubscription(db: DbClient, organizationId: string): Promise<BetterAuthSubscriptionRow | null> {
  return await queryFirst<BetterAuthSubscriptionRow>(db, `
    SELECT plan, referenceId, stripeCustomerId, stripeSubscriptionId, status,
           periodEnd, cancelAtPeriodEnd,
           (SELECT payment_status FROM organization_billing WHERE organization_id = referenceId LIMIT 1) AS paymentStatus,
           (SELECT paid_through FROM organization_billing WHERE organization_id = referenceId LIMIT 1) AS paidThrough,
           (SELECT past_due_since FROM organization_billing WHERE organization_id = referenceId LIMIT 1) AS pastDueSince
    FROM subscription
    WHERE referenceId = ?
      AND status IN ('active', 'trialing', 'past_due')
    ORDER BY
      CASE status
        WHEN 'active' THEN 0
        WHEN 'trialing' THEN 1
        WHEN 'past_due' THEN 2
        ELSE 3
      END,
      updatedAt DESC
    LIMIT 1
  `, [organizationId])
}

function parseEntitlementRows(rows: EntitlementRow[]): EntitlementsMap {
  const result: EntitlementsMap = {}
  for (const row of rows) {
    const v = row.value.toLowerCase()
    if (v === 'true' || v === 'false') result[row.key] = v === 'true'
    else if (/^-?\d+$/.test(v)) result[row.key] = parseInt(v, 10)
    else result[row.key] = row.value
  }
  return result
}
