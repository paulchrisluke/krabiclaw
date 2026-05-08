// Get domains for a site
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getSiteDomains } from '../../../utils/domains'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }
  
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

  try {
    // Verify user has access to the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get domains for the site
    const domains = await getSiteDomains(db, siteId)
    
    return jsonResponse({
      success: true,
      domains,
      siteId
    })
    
  } catch (error) {
    console.error('Failed to get site domains:', error)
    return jsonResponse({ 
      error: 'Failed to get site domains' 
    }, { status: 500 })
  }
})
