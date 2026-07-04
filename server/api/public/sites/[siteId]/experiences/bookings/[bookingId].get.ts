import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')
  const token = readBearerToken(getHeader(event, 'authorization'))

  if (!siteId || !bookingId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const tokenHash = await hashReservationCancelToken(token)
  const booking = await queryFirst(
    db,
    `
    SELECT eb.guest_name AS name, eb.booking_date AS date, eb.time_slot AS time, eb.party_size AS guests,
      eb.status, eb.location_id, e.title AS experience_title
    FROM experience_bookings eb
    JOIN experiences e ON e.id = eb.experience_id
    WHERE eb.id = ?
      AND eb.site_id = ?
      AND eb.cancellation_token_hash = ?
      AND eb.cancellation_token_used_at IS NULL
      AND eb.cancellation_token_expires_at > ?
    LIMIT 1
  `,
    [bookingId, siteId, tokenHash, new Date().toISOString()],
  )

  if (!booking) {
    return jsonResponse({ error: 'Booking not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    booking
  })
})
