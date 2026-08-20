import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { executeBatch } from '~/server/db'
import { getReviewRequestByToken } from '~/server/utils/review-requests'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody<unknown>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const token = cleanString((body as { token?: unknown }).token, 300)
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const result = await getReviewRequestByToken(db, token)
  if (!result) return jsonResponse({ error: 'Review request not found or expired' }, { status: 404 })

  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `UPDATE customers
        SET review_request_opted_out_at = COALESCE(review_request_opted_out_at, ?), updated_at = ?
        WHERE id = ?
          AND organization_id = ?
          AND site_id = ?
          AND EXISTS (
            SELECT 1
            FROM review_requests rr
            WHERE rr.id = ?
              AND rr.token_hash = ?
              AND rr.organization_id = ?
              AND rr.site_id = ?
              AND rr.customer_id = customers.id
              AND rr.booking_type = ?
              AND rr.booking_id = ?
              AND rr.revoked_at IS NULL
              AND rr.submitted_at IS NULL
              AND rr.expires_at > ?
          )`, params: [
        now, now, result.request.customer_id, result.context.organization_id, result.context.site_id, result.request.id, result.request.token_hash, result.context.organization_id, result.context.site_id, result.request.booking_type, result.request.booking_id, now, ], }, {
      query: `SELECT CASE WHEN changes() = 1 THEN NULL ELSE json(?) END`, params: ['review opt-out lost its request-state guard'], }, ])
  return jsonResponse({ optedOut: true })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
