import { getGuestRequest, cancelBookingRequest, requestSummary } from '~/server/domain/requests'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { localPartsAt } from '~/utils/timezone'

const IP_HOURLY_LIMIT = 20
const RESERVATION_HOURLY_LIMIT = 5

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')

  const token = readBearerToken((event.req.headers.get('authorization')))
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
  const cancelled = await cancelBookingRequest(db, { id: reservationId, siteId, kind: 'reservation', tokenHash, now })
  if (!cancelled) return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })
  const reservation = cancelled.request
  if (reservation.kind !== 'reservation') throw new Error('Cancellation returned another booking kind')
  const summary = await requestSummary(db, reservation)
  // When and for how many comes from the reservation row, in the reservation's
  // own zone — the thread carries the conversation, never the seating facts.
  const parts = localPartsAt(new Date(cancelled.record.starts_at), cancelled.record.timezone)
  const localDate = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`

  const thread = await getGuestRequest(db, reservationId, undefined, 'reservation')
  if (thread) {
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  }

  const site = await queryFirst<{ brand_name?: string | null }>(
    db, 'SELECT brand_name FROM sites WHERE id = ? LIMIT 1', [siteId], )

  try {
    await notifyReservationCancelled(env, db, {
      organizationId: reservation.organization_id, siteId: reservation.site_id, siteName: site?.brand_name, locationId: reservation.location_id, locationName: summary.locationTitle, reservationId, guestName: reservation.payload.guest.name, email: reservation.payload.guest.email, phone: reservation.payload.guest.phone, date: localDate, time: localTime, guests: `${cancelled.record.party_size}${reservation.payload.party_size_is_minimum ? '+' : ''}`, requests: reservation.payload.notes, wasConfirmed: cancelled.wasConfirmed
    })
  } catch (error) {
    console.error('reservation_cancellation_notification_failed', {
      organizationId: reservation.organization_id, siteId: reservation.site_id, reservationId, error: error instanceof Error ? error.message : String(error)
    })
  }

  return jsonResponse({
    success: true, message: 'Reservation cancelled successfully'
  })
})
import { defineHandler } from 'nitro';
import { getHeader } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
