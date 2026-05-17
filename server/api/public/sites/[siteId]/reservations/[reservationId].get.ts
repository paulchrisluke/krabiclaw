import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')
  const token = String(getQuery(event).token || '')

  if (!siteId || !reservationId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const tokenHash = await hashReservationCancelToken(token)
  const reservation = await db.prepare(`
    SELECT name, date, time, guests, status
    FROM reservation_submissions
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
    LIMIT 1
  `).bind(reservationId, siteId, tokenHash, new Date().toISOString()).first()

  if (!reservation) {
    return jsonResponse({ error: 'Reservation not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    reservation
  })
})
