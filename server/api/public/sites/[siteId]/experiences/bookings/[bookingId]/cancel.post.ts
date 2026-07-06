import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyExperienceBookingCancelled } from '~/server/utils/notifications'
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
  const cancellable = await queryFirst<{
    organization_id: string
    site_id: string
    guest_name: string
    guest_email: string
    guest_phone: string | null
    booking_date: string
    time_slot: string
    party_size: number
    location_id: string | null
    status: 'pending' | 'confirmed'
  }>(
    db,
    `
    SELECT organization_id, site_id, guest_name, guest_email, guest_phone, booking_date, time_slot, party_size, location_id, status
    FROM experience_bookings
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
      AND status IN ('pending', 'confirmed')
    LIMIT 1
  `,
    [bookingId, siteId, tokenHash, now],
  )

  if (!cancellable) {
    return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })
  }

  const booking = await queryFirst<{
    organization_id: string
    site_id: string
    guest_name: string
    guest_email: string
    guest_phone: string | null
    booking_date: string
    time_slot: string
    party_size: number
    notes: string | null
    location_id: string | null
    experience_title: string
  }>(
    db,
    `
    UPDATE experience_bookings
    SET status = 'cancelled', cancellation_token_used_at = ?
    WHERE id = ?
      AND site_id = ?
      AND cancellation_token_hash = ?
      AND cancellation_token_used_at IS NULL
      AND cancellation_token_expires_at > ?
      AND status IN ('pending', 'confirmed')
    RETURNING organization_id, site_id, guest_name, guest_email, guest_phone, booking_date, time_slot, party_size, notes, location_id,
      (SELECT title FROM experiences WHERE id = experience_bookings.experience_id) AS experience_title
  `,
    [now, bookingId, siteId, tokenHash, now],
  )

  if (!booking) {
    return jsonResponse({ error: 'Booking not found or already cancelled' }, { status: 404 })
  }

  const site = await queryFirst<{ brand_name?: string | null }>(
    db,
    'SELECT brand_name FROM sites WHERE id = ? LIMIT 1',
    [siteId],
  )

  try {
    await notifyExperienceBookingCancelled(env, db, {
      organizationId: booking.organization_id,
      siteId: booking.site_id,
      siteName: site?.brand_name,
      locationId: booking.location_id,
      bookingId,
      guestName: booking.guest_name,
      email: booking.guest_email,
      guestPhone: booking.guest_phone,
      experienceTitle: booking.experience_title,
      bookingDate: booking.booking_date,
      timeSlot: booking.time_slot,
      partySize: booking.party_size,
      notes: booking.notes,
      wasConfirmed: cancellable.status === 'confirmed'
    })
  } catch (error) {
    console.error('experience_booking_cancellation_notification_failed', {
      organizationId: booking.organization_id,
      siteId: booking.site_id,
      bookingId,
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return jsonResponse({
    success: true,
    message: 'Booking cancelled successfully'
  })
})
