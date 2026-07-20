// Create Stripe billing portal session for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe, requireBillingAccess } from '../../utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { queryFirst } from '~/server/db'

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

  try {
    // Reject a body organizationId that disagrees with the current dashboard
    // URL/header context instead of trusting the body alone.
    const resolvedOrganization = await resolveRequestedOrganization(event, db, session.user.id, {
      explicitOrganizationId: organizationId,
    })
    if (!resolvedOrganization) {
      return jsonResponse({ error: 'Organization not found' }, { status: 404 })
    }

    // Require billing access
    await requireBillingAccess(env, db, resolvedOrganization.id, session.user.id)

    // Get organization with Stripe customer
    const organization = await queryFirst<{ slug: string | null; stripe_customer_id: string | null }>(db, `
      SELECT o.name, o.slug, b.stripe_customer_id FROM organization o
      LEFT JOIN organization_billing b ON o.id = b.organization_id
      WHERE o.id = ?
    `, [resolvedOrganization.id])
    
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
      return_url: returnUrl || `${getRequestURL(event).origin}/dashboard/${organization.slug}/settings/billing`
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
