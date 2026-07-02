import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { syncPlaceToLocation } from '../../../utils/google-places'
import { getDashboardSite } from '~/server/utils/dashboard-context'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as { siteId?: string; locationId?: string }
  const { locationId } = body
  if (!locationId) return jsonResponse({ error: 'locationId is required' }, { status: 400 })

  const { site } = body.siteId
    ? {
        site: await queryFirst<{ id: string; organization_id: string; plan: string }>(db, `
          SELECT s.id, s.organization_id, s.plan FROM sites s
          JOIN member om ON s.organization_id = om.organizationId
          WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
          LIMIT 1
        `, [body.siteId, session.user.id])
      }
    : await getDashboardSite(event)

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  if (!await hasSiteEntitlement(db, site.id, 'google_business')) {
    return jsonResponse({ error: 'Google Business sync requires a Growth plan or higher.' }, { status: 403 })
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 500 })

  const location = await queryFirst<{ id: string; google_place_id: string | null }>(db, `
    SELECT id, google_place_id FROM business_locations
    WHERE id = ? AND site_id = ? AND organization_id = ?
    LIMIT 1
  `, [locationId, site.id, site.organization_id])

  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })
  if (!location.google_place_id) {
    return jsonResponse({ error: 'No Google Place ID set on this location. Add one in Location Settings.' }, { status: 400 })
  }

  try {
    const { place, reviewsUpserted } = await syncPlaceToLocation(
      db,
      apiKey,
      site.organization_id,
      site.id,
      locationId,
      location.google_place_id
    )
    await purgeBootstrapCacheSafe(env, site.id)

    return jsonResponse({
      success: true,
      syncedAt: new Date().toISOString(),
      reviewsUpserted,
      place: {
        name: place.name,
        phone: place.phone,
        rating: place.rating,
        ratingCount: place.ratingCount,
        openingHours: place.openingHours,
        city: place.city,
      },
    })
  } catch (err) {
    console.error('Google Places sync failed:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 502 })
  }
})
