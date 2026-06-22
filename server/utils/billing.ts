import Stripe from 'stripe'

type EntitlementValue = string | number | boolean
type EntitlementsMap = Record<string, EntitlementValue>

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
  auto_topup_enabled: number | null
  auto_topup_bundle: number | null
  auto_topup_threshold: number | null
}

interface EntitlementRow {
  key: string
  value: string
}

interface EntitlementValueRow {
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
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  autoTopupEnabled: boolean
  autoTopupBundle: number
  autoTopupThreshold: number
  entitlements: EntitlementsMap
}

// Keep the old name as an alias so callers that haven't migrated yet still compile
export type BillingStatus = SiteBillingStatus
export type OrganizationEntitlement = { id: string; site_id: string; organization_id: string; key: string; value: string; source: string; created_at: string; updated_at: string }

export function getStripe(env: BillingEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe secret key not configured')
  return new Stripe(env.STRIPE_SECRET_KEY)
}

// ── Per-site billing status ───────────────────────────────────────────────────

export async function getSiteBillingStatus(
  env: BillingEnv,
  db: D1Database,
  siteId: string,
): Promise<SiteBillingStatus> {
  const entitlements = await getSiteEntitlements(db, siteId)

  const siteBilling = await db.prepare(`
    SELECT stripe_subscription_id, stripe_subscription_item_id, plan, status,
           current_period_end, cancel_at_period_end
    FROM site_billing WHERE site_id = ? LIMIT 1
  `).bind(siteId).first<SiteBillingRow>()

  // Customer + auto-topup live at org level
  const orgBilling = await db.prepare(`
    SELECT ob.stripe_customer_id, ob.auto_topup_enabled, ob.auto_topup_bundle, ob.auto_topup_threshold
    FROM site_billing sb
    JOIN organization_billing ob ON ob.organization_id = sb.organization_id
    WHERE sb.site_id = ? LIMIT 1
  `).bind(siteId).first<OrgBillingRow>()

  return {
    plan: siteBilling?.plan ?? String(entitlements.plan ?? 'free'),
    stripeCustomerId: orgBilling?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: siteBilling?.stripe_subscription_id ?? undefined,
    subscriptionStatus: siteBilling?.status ?? undefined,
    currentPeriodEnd: siteBilling?.current_period_end ?? undefined,
    cancelAtPeriodEnd: siteBilling?.cancel_at_period_end ? Boolean(siteBilling.cancel_at_period_end) : undefined,
    autoTopupEnabled: Boolean(orgBilling?.auto_topup_enabled),
    autoTopupBundle: orgBilling?.auto_topup_bundle ?? 500,
    autoTopupThreshold: orgBilling?.auto_topup_threshold ?? 100,
    entitlements,
  }
}

// Backward-compat shim — org-level callers still work during transition
export async function getOrganizationBillingStatus(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
): Promise<SiteBillingStatus> {
  const site = await db.prepare(`SELECT id FROM sites WHERE organization_id = ? ORDER BY id LIMIT 1`)
    .bind(organizationId).first<{ id: string }>()
  if (site) return getSiteBillingStatus(env, db, site.id)

  // No site yet — return bare org customer info
  const orgBilling = await db.prepare(`
    SELECT stripe_customer_id, auto_topup_enabled, auto_topup_bundle, auto_topup_threshold
    FROM organization_billing WHERE organization_id = ? LIMIT 1
  `).bind(organizationId).first<OrgBillingRow>()

  return {
    plan: 'free',
    stripeCustomerId: orgBilling?.stripe_customer_id ?? undefined,
    autoTopupEnabled: Boolean(orgBilling?.auto_topup_enabled),
    autoTopupBundle: orgBilling?.auto_topup_bundle ?? 500,
    autoTopupThreshold: orgBilling?.auto_topup_threshold ?? 100,
    entitlements: getPlanEntitlements('free'),
  }
}

// ── Per-site entitlements ─────────────────────────────────────────────────────

export async function getSiteEntitlements(db: D1Database, siteId: string): Promise<EntitlementsMap> {
  const rows = await db.prepare(`SELECT key, value FROM site_entitlements WHERE site_id = ?`)
    .bind(siteId).all<EntitlementRow>()
  return parseEntitlementRows(rows.results ?? [])
}

export async function hasSiteEntitlement(db: D1Database, siteId: string, key: string): Promise<boolean> {
  const row = await db.prepare(`SELECT value FROM site_entitlements WHERE site_id = ? AND key = ? LIMIT 1`)
    .bind(siteId, key).first<EntitlementValueRow>()
  if (!row) return false
  return row.value.toLowerCase() === 'true'
}

// Backward-compat shim
export async function hasEntitlement(
  env: BillingEnv,
  db: D1Database,
  organizationId: string,
  key: string,
): Promise<boolean> {
  void env
  const site = await db.prepare(`SELECT id FROM sites WHERE organization_id = ? ORDER BY id LIMIT 1`)
    .bind(organizationId).first<{ id: string }>()
  if (!site) return false
  return hasSiteEntitlement(db, site.id, key)
}

export async function setSiteEntitlementsFromPlan(
  db: D1Database,
  siteId: string,
  organizationId: string,
  plan: string,
): Promise<void> {
  const now = new Date().toISOString()
  const entitlements = getPlanEntitlements(plan)
  const statements: D1PreparedStatement[] = []
  for (const [key, value] of Object.entries(entitlements)) {
    statements.push(
      db.prepare(`
        INSERT OR REPLACE INTO site_entitlements
          (id, site_id, organization_id, key, value, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'system', ?, ?)
      `).bind(`sent-${siteId}-${key}`, siteId, organizationId, key, String(value), now, now)
    )
  }
  // sites.plan is a denormalized cache read directly by mcp-workflows, the
  // transfer onboarding wizard, and Google Business sync gating — it must
  // stay in sync with the site_billing.plan that triggered this entitlement
  // refresh, or those call sites keep showing whatever plan existed at
  // site-creation time.
  statements.push(
    db.prepare(`UPDATE sites SET plan = ?, updated_at = ? WHERE id = ? AND organization_id = ?`).bind(plan, now, siteId, organizationId)
  )
  await db.batch(statements)
}

// ── Plan entitlements definition ──────────────────────────────────────────────

export function getPlanEntitlements(plan: string): EntitlementsMap {
  const base: EntitlementsMap = {
    plan,
    custom_domains: false,
    google_business: false,
    remove_branding: false,
    ai_credits: 500,
    advanced_seo: false,
    white_label: false,
    api_access: false,
    translation: false,
    translation_languages: 0,
    managed_service: false,
    seo_accelerator: false,
  }

  switch (plan) {
    case 'growth':
      return { ...base, translation: true, translation_languages: 1, ai_credits: 2000, google_business: true, custom_domains: true, managed_service: true }
    case 'managed':
      return { ...base, translation: true, translation_languages: -1, ai_credits: 'unlimited', managed_service: true, custom_domains: true, google_business: true, advanced_seo: true }
    case 'seo_accelerator':
      return { ...base, translation: true, translation_languages: -1, ai_credits: 'unlimited', managed_service: true, seo_accelerator: true, custom_domains: true, google_business: true, advanced_seo: true }
    default:
      return base
  }
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
  await db.prepare(`
    INSERT INTO organization_billing (id, organization_id, stripe_customer_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      id = excluded.id,
      stripe_customer_id = excluded.stripe_customer_id,
      updated_at = excluded.updated_at
  `).bind(`billing-${organizationId}`, organizationId, customerId, now).run()

  await db.prepare(`
    INSERT OR REPLACE INTO site_billing
      (id, site_id, organization_id, stripe_subscription_id, stripe_subscription_item_id,
       plan, status, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(`sb-${siteId}`, siteId, organizationId, subscriptionId, subscriptionItemId, plan, periodEnd, now).run()

  await setSiteEntitlementsFromPlan(db, siteId, organizationId, plan)
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

export async function getPriceIdForPlan(env: BillingEnv, plan: string, interval: 'month' | 'year' = 'month'): Promise<string> {
  const stripe = getStripe(env)
  const products = await stripe.products.list({ active: true, limit: 100 })
  const product = products.data.find(p => p.metadata?.plan_id === plan)
  if (!product) throw new Error(`No active Stripe product found for plan ${plan}`)
  const prices = await stripe.prices.list({ active: true, product: product.id, type: 'recurring', limit: 100 })
  const price = prices.data.find(p => p.recurring?.interval === interval)
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
  const membership = await db.prepare(`
    SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1
  `).bind(organizationId, userId).first() as MembershipRow | null
  if (!membership) throw new Error('Access denied: Not a member of this organization')
  if (membership.role !== 'owner') throw new Error('Access denied: Only owners can manage billing')
}

export function verifyStripeWebhook(
  env: BillingEnv,
  payload: string,
  signature: string,
): { ok: true } | { ok: false; error: string } {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook secret not configured')
  const stripe = getStripe(env)
  try {
    stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Stripe webhook verification error',
    }
  }
}

// No-op kept for any callers that haven't been updated
export async function updateSubscriptionQuantity(
  _env: BillingEnv, _db: D1Database, _organizationId: string,
): Promise<void> {}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
