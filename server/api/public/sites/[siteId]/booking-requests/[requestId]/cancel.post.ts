import { getGuestRequest, cancelBookingRequest, requestSummary } from '~/server/domain/requests'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyBookingCancelled, notifyReservationCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { localPartsAt } from '~/utils/timezone'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

const IP_HOURLY_LIMIT = 20
const REQUEST_HOURLY_LIMIT = 5

/**
 * Spend a guest's cancellation token.
 *
 * One route for both kinds. Which record holds the seats is the thread's own
 * `kind`, resolved once by cancelBookingRequest, and the guest is told about
 * the thing they booked in the words that fit it.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const requestId = getRouterParam(event, 'requestId')
  const token = readBearerToken(event.req.headers.get('authorization'))
  if (!siteId || !requestId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const clientIpHash = await hashClientIp(getClientIp(event))
  const hour = Math.floor(Date.now() / 3_600_000)
  const ipOk = await incrementHourlyRateLimit(db, `booking-cancel:ip:${clientIpHash}:${hour}`, import.meta.dev ? 1000 : IP_HOURLY_LIMIT, 3_600_000)
  if (!ipOk) return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  const requestOk = await incrementHourlyRateLimit(db, `booking-cancel:request:${siteId}:${requestId}:${hour}`, import.meta.dev ? 1000 : REQUEST_HOURLY_LIMIT, 3_600_000)
  if (!requestOk) return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })

  const existing = await getGuestRequest(db, requestId, siteId)
  if (!existing || existing.kind === 'contact') {
    return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })
  }

  const tokenHash = await hashReservationCancelToken(token)
  const now = new Date().toISOString()
  const cancelled = await cancelBookingRequest(db, { id: requestId, siteId, kind: existing.kind, tokenHash, now })
  if (!cancelled) return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })

  const request = cancelled.request
  const record = cancelled.record
  const summary = await requestSummary(db, request)
  await publishGuestInboxThreadEvent(env, db, { threadId: request.id, type: 'thread.changed' })

  const site = await queryFirst<{ brand_name?: string | null }>(db, 'SELECT brand_name FROM sites WHERE id = ? LIMIT 1', [siteId])

  try {
    if (record.kind === 'booking') {
      await notifyBookingCancelled(env, db, {
        organizationId: request.organization_id, siteId: request.site_id, siteName: site?.brand_name,
        locationId: record.location_id, bookingId: request.id, guestName: request.payload.guest.name,
        email: request.payload.guest.email, guestPhone: request.payload.guest.phone,
        productTitle: record.product_name ?? summary.productTitle ?? '',
        startsAt: record.starts_at, timezone: record.timezone, partySize: record.party_size,
        notes: request.payload.notes, wasConfirmed: cancelled.wasConfirmed,
      })
    } else {
      // The reservation email states a calendar date and a clock time, so the
      // instant is read back in the reservation's own zone rather than the
      // worker's.
      const parts = localPartsAt(new Date(record.starts_at), record.timezone)
      const localDate = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
      const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
      await notifyReservationCancelled(env, db, {
        organizationId: request.organization_id, siteId: request.site_id, siteName: site?.brand_name,
        locationId: record.location_id, locationName: summary.locationTitle, reservationId: request.id,
        guestName: request.payload.guest.name, email: request.payload.guest.email, phone: request.payload.guest.phone,
        date: localDate, time: localTime,
        guests: `${record.party_size}${request.payload.party_size_is_minimum ? '+' : ''}`,
        requests: request.payload.notes, wasConfirmed: cancelled.wasConfirmed,
      })
    }
  } catch (error) {
    console.error('booking_cancellation_notification_failed', {
      organizationId: request.organization_id, siteId: request.site_id, requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return jsonResponse({ success: true, kind: record.kind })
})
