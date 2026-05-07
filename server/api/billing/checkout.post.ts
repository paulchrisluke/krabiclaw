// Create Stripe checkout session for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getStripe, getPriceId, requireBillingAccess } from '../../utils/billing'

interface CheckoutRequest {
  organizationId: string
  plan: string
  successUrl?: string
  cancelUrl?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as CheckoutRequest
  const { organizationId, plan, successUrl, cancelUrl } = body
  
  if (!organizationId || !plan) {
    return jsonResponse({ 
      error: 'Organization ID and plan are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
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
  const headers = getHeaders(event)
  const session = await $fetch('/api/auth/get-session', {
    headers: {
      cookie: headers.cookie || '',
      authorization: headers.authorization || ''
    }
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Require billing access
    await requireBillingAccess(env, db, organizationId, session.user.id)
    
    // Get organization details
    const organization = await db.prepare(`
      SELECT o.name, b.stripe_customer_id FROM organization o
      LEFT JOIN organization_billing b ON o.id = b.organization_id
      WHERE o.id = ?
    `).bind(organizationId).first()
    
    if (!organization) {
      return jsonResponse({ 
        error: 'Organization not found' 
      }, { status: 404 })
    }

    // Get price ID for plan
    const priceId = getPriceId(env, plan)
    if (!priceId) {
      return jsonResponse({ 
        error: `No price configured for plan: ${plan}` 
      }, { status: 400 })
    }

    const stripe = getStripe(env)
    
    // Create or get Stripe customer
    let customerId = organization.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        metadata: {
          organization_id: organizationId
        }
      })
      customerId = customer.id
      
      // Update organization_billing with customer ID
      await db.prepare(`
        INSERT OR REPLACE INTO organization_billing 
        (id, organization_id, stripe_customer_id, updated_at)
        VALUES (?, ?, ?, ?)
      `).bind(
        `billing-${organizationId}`,
        organizationId,
        customerId,
        new Date().toISOString()
      ).run()
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl || `${getRequestURL(event).origin}/dashboard/billing?success=true`,
      cancel_url: cancelUrl || `${getRequestURL(event).origin}/dashboard/billing?canceled=true`,
      metadata: {
        organization_id: organizationId,
        plan
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
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
