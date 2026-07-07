import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getReviewRequestByToken, resolveGoogleReviewUrl } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const token = cleanString(query.token as string, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token, { markClicked: true })
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })

  return jsonResponse({
    request: {
      id: result.request.id,
      bookingType: result.request.booking_type,
      expiresAt: result.request.expires_at,
    },
    site: {
      id: result.context.site_id,
      name: result.context.site_name,
    },
    location: {
      id: result.context.location_id,
      slug: result.context.location_slug,
      title: result.context.location_title,
      googleReviewUrl: resolveGoogleReviewUrl(result.context),
    },
    customer: {
      name: result.context.customer_name || result.context.guest_name,
    },
  })
})
