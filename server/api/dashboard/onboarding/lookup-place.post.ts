import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPlaceDetails, searchPlaces } from '~/server/utils/google-places'

function extractPlaceId(url: string): string | null {
  const chijMatch = url.match(/!1s(ChIJ[^!&%]+)/)
  if (chijMatch?.[1]) {
    try { return decodeURIComponent(chijMatch[1]) } catch { return chijMatch[1] }
  }
  return null
}

function extractNameAndCoords(url: string): { name: string | null; lat: number | null; lng: number | null } {
  let name: string | null = null
  let lat: number | null = null
  let lng: number | null = null

  const pathMatch = url.match(/\/maps\/place\/([^/@]+)/)
  if (pathMatch?.[1]) {
    try { name = decodeURIComponent(pathMatch[1].replace(/\+/g, ' ')) } catch { name = pathMatch[1] }
  }

  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordMatch?.[1] && coordMatch?.[2]) {
    lat = parseFloat(coordMatch[1])
    lng = parseFloat(coordMatch[2])
  }

  return { name, lat, lng }
}

async function resolveUrl(url: string): Promise<string> {
  const allowedHosts = new Set(['maps.app.goo.gl', 'goo.gl'])

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.protocol !== 'https:') return url
  if (!allowedHosts.has(parsed.hostname)) return url

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(parsed.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    return res.url || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Places API not configured' }, { status: 503 })

  const body = await readBody(event) as { mapsUrl?: unknown }
  const rawUrl = typeof body?.mapsUrl === 'string' ? body.mapsUrl.trim() : ''
  if (!rawUrl) return jsonResponse({ error: 'mapsUrl is required' }, { status: 400 })

  const mapsUrl = await resolveUrl(rawUrl)

  let placeId = extractPlaceId(mapsUrl)

  if (!placeId) {
    const { name, lat, lng } = extractNameAndCoords(mapsUrl)
    if (!name) {
      return jsonResponse({
        error: 'Could not find a business in that URL. Copy the full Google Maps link from your browser address bar.'
      }, { status: 422 })
    }
    try {
      const results = await searchPlaces(
        apiKey,
        name,
        lat !== null && lng !== null ? { latitude: lat, longitude: lng, radiusMeters: 500 } : undefined,
      )
      const first = results[0]
      if (!first) {
        return jsonResponse({ error: 'Could not find that business. Try copying the full Google Maps link.' }, { status: 422 })
      }
      placeId = first.placeId
    } catch (err) {
      console.error('Place search fallback failed:', err)
      return jsonResponse({ error: 'Could not fetch business details. Check the URL and try again.' }, { status: 502 })
    }
  }

  try {
    const details = await getPlaceDetails(apiKey, placeId)
    return jsonResponse({
      success: true,
      preview: {
        placeId: details.placeId,
        name: details.name,
        address: details.formattedAddress,
        city: details.city,
        phone: details.phone,
        rating: details.rating,
        ratingCount: details.ratingCount,
        openingHours: details.openingHours,
        photos: details.photos,
      },
    })
  } catch (err) {
    console.error('Place lookup failed:', err)
    return jsonResponse({ error: 'Could not fetch business details. Check the URL and try again.' }, { status: 502 })
  }
})
