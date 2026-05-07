// Get editor context: organization, site, locations, active scope
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

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
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.name, s.subdomain, s.organization_id, s.status, s.onboarding_status,
             o.name as organization_name
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get active locations
    const locations = await db.prepare(`
      SELECT id, slug, title, is_primary, status
      FROM business_locations 
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, title ASC
    `).bind(siteId).all()
    
    // Parse locations
    const parsedLocations = (locations.results || []).map((location: any) => ({
      ...location,
      is_primary: Boolean(location.is_primary)
    }))

    const entitlementsResult = await db.prepare(`
      SELECT key, value
      FROM organization_entitlements
      WHERE organization_id = ?
    `).bind(site.organization_id).all()

    const entitlements = (entitlementsResult.results || []).reduce((acc: Record<string, string | boolean>, row: any) => {
      acc[row.key] = row.value === 'true' ? true : row.value === 'false' ? false : row.value
      return acc
    }, {})

    // Get content registry for this site/theme
    const { contentRegistry } = await import('../../../../../config/content-registry')

    // Build scopes array
    const scopes = [
      {
        id: null,
        label: "Brand-wide",
        type: "brand"
      },
      ...parsedLocations.map((location: any) => ({
        id: location.id,
        label: location.title,
        type: "location"
      }))
    ]

    return jsonResponse({
      success: true,
      context: {
        site: {
          id: site.id,
          name: site.name,
          subdomain: site.subdomain,
          status: site.status,
          onboarding_status: site.onboarding_status
        },
        organization: {
          id: site.organization_id,
          name: site.organization_name,
          entitlements
        },
        locations: parsedLocations,
        scopes,
        contentRegistry
      }
    })
    
  } catch (error) {
    console.error('Failed to get editor context:', error)
    return jsonResponse({ 
      error: 'Failed to get editor context' 
    }, { status: 500 })
  }
})
