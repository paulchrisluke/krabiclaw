// Create Stripe checkout session for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, getPriceIdForPlan, requireBillingAccess } from '../../utils/billing'

interface CheckoutRequest {
  organizationId?: string
  plan: string
  interval?: 'month' | 'year'
  successUrl?: string
  cancelUrl?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as CheckoutRequest
  const { plan, successUrl, cancelUrl } = body
  const interval = body.interval ?? 'month'
  let organizationId = body.organizationId

  if (!plan) {
    return jsonResponse({ error: 'Plan is required' }, { status: 400 })
  }

  if (plan !== 'pro' && plan !== 'enterprise') {
    return jsonResponse({
      error: 'Invalid plan. Allowed values are pro or enterprise'
    }, { status: 400 })
  }

  if (interval !== 'month' && interval !== 'year') {
    return jsonResponse({
      error: 'Invalid interval. Allowed values are month or year'
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Check Stripe configuration
  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ 
      error: 'Stripe not configured' 
    }, { status: 503 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  // Auto-detect org from session when not provided (e.g. pricing page CTA)
  if (!organizationId) {
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
    const activeOrganizationId = typeof sessionRecord.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : ''
    const userOrg = await db.prepare(`
      SELECT o.id AS organizationId
      FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC
      LIMIT 1
    `).bind(session.user.id, activeOrganizationId).first<{ organizationId: string }>()
    if (!userOrg) {
      return jsonResponse({ error: 'No organization found' }, { status: 404 })
    }
    organizationId = userOrg.organizationId
  }

  const orgId: string = organizationId!

  try {
    // Require billing access
    await requireBillingAccess(env, db, orgId, session.user.id)
    
    // Get organization details
    const organization = await db.prepare(`
      SELECT o.name, o.slug, b.stripe_customer_id FROM organization o
      LEFT JOIN organization_billing b ON o.id = b.organization_id
      WHERE o.id = ?
    `).bind(orgId).first<{ name: string; slug: string | null; stripe_customer_id: string | null }>()
    
    if (!organization) {
      return jsonResponse({ 
        error: 'Organization not found' 
      }, { status: 404 })
    }

    // Get price ID for plan + interval
    let priceId: string
    try {
      priceId = await getPriceIdForPlan(env, plan, interval)
    } catch (error) {
      console.error('Invalid Stripe pricing configuration in checkout', { plan, interval, error })
      return jsonResponse({
        error: 'Billing is temporarily unavailable for the selected plan'
      }, { status: 503 })
    }

    const stripe = getStripe(env)
    
    // Create or get Stripe customer
    let customerId = organization.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        metadata: {
          organization_id: orgId
        }
      })
      customerId = customer.id
      
      // Update organization_billing with customer ID
      await db.prepare(`
        INSERT OR REPLACE INTO organization_billing 
        (id, organization_id, stripe_customer_id, updated_at)
        VALUES (?, ?, ?, ?)
      `).bind(
        `billing-${orgId}`,
        orgId,
        customerId,
        new Date().toISOString()
      ).run()
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl || `${getRequestURL(event).origin}/dashboard/${organization.slug}/settings/billing?success=true`,
      cancel_url: cancelUrl || `${getRequestURL(event).origin}/dashboard/${organization.slug}/settings/billing?canceled=true`,
      metadata: {
        organization_id: organizationId,
        plan
      },
      subscription_data: {
        metadata: {
          organization_id: orgId,
          plan
        }
      }
    })

    return jsonResponse({
      success: true,
      checkoutUrl: checkoutSession.url
    })
    
  } catch (error) {
    console.error('Failed to create checkout session:', error)
    return jsonResponse({ 
      error: 'Failed to create checkout session' 
    }, { status: 500 })
  }
})
