// Get public business locations for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { calculateMapEmbedUrl } from '~/server/utils/google-business'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

interface SiteRow {
  id: string
  organization_id: string
  status: 'active'
}

interface LocationRow {
  id: string
  slug: string
  title: string
  address: string | null
  phone: string | null
  website_url: string | null
  maps_url: string | null
  latitude: number | null
  longitude: number | null
  opening_hours: string | null
  rating: number | null
  review_count: number | null
  is_primary: number | boolean
  status: string
  last_synced_at: string | null
  google_location_id: string | null
  google_connection_id: string | null
  city: string | null
  neighborhood: string | null
  public_url: string | null
  kind: string | null
  grab_url: string | null
  uber_eats_url: string | null
  foodpanda_url: string | null
}

const parseJson = (raw: string | null): JsonValue => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    return null
  }
}

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

  try {
    // Get site and verify it's active
    const site = await db.prepare(`
      SELECT id, organization_id, status FROM sites 
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `).bind(siteId).first() as SiteRow | null
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or inactive' 
      }, { status: 404 })
    }

    // Get active business locations for this site
    const locations = await db.prepare(`
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.website_url, bl.maps_url,
             bl.latitude, bl.longitude, bl.opening_hours, bl.rating, bl.review_count,
             bl.is_primary, bl.status, bl.last_synced_at, bl.google_location_id,
             bl.google_connection_id, bl.city, bl.neighborhood, bl.grab_url, bl.uber_eats_url, bl.foodpanda_url,
             bl.hero_image_asset_id, bl.hero_video_asset_id,
             ma_img.public_url AS hero_image_public_url, ma_img.kind AS hero_image_kind,
             ma_vid.public_url AS hero_video_public_url, ma_vid.kind AS hero_video_kind
      FROM business_locations bl
      LEFT JOIN media_assets ma_img ON bl.hero_image_asset_id = ma_img.id AND ma_img.status = 'active'
      LEFT JOIN media_assets ma_vid ON bl.hero_video_asset_id = ma_vid.id AND ma_vid.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
      ORDER BY bl.is_primary DESC, bl.title ASC
    `).bind(site.organization_id, siteId).all()
    const locationRows = (locations.results || []) as unknown as (LocationRow & { 
      hero_image_public_url: string | null; 
      hero_image_kind: string | null;
      hero_video_public_url: string | null;
      hero_video_kind: string | null;
    })[]
    

    // Parse JSON fields and return public-safe data
    const parsedLocations = locationRows.map((location) => {
      const public_url = (location.hero_video_public_url || location.hero_image_public_url || null) as string | null
      const kind = public_url ? (location.hero_video_public_url ? 'video' : 'image') : null
      return {
        id: location.id,
        slug: location.slug,
        title: location.title,
        address: parseJson(location.address),
        phone: location.phone,
        website_url: location.website_url,
        maps_url: location.maps_url,
        map_embed_url: calculateMapEmbedUrl({
          title: location.title,
          maps_url: location.maps_url,
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          city: location.city
        }),
        latitude: location.latitude,
        longitude: location.longitude,
        opening_hours: parseJson(location.opening_hours),
        rating: location.rating,
        review_count: location.review_count,
        is_primary: Boolean(location.is_primary),
        status: location.status,
        public_url,
        kind,
        hero_image_public_url: location.hero_image_public_url,
        hero_video_public_url: location.hero_video_public_url,
        city: location.city,
        neighborhood: location.neighborhood || null,
        grab_url: location.grab_url || null,
        uber_eats_url: location.uber_eats_url || null,
        foodpanda_url: location.foodpanda_url || null
      }
    })
    
    return jsonResponse({
      success: true,
      locations: parsedLocations,
      count: parsedLocations.length
    })
    
  } catch (error) {
    console.error('Failed to get public business locations:', error)
    return jsonResponse({ 
      error: 'Failed to get business locations' 
    }, { status: 500 })
  }
})
