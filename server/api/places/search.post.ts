import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { searchPlaces } from '~/server/utils/google-places'

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

  const body = await readBody(event) as { query?: unknown }
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query || query.length < 2) {
    return jsonResponse({ error: 'query must be at least 2 characters' }, { status: 400 })
  }
  if (query.length > 200) {
    return jsonResponse({ error: 'query too long' }, { status: 400 })
  }

  try {
    const results = await searchPlaces(apiKey, query)
    return jsonResponse({ success: true, results })
  } catch (error) {
    console.error('Places search error:', error)
    return jsonResponse({ error: 'Places search failed' }, { status: 502 })
  }
})
