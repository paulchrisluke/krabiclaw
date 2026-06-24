import { execute, queryFirst, type DbClient } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'

const IP_HOURLY_LIMIT = 20
const RESERVATION_HOURLY_LIMIT = 5

async function getClientIp(event: ApiValue): Promise<string> {
  const ip = getHeader(event, 'CF-Connecting-IP')
    || String(getHeader(event, 'x-forwarded-for') || '').split(',').map(part => part.trim()).find(Boolean)
    || event.node.req.socket.remoteAddress
    || 'unknown'
    
  if (ip === 'unknown') return ip
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function incrementRateLimit(db: DbClient, key: string, limit: number): Promise<boolean> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 3600000).toISOString()
  const result = await execute(db, `
    INSERT INTO rate_limits (key, count, updated_at, expires_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE
        WHEN expires_at <= ? THEN 1
        WHEN count < ? THEN count + 1
        ELSE count
      END,
      updated_at = excluded.updated_at,
      expires_at = CASE
        WHEN expires_at <= ? THEN ?
        ELSE expires_at
      END
  `, [key, now, expiresAt, now, limit, now, expiresAt])

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
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const clientIp = await getClientIp(event)
  const hourKey = `reservation-cancel:ip:${clientIp}:${Math.floor(Date.now() / 3600000)}`
  const rateLimitOk = await incrementRateLimit(db, hourKey, import.meta.dev ? 1000 : IP_HOURLY_LIMIT)
  if (!rateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const reservationHourKey = `reservation-cancel:reservation:${siteId}:${reservationId}:${Math.floor(Date.now() / 3600000)}`
  const reservationRateLimitOk = await incrementRateLimit(db, reservationHourKey, import.meta.dev ? 1000 : RESERVATION_HOURLY_LIMIT)
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
    status: 'new' | 'confirmed'
  }>(
    db,
    `
    SELECT organization_id, site_id, name, email, phone, date, time, guests, status
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
    RETURNING organization_id, site_id, name, email, phone, date, time, guests
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
      reservationId,
      guestName: reservation.name,
      email: reservation.email,
      phone: reservation.phone,
      date: reservation.date,
      time: reservation.time,
      guests: reservation.guests,
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
