import { getGuestRequest, cancelBookingRequest, requestSummary } from '~/server/domain/requests'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyExperienceBookingCancelled } from '~/server/utils/notifications'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

const IP_HOURLY_LIMIT = 20
const BOOKING_HOURLY_LIMIT = 5

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const bookingId = getRouterParam(event, 'bookingId')

  const token = readBearerToken((event.req.headers.get('authorization')))
  if (!siteId || !bookingId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const clientIp = await hashClientIp(getClientIp(event))
  const hourKey = `experience-booking-cancel:ip:${clientIp}:${Math.floor(Date.now() / 3600000)}`
  const rateLimitOk = await incrementHourlyRateLimit(db, hourKey, import.meta.dev ? 1000 : IP_HOURLY_LIMIT, 3600000)
  if (!rateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const bookingHourKey = `experience-booking-cancel:booking:${siteId}:${bookingId}:${Math.floor(Date.now() / 3600000)}`
  const bookingRateLimitOk = await incrementHourlyRateLimit(db, bookingHourKey, import.meta.dev ? 1000 : BOOKING_HOURLY_LIMIT, 3600000)
  if (!bookingRateLimitOk) {
    return jsonResponse({ error: 'Too many cancellation attempts. Please try again later.' }, { status: 429 })
  }

  const tokenHash = await hashReservationCancelToken(token)
  const now = new Date().toISOString()
  const cancelled = await cancelBookingRequest(db, { id: bookingId, siteId, kind: 'booking', tokenHash, now })
  if (!cancelled) return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })
  const booking = cancelled.request
  const summary = await requestSummary(db, booking)
  if (summary.productTitle === null) throw new Error('Booked product is missing')

  const thread = await getGuestRequest(db, bookingId, undefined, 'booking')
  if (thread) {
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  }

  const site = await queryFirst<{ brand_name?: string | null }>(
    db, 'SELECT brand_name FROM sites WHERE id = ? LIMIT 1', [siteId], )

  try {
    await notifyExperienceBookingCancelled(env, db, {
      organizationId: booking.organization_id, siteId: booking.site_id, siteName: site?.brand_name, locationId: booking.location_id, bookingId, guestName: booking.payload.guest.name, email: booking.payload.guest.email, guestPhone: booking.payload.guest.phone, experienceTitle: summary.productTitle, bookingDate: booking.booking_date, timeSlot: booking.time_slot, partySize: booking.party_size, notes: booking.payload.notes, wasConfirmed: cancelled.wasConfirmed
    })
  } catch (error) {
    console.error('booking_cancellation_notification_failed', {
      organizationId: booking.organization_id, siteId: booking.site_id, bookingId, error: error instanceof Error ? error.message : String(error)
    })
  }

  return jsonResponse({
    success: true, message: 'Booking cancelled successfully'
  })
})
import { defineHandler } from 'nitro';
import { getHeader } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
