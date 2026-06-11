// Billing and entitlement utilities for KrabiClaw SaaS
import Stripe from 'stripe'

type EntitlementValue = string | number | boolean
type EntitlementsMap = Record<string, EntitlementValue>

interface BillingRow {
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
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

export interface OrganizationEntitlement {
  id: string
  organization_id: string
  key: string
  value: string
  source: string
  created_at: string
  updated_at: string
}

export interface BillingStatus {
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

// Get Stripe instance
export function getStripe(env: BillingEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key not configured')
  }
  
  return new Stripe(env.STRIPE_SECRET_KEY)
}

// Get organization billing status
export async function getOrganizationBillingStatus(
  env: BillingEnv, 
  db: D1Database, 
  organizationId: string
): Promise<BillingStatus> {
  // Get entitlements
  const entitlements = await getOrganizationEntitlements(env, db, organizationId)
  
  // Get billing metadata from organization_billing table
  const billing = await db.prepare(`
    SELECT stripe_customer_id, stripe_subscription_id, plan, status,
           current_period_end, cancel_at_period_end,
           auto_topup_enabled, auto_topup_bundle, auto_topup_threshold
    FROM organization_billing
    WHERE organization_id = ?
  `).bind(organizationId).first<BillingRow>()

  return {
    plan: billing?.plan ?? String(entitlements.plan ?? 'free'),
    stripeCustomerId: billing?.stripe_customer_id ?? undefined,
    stripeSubscriptionId: billing?.stripe_subscription_id ?? undefined,
    subscriptionStatus: billing?.status ?? undefined,
    currentPeriodEnd: billing?.current_period_end ?? undefined,
    cancelAtPeriodEnd: billing?.cancel_at_period_end ?? undefined,
    autoTopupEnabled: Boolean(billing?.auto_topup_enabled),
    autoTopupBundle: billing?.auto_topup_bundle ?? 500,
    autoTopupThreshold: billing?.auto_topup_threshold ?? 100,
    entitlements
  }
}

// Get all organization entitlements
export async function getOrganizationEntitlements(
  env: BillingEnv, 
  db: D1Database, 
  organizationId: string
): Promise<EntitlementsMap> {
  void env
  const entitlements = await db.prepare(`
    SELECT key, value FROM organization_entitlements 
    WHERE organization_id = ?
  `).bind(organizationId).all<EntitlementRow>()
  
  const rows = entitlements.results ?? []
  const result: EntitlementsMap = {}
  for (const entitlement of rows) {
    // Convert string values to appropriate types
    const value = entitlement.value.toLowerCase()
    if (value === 'true' || value === 'false') {
      result[entitlement.key] = value === 'true'
    } else if (/^\d+$/.test(value)) {
      result[entitlement.key] = parseInt(value, 10)
    } else {
      result[entitlement.key] = entitlement.value
    }
  }
  
  return result
}

// Check if organization has specific entitlement
export async function hasEntitlement(
  env: BillingEnv, 
  db: D1Database, 
  organizationId: string, 
  key: string
): Promise<boolean> {
  void env
  const entitlement = await db.prepare(`
    SELECT value FROM organization_entitlements 
    WHERE organization_id = ? AND key = ?
    LIMIT 1
  `).bind(organizationId, key).first<EntitlementValueRow>()
  
  if (!entitlement) return false
  return entitlement.value.toLowerCase() === 'true'
}

// Set organization entitlements based on plan
export async function setOrganizationEntitlementsFromPlan(
  env: BillingEnv, 
  db: D1Database, 
  organizationId: string, 
  plan: string
): Promise<void> {
  void env
  const planEntitlements = getPlanEntitlements(plan)
  const now = new Date().toISOString()
  
  for (const [key, value] of Object.entries(planEntitlements)) {
    await db.prepare(`
      INSERT OR REPLACE INTO organization_entitlements 
      (id, organization_id, key, value, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `ent-${organizationId}-${key}`,
      organizationId,
      key,
      String(value),
      'system',
      now,
      now
    ).run()
  }
}

// Get entitlements for different plans
function getPlanEntitlements(plan: string): EntitlementsMap {
  const baseEntitlements = {
    plan,
    custom_domains: false,
    google_business: false,
    remove_branding: false,
    max_sites: 1,
    max_locations: 1,
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
      return {
        ...baseEntitlements,
        translation: true,
        translation_languages: 1,
        ai_credits: 2000,
        google_business: true,
        custom_domains: true,
      }

    case 'managed':
      return {
        ...baseEntitlements,
        translation: true,
        translation_languages: -1,
        ai_credits: 'unlimited',
        managed_service: true,
        custom_domains: true,
        google_business: true,
        advanced_seo: true,
        max_locations: -1,
      }

    case 'seo_accelerator':
      return {
        ...baseEntitlements,
        translation: true,
        translation_languages: -1,
        ai_credits: 'unlimited',
        managed_service: true,
        seo_accelerator: true,
        custom_domains: true,
        google_business: true,
        advanced_seo: true,
        max_locations: -1,
      }

    default:
      return baseEntitlements
  }
}

// No-op: per-location quantity billing removed with migration to managed service plans.
export async function updateSubscriptionQuantity(
  _env: BillingEnv,
  _db: D1Database,
  _organizationId: string
): Promise<void> {}

// Require billing access for organization
export async function requireBillingAccess(
  env: BillingEnv, 
  db: D1Database, 
  organizationId: string, 
  userId: string
): Promise<void> {
  void env
  const membership = await db.prepare(`
      SELECT role FROM member
      WHERE organizationId = ? AND userId = ?
      LIMIT 1
    `).bind(organizationId, userId).first() as MembershipRow | null
  
  if (!membership) {
    throw new Error('Access denied: Not a member of this organization')
  }
  
  // Only owners can manage billing
  if (membership.role !== 'owner') {
    throw new Error('Access denied: Only owners can manage billing')
  }
}

// Verify Stripe webhook signature
export function verifyStripeWebhook(
  env: BillingEnv, 
  payload: string, 
  signature: string
): boolean {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret not configured')
  }
  
  const stripe = getStripe(env)
  
  try {
    stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
    return true
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return false
  }
}

export async function getPriceIdForPlan(
  env: BillingEnv,
  plan: string,
  interval: 'month' | 'year' = 'month'
): Promise<string> {
  const stripe = getStripe(env)
  const products = await stripe.products.list({ active: true, limit: 100 })
  const product = products.data.find((candidate) => candidate.metadata?.plan_id === plan)
  if (!product) throw new Error(`No active Stripe product found for plan ${plan}`)

  const prices = await stripe.prices.list({
    active: true,
    product: product.id,
    type: 'recurring',
    limit: 100
  })
  const price = prices.data.find((candidate) => candidate.recurring?.interval === interval)
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
