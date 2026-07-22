// POST /api/dashboard/locations/add
// Add a new physical location to the current org's site from a Google Maps URL.
// Requires an existing site — this is the multi-location flow, not onboarding.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetailsByUrl, getPlaceDetails, searchPlaces } from '~/server/utils/google-places'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { createLocation, syncLocationWhatsAppAccess } from '~/server/utils/location-management'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { execute, queryFirst, type DbClient } from '~/server/db'
import { parsePhone } from '~/utils/phone'
import { assertSiteWideAccess } from '~/server/utils/member-access'

type SetupEnv = Parameters<typeof createLocation>[0]

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'location'
}

// Normalize to canonical E.164 at this write boundary (issue #293 Section D),
// mirroring server/api/dashboard/locations/[id].patch.ts — this create path
// previously stored the raw trimmed input, which silently broke the E.164
// comparisons ensureWhatsAppRecipientAccess/isAuthorizedWhatsAppRecipient rely on.
function normalizeNotificationPhone(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Phone number must be a string' }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const parsed = parsePhone(trimmed, { defaultCountry: 'TH' })
  if (!parsed.valid || !parsed.e164) {
    return { ok: false, error: 'Enter a valid notification phone number, including country code' }
  }
  return { ok: true, value: parsed.e164 }
}

// A new location has no previous notification_phone, so this is always a
// create-shaped call into the shared server/utils/location-management.ts
// sync boundary (issue #293 Sections A/D/G, CodeRabbit follow-up on PR #295)
// — provisioning access for the new number, with scope recalculation as a
// no-op since there's nothing to revoke yet.
async function provisionLocationWhatsAppAccess(
  env: SetupEnv,
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId: string; phone: string; inviterUserId: string },
): Promise<void> {
  await syncLocationWhatsAppAccess(env, db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    locationId: opts.locationId,
    previousPhone: null,
    newPhone: opts.phone,
    inviterUserId: opts.inviterUserId,
  })
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
  await assertSiteWideAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId,
    siteId,
  })

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
        notification_phone: notificationPhone.value,
        timezone: typeof details?.timezone === 'string' && details.timezone.trim() ? details.timezone.trim() : null,
        is_primary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : false,
      },
      session.user.id,
    )

    if (result.status !== 200 && result.status !== 201) {
      return jsonResponse({ error: (result.data as { error?: string }).error ?? 'Could not add location.' }, { status: result.status })
    }
    const createdLocationId = (result.data as { location?: { id: string } }).location?.id
    if (notificationPhone.value && createdLocationId) {
      await provisionLocationWhatsAppAccess(env as SetupEnv, db, {
        organizationId,
        siteId,
        locationId: createdLocationId,
        phone: notificationPhone.value,
        inviterUserId: session.user.id,
      })
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

  // Charging happens once per intended lookup/import operation, not once per
  // HTTP call to this endpoint. The wizard calls this same endpoint twice for
  // one add-location operation — once with previewOnly:true for the confirm
  // card, once without it to actually create the location — so the charge
  // must be deferred until the previewOnly check below confirms this is the
  // real (non-preview) call. Charging unconditionally here previously
  // double-charged every add-location-by-search/place flow.
  let place
  let chargeSearch = false
  try {
    if (placeId) {
      place = await getPlaceDetails(apiKey, placeId, false)
    } else if (mapsUrl) {
      place = await getPlaceDetailsByUrl(apiKey, mapsUrl, false)
    } else {
      const results = await searchPlaces(apiKey, query)
      chargeSearch = true
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

  const notificationPhone = normalizeNotificationPhone(details?.notificationPhone)
  if (!notificationPhone.ok) {
    return jsonResponse({ error: notificationPhone.error }, { status: 400 })
  }

  if (chargeSearch) {
    await chargeFlatCredits(db, organizationId, { siteId, action: 'google_places_search' }).catch(() => {})
  }
  await chargeFlatCredits(db, organizationId, { siteId, action: 'google_places_details' }).catch(() => {})

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
      notification_phone: notificationPhone.value,
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
  if (notificationPhone.value && locationId) {
    await provisionLocationWhatsAppAccess(env as SetupEnv, db, {
      organizationId,
      siteId,
      locationId,
      phone: notificationPhone.value,
      inviterUserId: session.user.id,
    })
  }
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
