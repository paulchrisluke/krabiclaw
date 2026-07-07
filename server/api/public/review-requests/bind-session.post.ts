import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as ApiRecord
  const token = cleanString(body.token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  if (result.request.user_id && result.request.user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  if (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser.id) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const now = new Date().toISOString()
  await execute(db, `
    UPDATE review_requests
    SET user_id = COALESCE(user_id, ?),
        anonymous_user_id = COALESCE(anonymous_user_id, ?),
        updated_at = ?
    WHERE id = ?
  `, [sessionUser.isAnonymous ? null : sessionUser.id, sessionUser.isAnonymous ? sessionUser.id : null, now, result.request.id])

  await execute(db, `
    UPDATE customers
    SET user_id = COALESCE(user_id, ?), updated_at = ?
    WHERE id = ?
  `, [sessionUser.id, now, result.request.customer_id])

  return jsonResponse({ success: true, requestId: result.request.id })
})
