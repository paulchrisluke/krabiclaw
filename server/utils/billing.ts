// Billing and entitlement utilities for KrabiClaw SaaS
import Stripe from 'stripe'

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_STARTER?: string
  STRIPE_PRICE_PRO?: string
  STRIPE_PRICE_BUSINESS?: string
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
  entitlements: Record<string, any>
}

// Get Stripe instance
export function getStripe(env: BillingEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key not configured')
  }
  
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20'
  } as any)
}

// Get organization billing status
export async function getOrganizationBillingStatus(
  env: BillingEnv, 
  db: any, 
  organizationId: string
): Promise<BillingStatus> {
  // Get entitlements
  const entitlements = await getOrganizationEntitlements(env, db, organizationId)
  
  // Get billing metadata from organization_billing table
  const billing = await db.prepare(`
    SELECT stripe_customer_id, stripe_subscription_id, plan, status,
           current_period_end, cancel_at_period_end
    FROM organization_billing 
    WHERE organization_id = ?
  `).bind(organizationId).first()
  
  return {
    plan: billing?.plan || entitlements.plan || 'free',
    stripeCustomerId: billing?.stripe_customer_id,
    stripeSubscriptionId: billing?.stripe_subscription_id,
    subscriptionStatus: billing?.status,
    currentPeriodEnd: billing?.current_period_end,
    cancelAtPeriodEnd: billing?.cancel_at_period_end,
    entitlements
  }
}

// Get all organization entitlements
export async function getOrganizationEntitlements(
  env: BillingEnv, 
  db: any, 
  organizationId: string
): Promise<Record<string, any>> {
  const entitlements = await db.prepare(`
    SELECT key, value FROM organization_entitlements 
    WHERE organization_id = ?
  `).bind(organizationId).all()
  
  const result: Record<string, any> = {}
  for (const entitlement of entitlements.results || []) {
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
  db: any, 
  organizationId: string, 
  key: string
): Promise<boolean> {
  const entitlement = await db.prepare(`
    SELECT value FROM organization_entitlements 
    WHERE organization_id = ? AND key = ?
    LIMIT 1
  `).bind(organizationId, key).first()
  
  if (!entitlement) return false
  return entitlement.value.toLowerCase() === 'true'
}

// Set organization entitlements based on plan
export async function setOrganizationEntitlementsFromPlan(
  env: BillingEnv, 
  db: any, 
  organizationId: string, 
  plan: string
): Promise<void> {
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
function getPlanEntitlements(plan: string): Record<string, any> {
  const baseEntitlements = {
    plan,
    custom_domains: false,
    google_business: false,
    remove_branding: false,
    max_sites: 1,
    max_locations: 1,
    max_menu_items: 50,
    advanced_seo: false
  }
  
  switch (plan) {
    case 'starter':
      return {
        ...baseEntitlements,
        max_menu_items: 100,
        max_locations: 2
      }
    
    case 'pro':
      return {
        ...baseEntitlements,
        custom_domains: true,
        google_business: true,
        max_menu_items: 500,
        max_locations: 5,
        advanced_seo: true
      }
    
    case 'business':
      return {
        ...baseEntitlements,
        custom_domains: true,
        google_business: true,
        remove_branding: true,
        max_sites: 10,
        max_menu_items: 1000,
        max_locations: 20,
        advanced_seo: true
      }
    
    default:
      return baseEntitlements
  }
}

// Require billing access for organization
export async function requireBillingAccess(
  env: BillingEnv, 
  db: any, 
  organizationId: string, 
  userId: string
): Promise<void> {
  // Check if user is member of organization
  const membership = await db.prepare(`
    SELECT role FROM member 
    WHERE organizationId = ? AND userId = ?
    LIMIT 1
  `).bind(organizationId, userId).first()
  
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

// Get price ID for plan
export function getPriceId(env: BillingEnv, plan: string): string {
  switch (plan) {
    case 'starter':
      return env.STRIPE_PRICE_STARTER || ''
    case 'pro':
      return env.STRIPE_PRICE_PRO || ''
    case 'business':
      return env.STRIPE_PRICE_BUSINESS || ''
    default:
      throw new Error(`Unknown plan: ${plan}`)
  }
}
