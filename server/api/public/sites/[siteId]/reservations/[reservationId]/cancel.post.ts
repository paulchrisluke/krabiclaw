import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

const IP_HOURLY_LIMIT = 20
const RESERVATION_HOURLY_LIMIT = 5

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

  const clientIpHash = await hashClientIp(getClientIp(event))
  const hourKey = `reservation-cancel:ip:${clientIpHash}:${Math.floor(Date.now() / 3600000)}`
  const rateLimitOk = await incrementHourlyRateLimit(db, hourKey, import.meta.dev ? 1000 : IP_HOURLY_LIMIT, 3_600_000)
  if (!rateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const reservationHourKey = `reservation-cancel:reservation:${siteId}:${reservationId}:${Math.floor(Date.now() / 3600000)}`
  const reservationRateLimitOk = await incrementHourlyRateLimit(db, reservationHourKey, import.meta.dev ? 1000 : RESERVATION_HOURLY_LIMIT, 3_600_000)
  if (!reservationRateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const tokenHash = await hashReservationCancelToken(token)
  const now = new Date().toISOString()
  const cancellable = await queryFirst<{
    organization_id: string
    site_id: string
    name: string
    email: string
    phone: string
    date: string
    time: string
    guests: string
    location_id: string | null
    status: 'new' | 'confirmed'
  }>(
    db,
    `
    SELECT organization_id, site_id, name, email, phone, date, time, guests, location_id, status
    FROM reservation_submissions
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
      AND status IN ('new', 'confirmed')
    LIMIT 1
  `,
    [reservationId, siteId, tokenHash, now],
  )

  if (!cancellable) {
    return jsonResponse({ error: 'Reservation not found or already cancelled' }, { status: 404 })
  }

  const reservation = await queryFirst<{
    organization_id: string
    site_id: string
    name: string
    email: string
    phone: string
    date: string
    time: string
    guests: string
    requests: string | null
    location_id: string | null
    location_name: string | null
  }>(
    db,
    `
    UPDATE reservation_submissions
    SET status = 'cancelled', cancellation_token_used_at = ?
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
      AND status IN ('new', 'confirmed')
    RETURNING organization_id, site_id, name, email, phone, date, time, guests, requests, location_id,
      (SELECT title FROM business_locations WHERE id = reservation_submissions.location_id) AS location_name
  `,
    [now, reservationId, siteId, tokenHash, now],
  )

  if (!reservation) {
    return jsonResponse({ error: 'Reservation not found or already cancelled' }, { status: 404 })
  }

  const site = await queryFirst<{ brand_name?: string | null }>(
    db,
    'SELECT brand_name FROM sites WHERE id = ? LIMIT 1',
    [siteId],
  )

  try {
    await notifyReservationCancelled(env, db, {
      organizationId: reservation.organization_id,
      siteId: reservation.site_id,
      siteName: site?.brand_name,
      locationId: reservation.location_id,
      locationName: reservation.location_name,
      reservationId,
      guestName: reservation.name,
      email: reservation.email,
      phone: reservation.phone,
      date: reservation.date,
      time: reservation.time,
      guests: reservation.guests,
      requests: reservation.requests,
      wasConfirmed: cancellable.status === 'confirmed'
    })
  } catch (error) {
    console.error('reservation_cancellation_notification_failed', {
      organizationId: reservation.organization_id,
      siteId: reservation.site_id,
      reservationId,
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return jsonResponse({
    success: true,
    message: 'Reservation cancelled successfully'
  })
})
