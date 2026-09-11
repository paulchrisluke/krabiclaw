import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
// POST /api/dashboard/locations/add
// Add a new physical location to the current org's site from a Google Maps URL.
// Requires an existing site — this is the multi-location flow, not onboarding.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetailsByUrl, getPlaceDetails, searchPlaces, googleReviewUpserts, PlaceDetailsError } from '~/server/utils/google-places'
import { createLocation } from '~/server/utils/location-management'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { executeBatch, queryFirst, type DbClient } from '~/server/db'
import { parsePhone } from '~/utils/phone'
import { assertSiteWideAccess } from '~/server/utils/member-access'

type SetupEnv = Parameters<typeof createLocation>[0]

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'location'
}

// Normalize to canonical E.164 at this write boundary (issue #293 Section D), // mirroring server/api/dashboard/locations/[id].patch.ts — this create path
// previously stored the raw trimmed input, which silently broke the E.164
function normalizeNotificationPhone(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Phone number must be a string' }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  // No default country: the wizard sends E.164 for the country the owner picked,
  // so a number that only parses with an assumed country is a number we would
  // be guessing a country for.
  const parsed = parsePhone(trimmed)
  if (!parsed.valid || !parsed.e164) {
    return { ok: false, error: 'The notification phone number must include its country code, for example +66 81 234 5678.' }
  }
  return { ok: true, value: parsed.e164 }
}

async function uniqueLocationSlug(db: DbClient, siteId: string, base: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await queryFirst<{ id: string }>(
      db, 'SELECT id FROM business_locations WHERE site_id = ? AND slug = ? LIMIT 1', [siteId, slug], )
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

export default defineHandler(async (event) => {
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
  await assertSiteWideAccess(db, {
    env,
    memberId: organization.memberId, role: organization.role, organizationId, siteId, })

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
    const notificationPhone = normalizeNotificationPhone(details?.notificationPhone)
    if (!notificationPhone.ok) {
      return jsonResponse({ error: notificationPhone.error }, { status: 400 })
    }

    const baseSlug = slugify(name).slice(0, 50)
    const slug = await uniqueLocationSlug(db, siteId, baseSlug)

    const result = await createLocation(
      env as SetupEnv, db, organizationId, siteId, {
        title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : name, slug, city: typeof details?.city === 'string' && details.city.trim() ? details.city.trim() : null, address: typeof details?.address === 'string' && details.address.trim() ? details.address.trim() : null, phone: typeof details?.phone === 'string' && details.phone.trim() ? details.phone.trim() : null, website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim() ? details.websiteUrl.trim() : null, opening_hours: parseOpeningHours(details?.openingHours ?? null), special_hours: parseSpecialHours(details?.specialHours ?? null), notification_phone: notificationPhone.value, timezone: typeof details?.timezone === 'string' && details.timezone.trim() ? details.timezone.trim() : null, }, session.user.id, )

    if (result.status !== 200 && result.status !== 201) {
      return jsonResponse({ error: (result.data as { error?: string }).error ?? 'Could not add location.' }, { status: result.status })
    }
    await purgePublicResourceCacheSafe(env, siteId)

    return jsonResponse({ success: true, locationSlug: slug, orgSlug: organization.slug })
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })

  let place
  try {
    if (placeId) {
      place = await getPlaceDetails(apiKey, placeId)
    } else if (mapsUrl) {
      place = await getPlaceDetailsByUrl(apiKey, mapsUrl)
    } else {
      const results = await searchPlaces(apiKey, query)
      const top = results[0]
      if (!top?.placeId) {
        return jsonResponse({ error: `No results found for "${query}". Try a more specific name.` }, { status: 404 })
      }
      place = await getPlaceDetails(apiKey, top.placeId)
    }
  } catch (err) {
    const statusCode = err instanceof PlaceDetailsError ? err.statusCode : 502
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Could not fetch place details. Try again.', }, { status: statusCode })
  }

  if (previewOnly) {
    return jsonResponse({
      success: true, preview: {
        placeId: place.placeId, name: place.name, address: place.formattedAddress, city: place.city, phone: place.phone, mapsUrl: place.mapsUrl, websiteUrl: place.websiteUrl, rating: place.rating, ratingCount: place.ratingCount, openingHours: place.openingHours, timezone: place.timezone, }, })
  }

  const notificationPhone = normalizeNotificationPhone(details?.notificationPhone)
  if (!notificationPhone.ok) {
    return jsonResponse({ error: notificationPhone.error }, { status: 400 })
  }

  const baseSlug = slugify(place.name).slice(0, 50)
  const slug = await uniqueLocationSlug(db, siteId, baseSlug)

  const result = await createLocation(
    env as SetupEnv, db, organizationId, siteId, {
      title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : place.name, slug, phone: typeof details?.phone === 'string' && details.phone.trim()
        ? details.phone.trim()
        : place.phone ?? null, city: typeof details?.city === 'string' && details.city.trim()
        ? details.city.trim()
        : place.city ?? null, maps_url: place.mapsUrl ?? null, google_place_id: place.placeId, website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim()
        ? details.websiteUrl.trim()
        : place.websiteUrl ?? null, address: typeof details?.address === 'string' && details.address.trim()
        ? details.address.trim()
        : null, opening_hours: parseOpeningHours(details && 'openingHours' in details ? details.openingHours : place.openingHours), special_hours: parseSpecialHours(details?.specialHours ?? null), rating: place.rating ?? null, review_count: place.ratingCount ?? null, notification_phone: notificationPhone.value, timezone: typeof details?.timezone === 'string' && details.timezone.trim()
        ? details.timezone.trim()
        : place.timezone, }, session.user.id, )

  if (result.status !== 200 && result.status !== 201) {
    return jsonResponse({ error: (result.data as { error?: string }).error ?? 'Could not add location.' }, { status: result.status })
  }
  // Upsert reviews for the new location
  const locationId = (result.data as { location?: { id: string } }).location?.id
  if (locationId) {
    const now = new Date().toISOString()
    await executeBatch(db, googleReviewUpserts({ organizationId, siteId, locationId }, place.reviews, now))
  }
  await purgePublicResourceCacheSafe(env, siteId)

  return jsonResponse({
    success: true, siteId, locationSlug: slug, orgSlug: organization.slug, })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
