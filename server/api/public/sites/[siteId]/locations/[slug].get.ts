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
      SELECT id, slug, title, address, phone, website_url, maps_url, latitude, longitude,
             opening_hours, rating, review_count, is_primary, status, last_synced_at,
             google_place_id, image_url, city
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND slug = ? AND status = 'active'
      LIMIT 1
    `).bind(site.organization_id, siteId, slug).first()

    if (!location) {
      return jsonResponse({
        error: 'Location not found'
      }, { status: 404 })
    }

    // Counts for sub-nav badges
    const photoCount = await db.prepare(
      `SELECT COUNT(*) as n FROM location_photos WHERE location_id = ?`
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
      photo_count: (photoCount as any)?.n ?? 0,
      qa_count: (qaCount as any)?.n ?? 0,
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
