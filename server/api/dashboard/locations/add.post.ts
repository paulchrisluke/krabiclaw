// POST /api/dashboard/locations/add
// Add a new physical location to the current org's site from a Google Maps URL.
// Requires an existing site — this is the multi-location flow, not onboarding.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetailsByUrl, getPlaceDetails, searchPlaces } from '~/server/utils/google-places'
import { createLocation } from '~/server/utils/location-management'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { execute, queryFirst, type DbClient } from '~/server/db'

type SetupEnv = Parameters<typeof createLocation>[0]

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'location'
}

async function uniqueLocationSlug(db: DbClient, siteId: string, base: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await queryFirst<{ id: string }>(
      db, 'SELECT id FROM business_locations WHERE site_id = ? AND slug = ? LIMIT 1', [siteId, slug],
    )
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const dashboard = await getDashboardContext(event, { requireSite: true })
  if (!dashboard?.site) {
    return jsonResponse({ error: 'No site found. Complete onboarding first.' }, { status: 400 })
  }

  const { site, organization } = dashboard
  const siteId = site.id as string
  const organizationId = organization?.id as string

  const body = await readBody(event) as {
    mapsUrl?: unknown
    placeId?: unknown
    query?: unknown
    previewOnly?: unknown
    name?: unknown
    details?: Record<string, unknown> | null
  }
  const mapsUrl = typeof body?.mapsUrl === 'string' ? body.mapsUrl.trim() : ''
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const previewOnly = body?.previewOnly === true
  const details = body.details && typeof body.details === 'object' ? body.details : null

  if (!mapsUrl && !placeId && !query && !name) {
    return jsonResponse({ error: 'mapsUrl, placeId, query, or name is required' }, { status: 400 })
  }

  // Manual path: business name only, no Google Places lookup required.
  if (name && !mapsUrl && !placeId && !query) {
    const baseSlug = slugify(name).slice(0, 50)
    const slug = await uniqueLocationSlug(db, siteId, baseSlug)

    const result = await createLocation(
      env as SetupEnv,
      db,
      organizationId,
      siteId,
      {
        title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : name,
        slug,
        city: typeof details?.city === 'string' && details.city.trim() ? details.city.trim() : null,
        address: typeof details?.address === 'string' && details.address.trim() ? details.address.trim() : null,
        phone: typeof details?.phone === 'string' && details.phone.trim() ? details.phone.trim() : null,
        website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim() ? details.websiteUrl.trim() : null,
        opening_hours: typeof details?.openingHours === 'string' && details.openingHours.trim() ? details.openingHours.trim() : null,
        notification_phone: typeof details?.notificationPhone === 'string' && details.notificationPhone.trim() ? details.notificationPhone.trim() : null,
        timezone: typeof details?.timezone === 'string' && details.timezone.trim() ? details.timezone.trim() : null,
        is_primary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : false,
      },
      session.user.id,
    )

    if (result.status !== 200 && result.status !== 201) {
      return jsonResponse({ error: (result.data as { error?: string }).error ?? 'Could not add location.' }, { status: result.status })
    }
    await purgeBootstrapCacheSafe(env, siteId)

    const orgRow = await queryFirst<{ slug: string }>(db, 'SELECT slug FROM organization WHERE id = ? LIMIT 1', [organizationId])

    if (!orgRow) {
      return jsonResponse({ error: 'Organization not found' }, { status: 404 })
    }

    return jsonResponse({ success: true, locationSlug: slug, orgSlug: orgRow.slug })
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })

  let place
  try {
    if (placeId) {
      place = await getPlaceDetails(apiKey, placeId, false)
    } else if (mapsUrl) {
      place = await getPlaceDetailsByUrl(apiKey, mapsUrl, false)
    } else {
      const results = await searchPlaces(apiKey, query)
      const top = results[0]
      if (!top?.placeId) {
        return jsonResponse({ error: `No results found for "${query}". Try a more specific name.` }, { status: 404 })
      }
      place = await getPlaceDetails(apiKey, top.placeId, false)
    }
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Could not fetch place details. Try again.',
    }, { status: 502 })
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
      },
    })
  }

  const baseSlug = slugify(place.name).slice(0, 50)
  const slug = await uniqueLocationSlug(db, siteId, baseSlug)

  const result = await createLocation(
    env as SetupEnv,
    db,
    organizationId,
    siteId,
    {
      title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : place.name,
      slug,
      phone: typeof details?.phone === 'string' && details.phone.trim()
        ? details.phone.trim()
        : place.phone ?? null,
      city: typeof details?.city === 'string' && details.city.trim()
        ? details.city.trim()
        : place.city ?? null,
      maps_url: place.mapsUrl ?? null,
      google_place_id: place.placeId,
      website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim()
        ? details.websiteUrl.trim()
        : place.websiteUrl ?? null,
      address: typeof details?.address === 'string' && details.address.trim()
        ? details.address.trim()
        : null,
      opening_hours: typeof details?.openingHours === 'string' && details.openingHours.trim()
        ? details.openingHours.trim()
        : place.openingHours ?? null,
      rating: place.rating ?? null,
      review_count: place.ratingCount ?? null,
      notification_phone: typeof details?.notificationPhone === 'string' && details.notificationPhone.trim()
        ? details.notificationPhone.trim()
        : null,
      timezone: typeof details?.timezone === 'string' && details.timezone.trim()
        ? details.timezone.trim()
        : null,
      is_primary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : false,
    },
    session.user.id,
  )

  if (result.status !== 200 && result.status !== 201) {
    return jsonResponse({ error: (result.data as { error?: string }).error ?? 'Could not add location.' }, { status: result.status })
  }
  // Upsert reviews for the new location
  const locationId = (result.data as { location?: { id: string } }).location?.id
  if (locationId) {
    const now = new Date().toISOString()
    for (const review of place.reviews ?? []) {
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
          organizationId, siteId, locationId,
          review.reviewId, review.authorName, review.authorPhotoUrl,
          review.rating, review.text,
          review.publishedAt ?? now, now,
        ])
      } catch { /* non-fatal */ }
    }
  }
  await purgeBootstrapCacheSafe(env, siteId)

  // Get org slug for navigation
  const orgRow = await queryFirst<{ slug: string }>(db, 'SELECT slug FROM organization WHERE id = ? LIMIT 1', [organizationId])

  if (!orgRow) {
    return jsonResponse({ error: 'Organization not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    siteId,
    locationSlug: slug,
    orgSlug: orgRow.slug,
  })
})
