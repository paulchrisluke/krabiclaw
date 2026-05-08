// Get billing status for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '../../utils/billing'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  // Get organization ID from query or user's active organization
  const query = getQuery(event)
  let organizationId = query.organizationId as string
  
  if (!organizationId) {
    // Get user's first organization
    const userOrg = await db.prepare(`
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      LIMIT 1
    `).bind(session.user.id).first()
    
    if (!userOrg) {
      return jsonResponse({ 
        error: 'No organization found' 
      }, { status: 404 })
    }
    
    organizationId = userOrg.id
  }

  try {
    // Verify user is member of organization
    const membership = await db.prepare(`
      SELECT role FROM member
      WHERE organizationId = ? AND userId = ?
      LIMIT 1
    `).bind(organizationId, session.user.id).first()
    
    if (!membership) {
      return jsonResponse({ 
        error: 'Access denied' 
      }, { status: 403 })
    }

    // Get billing status
    const billingStatus = await getOrganizationBillingStatus(env, db, organizationId)
    
    return jsonResponse({
      success: true,
      billing: billingStatus,
      userRole: membership.role
    })
    
  } catch (error) {
    console.error('Failed to get billing status:', error)
    return jsonResponse({ 
      error: 'Failed to get billing status' 
    }, { status: 500 })
  }
})
