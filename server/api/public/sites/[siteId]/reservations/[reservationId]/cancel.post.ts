import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'

const IP_HOURLY_LIMIT = 20
const RESERVATION_HOURLY_LIMIT = 5

function getClientIp(event: ApiValue): string {
  const forwardedFor = String(getHeader(event, 'x-forwarded-for') || '')
  return forwardedFor.split(',').map(part => part.trim()).find(Boolean)
    || getHeader(event, 'CF-Connecting-IP')
    || event.node.req.socket.remoteAddress
    || 'unknown'
}

async function incrementRateLimit(db: D1Database, key: string, limit: number): Promise<boolean> {
  const result = await db.prepare(`
    INSERT INTO rate_limits (key, count, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    WHERE count < ?
  `).bind(key, new Date().toISOString(), limit).run()

  return Boolean(result?.success && result?.meta?.changes)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')

  const token = readBearerToken(getHeader(event, 'authorization'))
  if (!siteId || !reservationId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const hourKey = `reservation-cancel:ip:${getClientIp(event)}:${Math.floor(Date.now() / 3600000)}`
  const rateLimitOk = await incrementRateLimit(db, hourKey, IP_HOURLY_LIMIT)
  if (!rateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const reservationHourKey = `reservation-cancel:reservation:${siteId}:${reservationId}:${Math.floor(Date.now() / 3600000)}`
  const reservationRateLimitOk = await incrementRateLimit(db, reservationHourKey, RESERVATION_HOURLY_LIMIT)
  if (!reservationRateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const tokenHash = await hashReservationCancelToken(token)
  const now = new Date().toISOString()
  const reservation = await db.prepare(`
    UPDATE reservation_submissions
    SET status = 'cancelled', cancellation_token_used_at = ?
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
      AND status != 'cancelled'
    RETURNING organization_id, site_id, name, email, phone, date, time, guests
  `).bind(now, reservationId, siteId, tokenHash, now).first<{
    organization_id: string
    site_id: string
    name: string
    email: string
    phone: string
    date: string
    time: string
    guests: string
  }>()

  if (!reservation) {
    return jsonResponse({ error: 'Reservation not found or already cancelled' }, { status: 404 })
  }

  const site = await db.prepare(`
    SELECT brand_name FROM sites WHERE id = ? LIMIT 1
  `).bind(siteId).first<{ brand_name?: string | null }>()

  notifyReservationCancelled(env, db, {
    organizationId: reservation.organization_id,
    siteId: reservation.site_id,
    siteName: site?.brand_name,
    reservationId,
    guestName: reservation.name,
    email: reservation.email,
    phone: reservation.phone,
    date: reservation.date,
    time: reservation.time,
    guests: reservation.guests
  }).catch((error) => {
    console.error('reservation_cancellation_notification_failed', {
      organizationId: reservation.organization_id,
      siteId: reservation.site_id,
      reservationId,
      error: error instanceof Error ? error.message : String(error)
    })
  })

  return jsonResponse({
    success: true,
    message: 'Reservation cancelled successfully'
  })
})
