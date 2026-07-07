import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getReviewRequestByToken, optOutCustomerReviewRequests } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody(event).catch(() => ({})) as { token?: unknown }
  const token = cleanString(body.token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })

  await optOutCustomerReviewRequests(db, result.request)
  return jsonResponse({ optedOut: true })
})
