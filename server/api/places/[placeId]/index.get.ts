import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPlaceDetails } from '~/server/utils/google-places'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) {
    return jsonResponse({ error: 'Places API not configured' }, { status: 503 })
  }

  const placeId = getRouterParam(event, 'placeId')
  if (!placeId || placeId.length > 300) {
    return jsonResponse({ error: 'Invalid place ID' }, { status: 400 })
  }

  try {
    const details = await getPlaceDetails(apiKey, placeId)
    return jsonResponse({ success: true, details })
  } catch (error) {
    console.error('Places detail error:', error)
    return jsonResponse({ error: 'Failed to fetch place details' }, { status: 502 })
  }
})
