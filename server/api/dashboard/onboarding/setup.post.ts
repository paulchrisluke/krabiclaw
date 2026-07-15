// Onboarding site setup — web equivalent of the MCP create_site + create_location flow.
// Uses the same underlying functions: runSiteCreation, updateLocation, getPlaceDetailsByUrl.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetailsByUrl, getPlaceDetails, PlaceDetailsError } from '~/server/utils/google-places'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import { updateLocation } from '~/server/utils/location-management'
import { setConfig } from '~/server/utils/site-config'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { execute, queryFirst } from '~/server/db'
import type { SiteVertical } from '~/utils/vertical-copy'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })

  const body = await readBody(event) as {
    mapsUrl?: unknown
    placeId?: unknown
    vertical?: unknown
    previewOnly?: unknown
    details?: Record<string, unknown> | null
  }
  const mapsUrl = typeof body?.mapsUrl === 'string' ? body.mapsUrl.trim() : ''
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  if (!mapsUrl && !placeId) return jsonResponse({ error: 'mapsUrl or placeId is required' }, { status: 400 })
  const details = body.details && typeof body.details === 'object' ? body.details : null

  const previewOnly = body?.previewOnly === true

  // previewOnly requests happen before the user has chosen a vertical (it only
  // renders the Google Maps place preview card) — vertical becomes required
  // once we're actually about to create a site below.
  let vertical: SiteVertical = 'restaurant'
  if (!previewOnly) {
    if (typeof body?.vertical !== 'string' || !VALID_VERTICALS.includes(body.vertical as SiteVertical)) {
      return jsonResponse({
        error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`,
      }, { status: 400 })
    }
    vertical = body.vertical as SiteVertical
  }

  let place
  try {
    place = placeId
      ? await getPlaceDetails(apiKey, placeId)
      : await getPlaceDetailsByUrl(apiKey, mapsUrl)
  } catch (err) {
    const statusCode = err instanceof PlaceDetailsError ? err.statusCode : 502
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Could not fetch place details. Try again.',
    }, { status: statusCode })
  }

  if (previewOnly) {
    return jsonResponse({
      success: true,
      preview: {
        placeId: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        city: place.city,
        phone: place.phone,
        mapsUrl: place.mapsUrl,
        websiteUrl: place.websiteUrl,
        rating: place.rating,
        ratingCount: place.ratingCount,
        openingHours: place.openingHours,
        photos: place.photos.slice(0, 10),
      },
    })
  }

  // Resolve or create the site — mirrors MCP create_site using runSiteCreation
  const dashboard = await getDashboardContext(event, { requireSite: false })

  let siteId: string
  let organizationId: string
  let siteSubdomain: string | null = null

  if (!dashboard?.site) {
    const baseSubdomain = slugify(place.name).slice(0, 40)
    const result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
      name: place.name,
      subdomain: baseSubdomain,
      vertical,
    })
    if (result.status !== 200) {
      if (result.status === 409) {
        return jsonResponse({ error: 'A site with this name already exists. Please try a different business or contact support.' }, { status: 409 })
      }
      return jsonResponse({ error: (result.data.error as string) || 'Could not create site. Please try again.' }, { status: result.status || 500 })
    }
    siteId = result.data.siteId as string
    organizationId = result.data.organizationId as string
    siteSubdomain = result.data.subdomain as string
    // The Places lookup above happened before the org existed (preview-mode
    // calls have no org to charge yet); recover the cost now that it does.
    await chargeFlatCredits(db, organizationId, { siteId, action: 'google_places_details' }).catch(() => {})
  } else {
    return jsonResponse({ error: 'You already have a site. Onboarding is for new sites only.' }, { status: 400 })
  }

  const locationRow = await queryFirst<{ id: string; slug: string | null }>(db, `
    SELECT id, slug FROM business_locations
    WHERE site_id = ? AND organization_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  `, [siteId, organizationId])

  if (!locationRow?.id) {
    return jsonResponse({ error: 'No active location found for this site. Site creation may have failed.' }, { status: 500 })
  }

  await updateLocation(db, organizationId, siteId, locationRow.id, {
    title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : place.name,
    slug: slugify(place.name),
    phone: typeof details?.phone === 'string' && details.phone.trim()
      ? details.phone.trim()
      : place.phone ?? undefined,
    city: typeof details?.city === 'string' && details.city.trim()
      ? details.city.trim()
      : place.city ?? undefined,
    maps_url: place.mapsUrl ?? undefined,
    google_place_id: place.placeId,
    website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim()
      ? details.websiteUrl.trim()
      : place.websiteUrl ?? undefined,
    address: typeof details?.address === 'string' && details.address.trim()
      ? details.address.trim()
      : undefined,
    opening_hours: typeof details?.openingHours === 'string' && details.openingHours.trim()
      ? details.openingHours.trim()
      : place.openingHours ?? undefined,
    rating: place.rating ?? undefined,
    review_count: place.ratingCount ?? undefined,
    notification_phone: typeof details?.notificationPhone === 'string' && details.notificationPhone.trim()
      ? details.notificationPhone.trim()
      : undefined,
    timezone: typeof details?.timezone === 'string' && details.timezone.trim()
      ? details.timezone.trim()
      : undefined,
    is_primary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : undefined,
    status: 'active',
  }, session.user.id)

  if (place.photos && place.photos.length > 0) {
    const [heroImage, locationHeroImage] = place.photos
    if (heroImage?.photoUri) {
      await setConfig(db, organizationId, siteId, 'hero_image_url', heroImage.photoUri)
    }
    if (locationHeroImage?.photoUri) {
      await setConfig(db, organizationId, siteId, 'location_hero_image_url', locationHeroImage.photoUri)
    }
  }

  const now = new Date().toISOString()
  for (const review of place.reviews) {
    if (!review.reviewId || !review.rating) continue
    try {
      await execute(db, `
        INSERT OR IGNORE INTO reviews
          (id, organization_id, site_id, location_id, google_review_id,
           author_name, reviewer_photo_url, rating, content,
           status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'google_places', ?, ?)
      `, [
        `${siteId}-${review.reviewId.replace(/\//g, '-')}`,
        organizationId, siteId, locationRow.id,
        review.reviewId,
        review.authorName,
        review.authorPhotoUrl,
        review.rating,
        review.text,
        review.publishedAt ?? now, now,
      ])
    } catch (err) {
      console.error('Failed to upsert review:', err)
    }
  }

  const orgRow = await queryFirst<{ slug: string }>(db, `SELECT slug FROM organization WHERE id = ? LIMIT 1`, [organizationId])
  await purgeBootstrapCacheSafe(env, siteId)

  return jsonResponse({
    success: true,
    placeName: place.name,
    orgSlug: orgRow?.slug ?? null,
    siteId,
    siteSlug: siteSubdomain,
    locationSlug: locationRow.slug ?? null,
  })
})
