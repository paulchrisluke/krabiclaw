// Create Stripe billing portal session for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '../../utils/billing'

interface PortalRequest {
  organizationId: string
  returnUrl?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as PortalRequest
  const { organizationId, returnUrl } = body
  
  if (!organizationId) {
    return jsonResponse({ 
      error: 'Organization ID is required' 
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
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Require billing access
    await requireBillingAccess(env, db, organizationId, session.user.id)
    
    // Get organization with Stripe customer
    const organization = await db.prepare(`
      SELECT o.name, b.stripe_customer_id FROM organization o
      LEFT JOIN organization_billing b ON o.id = b.organization_id
      WHERE o.id = ?
    `).bind(organizationId).first<{ stripe_customer_id: string | null }>()
    
    if (!organization) {
      return jsonResponse({ 
        error: 'Organization not found' 
      }, { status: 404 })
    }

    if (!organization.stripe_customer_id) {
      return jsonResponse({ 
        error: 'No Stripe customer found for this organization' 
      }, { status: 400 })
    }

    const stripe = getStripe(env)
    
    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: returnUrl || `${getRequestURL(event).origin}/dashboard/billing`
    })

    return jsonResponse({
      success: true,
      portalUrl: portalSession.url
    })
    
  } catch (error) {
    console.error('Failed to create portal session:', error)
    return jsonResponse({ 
      error: 'Failed to create billing portal session' 
    }, { status: 500 })
  }
})
