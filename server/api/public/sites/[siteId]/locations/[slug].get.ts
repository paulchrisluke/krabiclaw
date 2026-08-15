// Get public business location by slug
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  const runtimeConfig = useRuntimeConfig()
  const DEFAULT_CURRENCY = runtimeConfig.defaultCurrency
  
  if (!siteId || !slug) {
    return jsonResponse({ 
      error: 'Site ID and slug are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.db
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site and verify it's active
    const site = await queryFirst<{ id: string; organization_id: string; status: string; default_currency: string | null }>(
      db,
      `
      SELECT id, organization_id, status, default_currency FROM sites 
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `,
      [siteId],
    )
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or inactive' 
      }, { status: 404 })
    }

    // Get location by slug for this site (email excluded from public API)
    const location = await queryFirst<ApiRecord>(
      db,
      `
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.website_url, bl.maps_url,
             bl.latitude, bl.longitude, bl.opening_hours, bl.rating, bl.review_count,
             bl.is_primary, bl.status, bl.last_synced_at, bl.google_place_id, bl.city,
             bl.hero_media_asset_id,
             ma.public_url AS hero_public_url, ma.kind AS hero_kind, ma.thumbnail_url
      FROM business_locations bl
      LEFT JOIN media_assets ma ON bl.hero_media_asset_id = ma.id AND ma.status = 'active'
        AND ma.organization_id = bl.organization_id AND ma.site_id = bl.site_id
      WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.slug = ? AND bl.status = 'active'
      LIMIT 1
    `,
      [site.organization_id, siteId, slug],
    )

    if (!location) {
      return jsonResponse({
        error: 'Location not found'
      }, { status: 404 })
    }

    // Counts for sub-nav badges
    const photoCount = await queryFirst<{ n: number }>(
      db,
      `SELECT COUNT(*) as n FROM media_assets WHERE location_id = ? AND status = 'active'`,
      [location.id],
    )

    const qaCount = await queryFirst<{ n: number }>(
      db,
      `SELECT COUNT(*) as n FROM location_qa WHERE location_id = ? AND status = 'published'`,
      [location.id],
    )

    // Derive the Google review-writing URL from the Places ID when available.
    const placeId = location.google_place_id
    const google_review_url = placeId
      ? `https://search.google.com/local/writereview?placeid=${placeId}`
      : null


    // Parse JSON fields and return public-safe data (email excluded)
    const public_url = (location.hero_public_url || null) as string | null
    const kind = public_url ? (location.hero_kind as string | null) : null

    const parsedLocation = {
      id: location.id,
      slug: location.slug,
      title: location.title,
      address: location.address ? JSON.parse(location.address) : null,
      phone: location.phone,
      website_url: location.website_url,
      maps_url: location.maps_url,
      map_embed_url: calculateMapEmbedUrl({
        title: location.title,
        maps_url: location.maps_url,
        latitude: location.latitude as number | null,
        longitude: location.longitude as number | null,
        address: location.address as string | null,
        city: location.city as string | null
      }),
      latitude: location.latitude,
      longitude: location.longitude,
      opening_hours: location.opening_hours ? JSON.parse(location.opening_hours) : null,
      rating: location.rating,
      review_count: location.review_count,
      photo_count: photoCount?.n ?? 0,
      qa_count: qaCount?.n ?? 0,
      is_primary: location.is_primary,
      status: location.status,
      public_url,
      kind,
      hero_public_url: public_url,
      thumbnail_url: location.thumbnail_url ?? null,
      city: location.city,
      currency: site.default_currency || DEFAULT_CURRENCY,
      google_place_id: location.google_place_id,
      google_review_url
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
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
