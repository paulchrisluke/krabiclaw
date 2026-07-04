import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

const IP_HOURLY_LIMIT = 20
const BOOKING_HOURLY_LIMIT = 5

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

  const clientIp = await hashClientIp(getClientIp(event))
  const hourWindow = Math.floor(Date.now() / 3_600_000)
  const ipOk = await incrementHourlyRateLimit(db, `experience-booking-cancel:ip:${clientIp}:${hourWindow}`, import.meta.dev ? 1000 : IP_HOURLY_LIMIT, 3_600_000)
  if (!ipOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const bookingOk = await incrementHourlyRateLimit(db, `experience-booking-cancel:booking:${siteId}:${bookingId}:${hourWindow}`, import.meta.dev ? 1000 : BOOKING_HOURLY_LIMIT, 3_600_000)
  if (!bookingOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

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
