// Get public business location by slug
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  
  if (!siteId || !slug) {
    return jsonResponse({ 
      error: 'Site ID and slug are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site and verify it's active
    const site = await db.prepare(`
      SELECT id, organization_id, status FROM sites 
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `).bind(siteId).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or inactive' 
      }, { status: 404 })
    }

    // Get location by slug for this site (email excluded from public API)
    const location = await db.prepare(`
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.website_url, bl.maps_url,
             bl.latitude, bl.longitude, bl.opening_hours, bl.rating, bl.review_count,
             bl.is_primary, bl.status, bl.last_synced_at, bl.google_place_id, bl.city,
             bl.hero_image_asset_id, ma.public_url as image_url
      FROM business_locations bl
      LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.slug = ? AND bl.status = 'active'
      LIMIT 1
    `).bind(site.organization_id, siteId, slug).first<ApiRecord>()

    if (!location) {
      return jsonResponse({
        error: 'Location not found'
      }, { status: 404 })
    }

    // Counts for sub-nav badges
    const photoCount = await db.prepare(
      `SELECT COUNT(*) as n FROM media_assets WHERE location_id = ? AND status = 'active'`
    ).bind(location.id).first()

    const qaCount = await db.prepare(
      `SELECT COUNT(*) as n FROM location_qa WHERE location_id = ? AND status = 'published'`
    ).bind(location.id).first()

    // Derive GMB action URLs from place ID when available
    const placeId = location.google_place_id
    const gmb_review_url = placeId
      ? `https://search.google.com/local/writereview?placeid=${placeId}`
      : null
    const gmb_qa_url = placeId
      ? `https://search.google.com/local/questions?placeid=${placeId}`
      : null

    // Parse JSON fields and return public-safe data (email excluded)
    const parsedLocation = {
      id: location.id,
      slug: location.slug,
      title: location.title,
      address: location.address ? JSON.parse(location.address) : null,
      phone: location.phone,
      website_url: location.website_url,
      maps_url: location.maps_url,
      latitude: location.latitude,
      longitude: location.longitude,
      opening_hours: location.opening_hours ? JSON.parse(location.opening_hours) : null,
      rating: location.rating,
      review_count: location.review_count,
      photo_count: (photoCount as ApiValue)?.n ?? 0,
      qa_count: (qaCount as ApiValue)?.n ?? 0,
      is_primary: location.is_primary,
      status: location.status,
      image_url: location.image_url,
      city: location.city,
      google_place_id: location.google_place_id,
      gmb_review_url,
      gmb_qa_url
    }
    
    return jsonResponse({
      success: true,
      location: parsedLocation
    })
    
  } catch (error) {
    console.error('Failed to get public business location:', error)
    return jsonResponse({ 
      error: 'Failed to get business location' 
    }, { status: 500 })
  }
})
