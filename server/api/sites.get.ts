// Get sites for authenticated user's organization
import { cloudflareEnv, jsonResponse } from '../utils/api-response'
import { getAuthSession } from '../utils/auth'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  const userId = session.user.id
  
  try {
    // Get user's organization
    const organization = await db.prepare(`
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
    `).bind(userId).all()
    
    if (!organization.results || organization.results.length === 0) {
      return jsonResponse({
        sites: []
      })
    }
    
    const orgIds = organization.results.map((org: ApiValue) => org.id)
    
    // Build WHERE clause for multiple organization IDs
    const placeholders = orgIds.map(() => '?').join(',')
    const sites = await db.prepare(`
      SELECT id, organization_id, theme_id, name, brand_name, slug, subdomain,
             custom_domain, status, plan, created_at, updated_at,
             onboarding_status
      FROM sites 
      WHERE organization_id IN (${placeholders})
      ORDER BY created_at DESC
    `).bind(...orgIds).all()
    
    return jsonResponse({
      sites: sites.results || []
    })
    
  } catch (error) {
    console.error('Failed to fetch sites:', error)
    return jsonResponse({ 
      error: 'Failed to fetch sites' 
    }, { status: 500 })
  }
})
