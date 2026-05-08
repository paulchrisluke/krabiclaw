// Get a business location for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

const parseJson = (value: unknown) => {
  if (!value || typeof value !== 'string') return null
  return JSON.parse(value)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await db.prepare(`
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const location = await db.prepare(`
      SELECT id, slug, title, address, city, phone, image_url, website_url,
             maps_url, latitude, longitude, opening_hours, categories, rating,
             review_count, is_primary, status, last_synced_at, google_location_id,
             google_connection_id, created_at, updated_at
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first<any>()

    if (!location) {
      return jsonResponse({ error: 'Location not found' }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      location: {
        ...location,
        address: parseJson(location.address),
        opening_hours: parseJson(location.opening_hours),
        categories: parseJson(location.categories),
        is_primary: Boolean(location.is_primary)
      }
    })
  } catch (error) {
    console.error('Failed to get business location:', error)
    return jsonResponse({ error: 'Failed to get business location' }, { status: 500 })
  }
})
