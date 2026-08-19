import type Stripe from 'stripe'
import { HTTPError } from 'nitro';
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { getOrgAdapter, hasPermission } from 'better-auth/plugins'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import { createStripeClient } from '~/server/utils/stripe-client'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'
import { assertNewSalePlan } from '~/shared/billing-model'
import {
  assertGrowthStripeCatalogPrices,
  resolveStripeCatalogPrice,
  selectStripeCatalogPrice,
} from '~/server/utils/stripe-catalog'

interface EntitlementRow {
  key: string
  value: string
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

const billingAuthorizationOptions = {
  ac: organizationAccessControl,
  roles: organizationRoles,
} as const

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
  if (!site) {
    return {
      plan: 'free',
      subscriptionStatus: 'free',
      paymentStatus: 'unknown',
      entitlements: getPlanEntitlements('free'),
    }
  }
  return getOrganizationBillingStatus(env, db, site.organization_id)
}

export async function getOrganizationBillingStatus(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
): Promise<SiteBillingStatus> {
  void env
  const projection = await getOrganizationBillingProjection(db, organizationId)
  return {
    plan: projection.effectivePlan,
    stripeCustomerId: projection.stripeCustomerId ?? undefined,
    stripeSubscriptionId: projection.stripeSubscriptionId ?? undefined,
    subscriptionStatus: projection.status,
    paymentStatus: projection.paymentStatus,
    currentPeriodEnd: projection.currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
    entitlements: projection.entitlements,
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
  if (!site) return false
  const projection = await getOrganizationBillingProjection(db, site.organization_id)
  return projection.entitlements[key] === true
}

// Backward-compat shim
export async function hasEntitlement(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
  key: string,
): Promise<boolean> {
  void env
  const projection = await getOrganizationBillingProjection(db, organizationId)
  return projection.entitlements[key] === true
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
  // transfer onboarding wizard, and Google Places sync gating. Keep it in
  // sync with the organization subscription projection used for this site's
  // entitlements.
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
  db: D1Database,
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

// ── User billing items ────────────────────────────────────────────────────────

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
