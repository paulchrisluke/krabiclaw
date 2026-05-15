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
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.city, bl.phone,
             bl.website_url, bl.maps_url, bl.latitude, bl.longitude,
             bl.opening_hours, bl.description, bl.short_description, bl.email, bl.price_level,
             bl.facebook_url, bl.instagram_url, bl.tiktok_url, bl.google_place_id,
             bl.rating, bl.review_count, bl.is_primary, bl.status,
             bl.last_synced_at, bl.google_location_id, bl.google_connection_id,
             bl.hero_image_asset_id, bl.hero_video_asset_id, ma.public_url as image_url
      FROM business_locations bl
      LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
      ORDER BY bl.is_primary DESC, bl.title ASC
    `).bind(site.organization_id, siteId).all()
    
    // Parse JSON fields
    const parsedLocations = (locations.results || []).map((location: ApiValue) => ({
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
