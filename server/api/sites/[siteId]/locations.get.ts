// Get business locations for a site
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
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

    // Get business locations
    const locations = await db.prepare(`
      SELECT id, slug, title, address, city, phone, image_url, website_url, maps_url, latitude, longitude,
             opening_hours, rating, review_count, is_primary, status, last_synced_at,
             google_location_id, google_connection_id
      FROM business_locations 
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, title ASC
    `).bind(site.organization_id, siteId).all()
    
    // Parse JSON fields
    const parsedLocations = (locations.results || []).map((location: any) => ({
      ...location,
      address: location.address ? JSON.parse(location.address) : null,
      opening_hours: location.opening_hours ? JSON.parse(location.opening_hours) : null
    }))
    
    return jsonResponse({
      success: true,
      locations: parsedLocations,
      count: parsedLocations.length
    })
    
  } catch (error) {
    console.error('Failed to get business locations:', error)
    return jsonResponse({ 
      error: 'Failed to get business locations' 
    }, { status: 500 })
  }
})
