// Get business locations for a site
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }
  
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

  try {
    // Verify user has access to the site
    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    // Get business locations
    const locations = await queryAll<ApiValue>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.city, bl.phone, bl.notification_phone,
             bl.website_url, bl.maps_url, bl.latitude, bl.longitude,
             bl.opening_hours, bl.description, bl.short_description, bl.email, bl.price_level,
             bl.facebook_url, bl.instagram_url, bl.tiktok_url, bl.google_place_id,
             bl.grab_url, bl.uber_eats_url, bl.foodpanda_url,
             bl.rating, bl.review_count, bl.is_primary, bl.status,
             bl.last_synced_at, bl.google_location_id, bl.google_connection_id,
             bl.hero_image_asset_id, bl.hero_video_asset_id, ma.public_url, ma.kind
      FROM business_locations bl
      LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
      ORDER BY bl.is_primary DESC, bl.title ASC
    `, [site.organization_id, siteId])

    // Parse JSON fields
    const parsedLocations = (locations || []).map((location: ApiValue) => ({
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
