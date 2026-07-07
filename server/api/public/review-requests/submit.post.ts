import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, queryAll } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { getReviewRequestByToken, hashReviewRequestToken, markReviewSubmittedForRequest } from '~/server/utils/review-requests'
import { notifyReviewReceived } from '~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody(event).catch(() => ({})) as ApiRecord
  const token = cleanString(body.token, 300)
  const title = cleanString(body.title, 120) || null
  const content = cleanString(body.content, 2000)
  const rating = Number(body.rating)
  const rawMediaAssetIds = Array.isArray(body.mediaAssetIds)
    ? body.mediaAssetIds.map((value: ApiValue) => cleanString(value, 80)).filter(Boolean)
    : []
  const mediaAssetIds = [...new Set(rawMediaAssetIds)]

  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonResponse({ error: 'Rating must be between 1 and 5.' }, { status: 400 })
  if (content.length < 10) return jsonResponse({ error: 'Review text must be at least 10 characters.' }, { status: 400 })
  if (rawMediaAssetIds.length !== mediaAssetIds.length) return jsonResponse({ error: 'Duplicate media attachments are not allowed.' }, { status: 400 })
  if (mediaAssetIds.length > 7) return jsonResponse({ error: 'You can attach up to 5 photos and 2 videos.' }, { status: 400 })

  const tokenHash = await hashReviewRequestToken(token)
  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const hourWindow = Math.floor(Date.now() / 3_600_000)
  const rateOk = await incrementHourlyRateLimit(db, `rate:review-submit:${tokenHash}:${ipHash}:${hourWindow}`, 5, 3_600_000)
  if (!rateOk) return jsonResponse({ error: 'Too many attempts. Please try again later.' }, { status: 429 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })

  const session = await getAuthSession(event, env).catch(() => null)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Review session required' }, { status: 401 })
  const userId = sessionUser?.id && !sessionUser.isAnonymous ? sessionUser.id : null
  const reviewUserId = sessionUser?.id ?? null
  const anonymousUserId = sessionUser?.id && sessionUser.isAnonymous ? sessionUser.id : null
  if ((result.request.user_id && result.request.user_id !== sessionUser?.id) || (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser?.id)) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  if (mediaAssetIds.length) {
    const placeholders = mediaAssetIds.map(() => '?').join(', ')
    const mediaRows = await queryAll<{ media_asset_id: string; kind: string }>(db, `
      SELECT media_asset_id, kind
      FROM review_media
      WHERE review_request_id = ?
        AND customer_id = ?
        AND review_id IS NULL
        AND status = 'pending'
        AND media_asset_id IN (${placeholders})
    `, [result.request.id, result.request.customer_id, ...mediaAssetIds])
    if (mediaRows.length !== mediaAssetIds.length) {
      return jsonResponse({ error: 'One or more media attachments are not valid for this review request.' }, { status: 400 })
    }
    const imageCount = mediaRows.filter(row => row.kind === 'image').length
    const videoCount = mediaRows.filter(row => row.kind === 'video').length
    if (imageCount > 5 || videoCount > 2) {
      return jsonResponse({ error: 'You can attach up to 5 photos and 2 videos.' }, { status: 400 })
    }
  }
  const reviewId = crypto.randomUUID()
  const now = new Date().toISOString()
  const authorName = result.context.customer_name || result.context.guest_name || 'Guest'
  const userAgent = cleanString(getHeader(event, 'User-Agent'), 300)

  const insert = await execute(db, `
    INSERT INTO reviews (
      id, organization_id, site_id, location_id, customer_id, booking_id, booking_type,
      review_request_id, user_id, author_name, rating, title, content, status, source,
      ip_hash, user_agent, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'direct', ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE review_request_id = ?)
  `, [
    reviewId,
    result.context.organization_id,
    result.context.site_id,
    result.context.location_id,
    result.request.customer_id,
    result.request.booking_id,
    result.request.booking_type,
    result.request.id,
    reviewUserId,
    authorName,
    rating,
    title,
    content,
    ipHash,
    userAgent,
    now,
    now,
    result.request.id,
  ])

  if (!Number(insert.meta.changes ?? 0)) {
    return jsonResponse({ error: 'This review request has already been submitted.' }, { status: 409 })
  }

  await markReviewSubmittedForRequest(db, result.request, reviewId, now)
  for (const assetId of mediaAssetIds) {
    await execute(db, `
      UPDATE review_media
      SET review_id = ?, updated_at = ?
      WHERE review_request_id = ?
        AND customer_id = ?
        AND media_asset_id = ?
        AND review_id IS NULL
        AND status = 'pending'
    `, [reviewId, now, result.request.id, result.request.customer_id, assetId])
  }
  if (userId || anonymousUserId) {
    await execute(db, `
      UPDATE review_requests
      SET user_id = COALESCE(user_id, ?),
          anonymous_user_id = COALESCE(anonymous_user_id, ?),
          updated_at = ?
      WHERE id = ?
    `, [userId, anonymousUserId, now, result.request.id])
    await execute(db, `
      UPDATE customers
      SET user_id = COALESCE(user_id, ?), updated_at = ?
      WHERE id = ?
    `, [sessionUser?.id ?? null, now, result.request.customer_id])
  }

  await notifyReviewReceived(env, db, {
    organizationId: result.context.organization_id,
    siteId: result.context.site_id,
    siteName: result.context.site_name,
    locationId: result.context.location_id,
    reviewId,
    authorName,
    rating,
    content,
  })

  return jsonResponse({ success: true, reviewId, status: 'pending' }, { status: 201 })
})
