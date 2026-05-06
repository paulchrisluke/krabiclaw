// Get sites for authenticated user's organizations
import { cloudflareEnv, jsonResponse } from '../utils/api-response'

export default eventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  // Get authenticated user from Better Auth session
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
  
  const userId = session.user.id
  
  try {
    // Get user's organizations
    const organizations = await db.prepare(`
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
    `).bind(userId).all()
    
    if (!organizations.results || organizations.results.length === 0) {
      return jsonResponse({
        sites: []
      })
    }
    
    const orgIds = organizations.results.map((org: any) => org.id)
    
    // Build WHERE clause for multiple organization IDs
    const placeholders = orgIds.map(() => '?').join(',')
    const sites = await db.prepare(`
      SELECT id, organization_id, theme_id, name, slug, subdomain, 
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
