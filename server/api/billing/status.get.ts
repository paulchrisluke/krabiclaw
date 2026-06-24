// Get billing status for organization
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus } from '../../utils/billing'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  
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
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
    const activeOrganizationId = typeof sessionRecord.activeOrganizationId === 'string'
      ? sessionRecord.activeOrganizationId
      : ''
    const userOrg = await queryFirst<{ id: string }>(db, `
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC
      LIMIT 1
    `, [session.user.id, activeOrganizationId])
    
    if (!userOrg) {
      return jsonResponse({ error: 'No organization found' }, { status: 404 })
    }
    
    organizationId = userOrg.id
  }

  try {
    // Verify user is member of organization
    const membership = await queryFirst<{ role: string }>(db, `
      SELECT role FROM member
      WHERE organizationId = ? AND userId = ?
      LIMIT 1
    `, [organizationId, session.user.id])
    
    if (!membership) {
      return jsonResponse({ 
        error: 'Access denied' 
      }, { status: 403 })
    }

    // Get billing status
    const billingStatus = await getOrganizationBillingStatus(env, db, organizationId)
    
    return jsonResponse({
      success: true,
      billing: { ...billingStatus, organizationId },
      userRole: membership.role
    })
    
  } catch (error) {
    console.error('Failed to get billing status:', error)
    return jsonResponse({ 
      error: 'Failed to get billing status' 
    }, { status: 500 })
  }
})
