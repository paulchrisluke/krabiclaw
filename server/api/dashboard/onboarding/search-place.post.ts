// POST /api/dashboard/onboarding/search-place
// Name or Facebook URL → search Google Places → return top result as a place preview.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { searchPlaces, getPlaceDetails } from '~/server/utils/google-places'

function extractFacebookPageName(url: string): string | null {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    // Verify hostname is exactly 'facebook.com' or a proper subdomain (e.g., www.facebook.com)
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null
    const parts = parsed.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (!parts.length) return null
    // Known intermediate path segments that are not the target page slug
    const intermediateSegments = new Set(['posts', 'photos', 'videos', 'events', 'reviews', 'about'])
    // Extract the page slug, skipping intermediate segments
    const slugIndex = parts.findIndex(p => !intermediateSegments.has(p.toLowerCase()))
    if (slugIndex === -1) return null
    return decodeURIComponent(parts[slugIndex]!).replace(/[-_.]/g, ' ').trim()
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Places API not configured' }, { status: 503 })

  const body = await readBody(event) as { query?: unknown }
  const rawQuery = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!rawQuery) return jsonResponse({ error: 'query is required' }, { status: 400 })

  const searchQuery = extractFacebookPageName(rawQuery) ?? rawQuery

  try {
    const results = await searchPlaces(apiKey, searchQuery)
    const top = results[0]
    if (!top?.placeId) {
      return jsonResponse({ error: `No results found for "${searchQuery}". Try a more specific name.` }, { status: 404 })
    }

    const details = await getPlaceDetails(apiKey, top.placeId, false)
    return jsonResponse({
      success: true,
      preview: {
        placeId: details.placeId,
        name: details.name,
        address: details.formattedAddress,
        city: details.city,
        phone: details.phone,
        mapsUrl: details.mapsUrl,
        websiteUrl: details.websiteUrl,
        rating: details.rating,
        ratingCount: details.ratingCount,
        openingHours: details.openingHours,
      },
    })
  } catch (err) {
    return jsonResponse({
      error: 'Could not find a matching business. Try a more specific name.',
      details: err instanceof Error ? err.message : undefined,
    }, { status: 502 })
  }
})
