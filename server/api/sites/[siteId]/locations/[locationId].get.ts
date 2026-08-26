// Get a business location for a site
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { requireLocationAccess } from '~/server/utils/location-access'
import { getMediaPlacements } from '~/server/utils/media-placement'

interface LocationRow {
  id: string
  slug: string
  title: string
  address: string | null
  city: string | null
  phone: string | null
  website_url: string | null
  maps_url: string | null
  latitude: number | null
  longitude: number | null
  opening_hours: string | null
  categories: string | null
  description: string | null
  short_description: string | null
  email: string | null
  price_level: string | null
  facebook_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
  google_place_id: string | null
  rating: number | null
  review_count: number | null
  is_primary: number | boolean
  status: string
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)

    const location = await queryFirst<LocationRow>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.address, bl.city, bl.phone, bl.website_url, bl.maps_url, bl.latitude, bl.longitude, bl.opening_hours, bl.categories, bl.description, bl.short_description, bl.email, bl.price_level, bl.facebook_url, bl.instagram_url, bl.tiktok_url, bl.google_place_id, bl.rating, bl.review_count, bl.is_primary, bl.status, bl.last_synced_at, bl.created_at, bl.updated_at
      FROM business_locations bl
      WHERE bl.id = ? AND bl.organization_id = ? AND bl.site_id = ?
      LIMIT 1
    `, [locationId, site.organization_id, siteId])

    if (!location) {
      return jsonResponse({ error: 'Location not found' }, { status: 404 })
    }

    const placements = await getMediaPlacements(db, { siteId, ownerType: 'business_location', ownerIds: [location.id] })
    return jsonResponse({
      success: true, location: {
        ...location, address: location.address ? JSON.parse(location.address) : null, opening_hours: location.opening_hours ? JSON.parse(location.opening_hours) : null, categories: location.categories ? JSON.parse(location.categories) : null, is_primary: Boolean(location.is_primary), media: placements.get(location.id) ?? []
      }
    })
  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get business location:', error)
    return jsonResponse({ error: 'Failed to get business location' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
