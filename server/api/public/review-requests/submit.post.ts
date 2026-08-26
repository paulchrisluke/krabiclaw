import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { executeBatch, queryAll, type BatchQuery } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { getReviewRequestByToken, hashReviewRequestToken } from '~/server/utils/review-requests'
import { notifyReviewReceived } from '~/server/utils/notifications'

function batchAssertion(condition: string, params: unknown[], message: string): BatchQuery {
  return {
    query: `SELECT CASE WHEN (${condition}) THEN NULL ELSE json(?) END`, params: [...params, message], }
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody<unknown>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const bodyRecord = body as Record<string, unknown>
  const token = cleanString(bodyRecord.token, 300)
  const title = cleanString(bodyRecord.title, 120) || null
  const content = cleanString(bodyRecord.content, 2000)
  const rating = Number(bodyRecord.rating)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonResponse({ error: 'Rating must be between 1 and 5.' }, { status: 400 })
  if (content.length < 10) return jsonResponse({ error: 'Review text must be at least 10 characters.' }, { status: 400 })

  const tokenHash = await hashReviewRequestToken(token)
  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const hourWindow = Math.floor(Date.now() / 3_600_000)
  const rateOk = await incrementHourlyRateLimit(db, `rate:review-submit:${tokenHash}:${ipHash}:${hourWindow}`, 5, 3_600_000)
  if (!rateOk) return jsonResponse({ error: 'Too many attempts. Please try again later.' }, { status: 429 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })

  const session = await getAuthSession(event, env)
  const sessionUser = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined)
  if (!sessionUser?.id) return jsonResponse({ error: 'Review session required' }, { status: 401 })
  const userId = sessionUser?.id && !sessionUser.isAnonymous ? sessionUser.id : null
  const reviewUserId = sessionUser?.id ?? null
  const anonymousUserId = sessionUser?.id && sessionUser.isAnonymous ? sessionUser.id : null
  if ((result.request.user_id && result.request.user_id !== sessionUser?.id) || (result.request.anonymous_user_id && result.request.anonymous_user_id !== sessionUser?.id)) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }
  const mediaRows = await queryAll<{ asset_id: string; kind: string; asset_status: string }>(db, `
    SELECT mp.asset_id, ma.kind, ma.status AS asset_status
    FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
    WHERE mp.owner_type = 'review_request' AND mp.owner_id = ? AND mp.status = 'pending'
    ORDER BY mp.sort_order
  `, [result.request.id])
  if (mediaRows.some(row => row.asset_status !== 'active')) {
    return jsonResponse({ error: 'Wait for all media uploads to finish before submitting.' }, { status: 409 })
  }
  const imageCount = mediaRows.filter(row => row.kind === 'image').length
  const videoCount = mediaRows.filter(row => row.kind === 'video').length
  if (imageCount > 5 || videoCount > 2 || mediaRows.length !== imageCount + videoCount) {
    return jsonResponse({ error: 'You can attach up to 5 photos and 2 videos.' }, { status: 400 })
  }
  const mediaCount = mediaRows.length
  const reviewId = crypto.randomUUID()
  const now = new Date().toISOString()
  const authorName = result.context.customer_name || result.context.guest_name || 'Guest'
  const userAgent = cleanString((event.req.headers.get('User-Agent')), 300)

  const requestIsSubmittable = `EXISTS (
    SELECT 1
    FROM review_requests rr
    WHERE rr.id = ?
      AND rr.token_hash = ?
      AND rr.organization_id = ?
      AND rr.site_id = ?
      AND rr.customer_id = ?
      AND rr.booking_type = ?
      AND rr.booking_id = ?
      AND rr.revoked_at IS NULL
      AND rr.submitted_at IS NULL
      AND rr.expires_at > ?
      AND (rr.user_id IS NULL OR rr.user_id = ?)
      AND (rr.anonymous_user_id IS NULL OR rr.anonymous_user_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM reviews existing_review WHERE existing_review.review_request_id = rr.id
      )
  )`
  const requestGuardParams = [
    result.request.id, tokenHash, result.context.organization_id, result.context.site_id, result.request.customer_id, result.request.booking_type, result.request.booking_id, now, sessionUser.id, sessionUser.id, ]
  const bookingTable = result.request.booking_type === 'reservation'
    ? 'reservation_submissions'
    : 'experience_bookings'
  const batch: BatchQuery[] = [
    batchAssertion(
      requestIsSubmittable, requestGuardParams, 'review request state changed during submission', ), batchAssertion(
      `EXISTS (
        SELECT 1 FROM ${bookingTable}
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND customer_id = ?
          AND review_submitted_at IS NULL
          AND review_id IS NULL
      )`, [
        result.request.booking_id, result.context.organization_id, result.context.site_id, result.request.customer_id, ], 'review booking state changed during submission', ), batchAssertion(
      `EXISTS (
        SELECT 1 FROM customers
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND (user_id IS NULL OR user_id = ?)
      )`, [
        result.request.customer_id, result.context.organization_id, result.context.site_id, sessionUser.id, ], 'review customer identity changed during submission', ), ]

  if (mediaCount) {
    batch.push(batchAssertion(
      `(
        SELECT COUNT(*) = ?
          AND SUM(CASE WHEN ma.status = 'active' THEN 1 ELSE 0 END) = ?
          AND SUM(CASE WHEN kind = 'image' THEN 1 ELSE 0 END) <= 5
          AND SUM(CASE WHEN kind = 'video' THEN 1 ELSE 0 END) <= 2
        FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id
        WHERE mp.owner_type = 'review_request' AND mp.owner_id = ?
          AND mp.status = 'pending'
      )`, [mediaCount, mediaCount, result.request.id], 'review media state changed during submission', ))
  }

  batch.push(
    {
      query: `INSERT INTO reviews (
        id, organization_id, site_id, location_id, customer_id, booking_id, booking_type, review_request_id, user_id, author_name, rating, title, content, status, source, ip_hash, user_agent, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'direct', ?, ?, ?, ?
      WHERE ${requestIsSubmittable}`, params: [
        reviewId, result.context.organization_id, result.context.site_id, result.context.location_id, result.request.customer_id, result.request.booking_id, result.request.booking_type, result.request.id, reviewUserId, authorName, rating, title, content, ipHash, userAgent, now, now, ...requestGuardParams, ], }, batchAssertion('changes() = 1', [], 'review insert lost its request-state guard'), {
      query: `UPDATE review_requests
        SET submitted_at = ?, user_id = COALESCE(user_id, ?), anonymous_user_id = COALESCE(anonymous_user_id, ?), updated_at = ?
        WHERE id = ?
          AND token_hash = ?
          AND organization_id = ?
          AND site_id = ?
          AND customer_id = ?
          AND booking_type = ?
          AND booking_id = ?
          AND submitted_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > ?
          AND (user_id IS NULL OR user_id = ?)
          AND (anonymous_user_id IS NULL OR anonymous_user_id = ?)`, params: [
        now, userId, anonymousUserId, now, ...requestGuardParams, ], }, batchAssertion('changes() = 1', [], 'review request submission compare-and-set failed'), {
      query: `UPDATE ${bookingTable}
        SET review_submitted_at = ?, review_id = ?, updated_at = ?
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND customer_id = ?
          AND review_submitted_at IS NULL
          AND review_id IS NULL`, params: [
        now, reviewId, now, result.request.booking_id, result.context.organization_id, result.context.site_id, result.request.customer_id, ], }, batchAssertion('changes() = 1', [], 'review booking submission compare-and-set failed'), {
      query: `UPDATE customers
        SET last_review_at = ?, user_id = COALESCE(user_id, ?), updated_at = ?
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND (user_id IS NULL OR user_id = ?)`, params: [
        now, sessionUser.id, now, result.request.customer_id, result.context.organization_id, result.context.site_id, sessionUser.id, ], }, batchAssertion('changes() = 1', [], 'review customer update lost its scope guard'), )

  if (mediaCount) {
    batch.push(
      {
        query: `UPDATE media_placements
          SET owner_type = 'review', owner_id = ?, updated_at = ?
          WHERE owner_type = 'review_request' AND owner_id = ?
            AND status = 'pending'`, params: [reviewId, now, result.request.id], }, batchAssertion(
        'changes() = ?', [mediaCount], 'review media attachment compare-and-set failed', ), )
  }

  await executeBatch(db, batch)

  try {
    await notifyReviewReceived(env, db, {
      organizationId: result.context.organization_id, siteId: result.context.site_id, siteName: result.context.site_name, locationId: result.context.location_id, reviewId, authorName, rating, content, })
  } catch (error) {
    console.error('notifyReviewReceived_failed', {
      reviewId, error: error instanceof Error ? error.message : String(error), })
  }

  return jsonResponse({ success: true, reviewId, status: 'pending' }, { status: 201 })
})
import { defineHandler } from 'nitro';
import { getHeader } from 'nitro/h3';
import { readBody } from 'nitro/h3';
