// Onboarding site setup — web equivalent of the MCP create_site + create_location flow.
// Uses the same underlying functions: runSiteCreation, updateLocation, getPlaceDetails.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetails } from '~/server/utils/google-places'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import { updateLocation } from '~/server/utils/location-management'

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

  const body = await readBody(event) as { placeId?: unknown; vertical?: unknown }
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  if (!placeId) return jsonResponse({ error: 'placeId is required' }, { status: 400 })

  const vertical = typeof body?.vertical === 'string' && VALID_VERTICALS.includes(body.vertical as never)
    ? (body.vertical as 'restaurant' | 'experience')
    : 'restaurant'

  const place = await getPlaceDetails(apiKey, placeId, false).catch(() => null)
  if (!place) return jsonResponse({ error: 'Could not fetch place details. Try again.' }, { status: 502 })

  // Resolve or create the site — mirrors MCP create_site using runSiteCreation
  const dashboard = await getDashboardContext(event, { requireRestaurant: false })

  let siteId: string
  let organizationId: string

  if (!dashboard?.restaurant) {
    const baseSubdomain = slugify(place.name).slice(0, 40)
    let result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
      name: place.name,
      subdomain: baseSubdomain,
      vertical,
    })
    if (result.status === 409) {
      // Subdomain taken — retry with random suffix
      const fallback = `${slugify(place.name).slice(0, 32)}-${Math.random().toString(36).slice(2, 6)}`
      result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
        name: place.name,
        subdomain: fallback,
        vertical,
      })
    }
    if (result.status !== 200) {
      return jsonResponse({ error: 'Could not create site. Please try again.' }, { status: 500 })
    }
    siteId = result.data.siteId as string
    organizationId = result.data.organizationId as string
  } else {
    siteId = dashboard.restaurant.id
    organizationId = dashboard.restaurant.organization_id
  }

  // Find the primary location — same approach as hydrateSeededLocationForOnboarding
  const locationRow = await db.prepare(`
    SELECT id FROM business_locations
    WHERE site_id = ? AND organization_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  `).bind(siteId, organizationId).first<{ id: string }>()

  if (locationRow?.id) {
    // Update with place data via the same updateLocation path the MCP uses
    await updateLocation(db, organizationId, siteId, locationRow.id, {
      title: place.name,
      slug: slugify(place.name),
      phone: place.phone ?? undefined,
      city: place.city ?? undefined,
      maps_url: place.mapsUrl ?? undefined,
      google_place_id: placeId,
      website_url: place.websiteUrl ?? undefined,
      opening_hours: place.openingHours ?? undefined,
      rating: place.rating ?? undefined,
      review_count: place.ratingCount ?? undefined,
      status: 'active',
    }, session.user.id)

    // Upsert reviews — INSERT OR IGNORE so MCP edits are never overwritten
    const now = new Date().toISOString()
    for (const review of place.reviews) {
      if (!review.reviewId || !review.rating) continue
      await db.prepare(`
        INSERT OR IGNORE INTO reviews
          (id, organization_id, site_id, location_id, google_review_id,
           author_name, reviewer_photo_url, rating, content,
           status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'google_places', ?, ?)
      `).bind(
        `gplaces-${review.reviewId.replace(/\//g, '-')}`,
        organizationId, siteId, locationRow.id,
        review.reviewId,
        review.authorName,
        review.authorPhotoUrl,
        review.rating,
        review.text,
        review.publishedAt ?? now, now,
      ).run().catch(() => {})
    }
  }

  // Return org slug so the frontend can redirect if a new site was created
  const orgRow = await db.prepare(`SELECT slug FROM organization WHERE id = ? LIMIT 1`)
    .bind(organizationId).first<{ slug: string }>()

  // Mark onboarding as completed for the newly created site
  await db.prepare(`
    UPDATE sites
    SET onboarding_status = 'completed', updated_at = ?
    WHERE id = ?
  `).bind(new Date().toISOString(), siteId).run()

  return jsonResponse({ success: true, placeName: place.name, orgSlug: orgRow?.slug ?? null })
})
