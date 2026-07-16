// POST /api/dashboard/onboarding/places-preview
// Single-purpose authenticated Google Places lookup for the new-site onboarding
// wizard's "confirm this is your business" card. Read-only: it never creates a
// site, org, or location, and it never charges ai_credits — the Places details
// charge for a new-site import happens once, at draft creation time
// (server/utils/onboarding-drafts.ts's from-place.post.ts caller), not here.
//
// This replaces the previewOnly branch that used to live inline in the now-removed
// server/api/dashboard/onboarding/setup.post.ts. That file also contained a
// direct site-creation branch, but the new-site UI (OnboardingWizard.vue) never
// reached it — new-site creation has always gone through
// drafts/from-place|manual -> drafts/[draftId]/commit. Splitting the still-live
// preview behavior into its own endpoint means there is no more direct-creation
// branch to accidentally reach or keep in sync with the draft flow.
//
// The add-location flow does NOT use this endpoint — it has its own
// previewOnly branch in POST /api/dashboard/locations/add, since that endpoint
// owns both the preview and the mutation for an existing site's locations.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPlaceDetailsByUrl, getPlaceDetails, PlaceDetailsError } from '~/server/utils/google-places'
import { incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })

  const body = await readBody(event) as { mapsUrl?: unknown; placeId?: unknown }
  const mapsUrl = typeof body?.mapsUrl === 'string' ? body.mapsUrl.trim() : ''
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  if (!mapsUrl && !placeId) return jsonResponse({ error: 'mapsUrl or placeId is required' }, { status: 400 })

  if (!import.meta.dev) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const rateLimitOk = await incrementHourlyRateLimit(
      db,
      `rate:places-preview:user:${session.user.id}:${hourWindow}`,
      20,
      3_600_000,
    )
    if (!rateLimitOk) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }
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
})
