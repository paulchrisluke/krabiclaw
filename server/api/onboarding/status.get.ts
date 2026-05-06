// Get onboarding status for authenticated user
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { createAuth } from '../../utils/auth'
import { defineEventHandler, getHeaders } from 'h3'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }
  
  // Get authenticated user from Better Auth session using server-side API
  const auth = createAuth(cloudflareEnv(event))
  
  const session = await auth.api.getSession({
    headers: getHeaders(event)
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }
  
  const userId = session.user.id
  
  try {
    // Check if user has organization membership
    const membership = await db.prepare(`
      SELECT o.id, o.name as organizationName FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      LIMIT 1
    `).bind(userId).first()
    
    if (!membership) {
      return jsonResponse({
        needsOnboarding: true,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email
        },
        organization: null,
        sites: []
      })
    }
    
    // Get sites for this organization
    const sitesResult = await db.prepare(`
      SELECT id, name, subdomain, status, onboarding_status, created_at
      FROM sites 
      WHERE organization_id = ?
      ORDER BY created_at DESC
    `).bind(membership.id).all()
    
    const sites = sitesResult.results || []
    
    // Check if any site is active
    const activeSite = sites.find((site: any) => site.onboarding_status === 'active')
    
    return jsonResponse({
      needsOnboarding: !activeSite,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email
      },
      organization: {
        id: membership.id,
        name: membership.organizationName
      },
      sites: sites
    })
    
  } catch (error) {
    console.error('Failed to get onboarding status:', error)
    return jsonResponse({ 
      error: 'Failed to get onboarding status' 
    }, { status: 500 })
  }
})
