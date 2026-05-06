// Get single site details
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { createAuth } from '../../utils/auth'
import { defineEventHandler, getRouterParam, getHeaders } from 'h3'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  
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
  const auth = createAuth(env)
  const session = await auth.api.getSession({
    headers: getHeaders(event)
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  try {
    const site = await db.prepare(`
      SELECT id, organization_id, theme_id, name, slug, subdomain, 
             custom_domain, status, plan, created_at, updated_at,
             onboarding_status
      FROM sites 
      WHERE id = ?
      LIMIT 1
    `).bind(siteId).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found' 
      }, { status: 404 })
    }
    
    // Verify user owns this site
    const membership = await db.prepare(`
      SELECT 1 FROM member m
      WHERE m.organizationId = ? AND m.userId = ?
      LIMIT 1
    `).bind(site.organization_id, session.user.id).first()
    
    if (!membership) {
      return jsonResponse({ 
        error: 'Access denied' 
      }, { status: 403 })
    }
    
    return jsonResponse(site)
    
  } catch (error) {
    console.error('Failed to fetch site:', error)
    return jsonResponse({ 
      error: 'Failed to fetch site' 
    }, { status: 500 })
  }
})
