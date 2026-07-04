import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')
  const token = readBearerToken(getHeader(event, 'authorization'))

  if (!siteId || !reservationId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const tokenHash = await hashReservationCancelToken(token)
  const reservation = await queryFirst(
    db,
    `
    SELECT name, date, time, guests, status, location_id
    FROM reservation_submissions
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
    LIMIT 1
  `,
    [reservationId, siteId, tokenHash, new Date().toISOString()],
  )

  if (!reservation) {
    return jsonResponse({ error: 'Reservation not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    reservation
  })
})
