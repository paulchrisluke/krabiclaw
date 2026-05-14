// Start Google Business OAuth flow
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleBusinessAuthUrl } from '../../../utils/google-business'
import { hasEntitlement } from '../../../utils/billing'

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
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Check Google Business entitlement
    const hasEntitlementValue = await hasEntitlement(env, db, site.organization_id, 'google_business')
    if (!hasEntitlementValue) {
      return jsonResponse({ 
        error: 'Google Business integration requires a paid plan. Upgrade your plan to access this feature.' 
      }, { status: 403 })
    }

    // Generate state parameter for security
    const state = JSON.stringify({
      siteId,
      organizationId: site.organization_id,
      userId: session.user.id,
      timestamp: Date.now()
    })

    // Generate OAuth URL
    const authUrl = getGoogleBusinessAuthUrl(env, state)
    
    return jsonResponse({
      success: true,
      authUrl,
      message: 'Redirect to Google Business to authorize access'
    })
    
  } catch (error) {
    console.error('Failed to start Google Business OAuth:', error)
    return jsonResponse({ 
      error: 'Failed to start Google Business authorization' 
    }, { status: 500 })
  }
})
