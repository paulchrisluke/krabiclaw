import { jsonResponse } from '../../../utils/api-response'
import { syncPlaceToLocation } from '../../../utils/google-places'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { queryFirst } from '~/server/db'
import { requireRequestedLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as { siteId?: string; locationId?: string }
  const { locationId } = body
  if (!locationId) return jsonResponse({ error: 'locationId is required' }, { status: 400 })

  const { env, db, site } = await requireRequestedLocationAccess(event, locationId, body.siteId)

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
    await chargeFlatCredits(db, site.organization_id, { siteId: site.id, action: 'google_places_details' }).catch(() => {})
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
