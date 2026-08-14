import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { executeBatch } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody<unknown>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const token = cleanString((body as ApiRecord).token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })
  const requestHasBoundIdentity = Boolean(result.request.user_id || result.request.anonymous_user_id)
  const sessionOwnsRequest = result.request.user_id === sessionUser.id
    || result.request.anonymous_user_id === sessionUser.id
  if (requestHasBoundIdentity && !sessionOwnsRequest) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `UPDATE review_requests
        SET user_id = COALESCE(user_id, ?),
            anonymous_user_id = COALESCE(anonymous_user_id, ?),
            updated_at = ?
        WHERE id = ?
          AND token_hash = ?
          AND organization_id = ?
          AND site_id = ?
          AND customer_id = ?
          AND booking_type = ?
          AND booking_id = ?
          AND revoked_at IS NULL
          AND submitted_at IS NULL
          AND expires_at > ?
          AND (
            (user_id IS NULL AND anonymous_user_id IS NULL)
            OR user_id = ?
            OR anonymous_user_id = ?
          )`,
      params: [
        sessionUser.isAnonymous ? null : sessionUser.id,
        sessionUser.isAnonymous ? sessionUser.id : null,
        now,
        result.request.id,
        result.request.token_hash,
        result.context.organization_id,
        result.context.site_id,
        result.request.customer_id,
        result.request.booking_type,
        result.request.booking_id,
        now,
        sessionUser.id,
        sessionUser.id,
      ],
    },
    {
      query: `SELECT CASE WHEN changes() = 1 THEN NULL ELSE json(?) END`,
      params: ['review session binding lost its request-state guard'],
    },
    {
      query: `UPDATE customers
        SET user_id = COALESCE(user_id, ?), updated_at = ?
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND (user_id IS NULL OR user_id = ?)`,
      params: [
        sessionUser.id,
        now,
        result.request.customer_id,
        result.context.organization_id,
        result.context.site_id,
        sessionUser.id,
      ],
    },
    {
      query: `SELECT CASE WHEN changes() = 1 THEN NULL ELSE json(?) END`,
      params: ['review session binding lost its customer-state guard'],
    },
  ])

  return jsonResponse({ success: true, requestId: result.request.id })
})
