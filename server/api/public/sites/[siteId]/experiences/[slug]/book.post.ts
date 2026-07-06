import { cloudflareEnv, jsonResponse, cleanString } from '~/server/utils/api-response'
import { getExperienceBySlug, createExperienceBooking, resolveEffectiveTimeSlots, getSlotAvailability, resolveExperienceTimezone } from '~/server/utils/experiences'
import { isDateBeforeTimezoneToday, isTimeSlotInPast } from '~/server/utils/site-config'
import { fmt12Hour } from '~/shared/reservation-hours'
import { notifyExperienceBookingCreated } from '~/server/utils/notifications'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { normalizePhone } from '~/server/utils/whatsapp'
import { queryFirst } from '~/server/db'
import { renderBookingPolicySummary, resolveBookingPolicy } from '~/server/utils/booking-policies'
import { getSourceLocale } from '~/server/utils/site-locales'
import { getPlatformDomain } from '~/server/utils/notifications'
import { getActiveSpecialClosure } from '~/utils/formatters'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { DEFAULT_EMAIL_DAILY_LIMIT as EMAIL_DAILY_LIMIT, DEFAULT_IP_HOURLY_LIMIT as IP_HOURLY_LIMIT, getClientIp, hashClientIp, hashIdentifier, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name: string | null; public_url: string | null; subdomain: string | null }>(db, `SELECT id, organization_id, brand_name, public_url, subdomain FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const experience = await getExperienceBySlug(db, siteId, slug)
  if (!experience || experience.status === 'inactive') {
    return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  }
  if (experience.status === 'sold_out') {
    return jsonResponse({ error: 'This experience is fully booked.' }, { status: 409 })
  }

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const guestName = cleanString(body.guest_name, 100)
  const guestEmail = cleanString(body.guest_email, 254)
  let guestPhone = cleanString(body.guest_phone, 30)
  if (guestPhone) {
    try {
      guestPhone = normalizePhone(guestPhone)
    } catch {
      return jsonResponse({ error: 'A valid phone number is required' }, { status: 400 })
    }
  }
  const bookingDate = cleanString(body.booking_date, 10)
  const timeSlot = cleanString(body.time_slot, 5)
  const notes = cleanString(body.notes, 1000)
  const partySize = Math.min(Math.max(1, Number.parseInt(String(body.party_size || 1), 10)), 99)

  if (!guestName) return jsonResponse({ error: 'Name is required' }, { status: 400 })
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return jsonResponse({ error: 'A valid email address is required' }, { status: 400 })
  }
  if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return jsonResponse({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 })
  }
  const experienceTimezone = await resolveExperienceTimezone(db, site.organization_id, siteId, experience)
  if (isDateBeforeTimezoneToday(bookingDate, experienceTimezone)) {
    return jsonResponse({ error: 'Booking date must be today or in the future' }, { status: 400 })
  }

  if (experience.location_id) {
    const location = await queryFirst<{ special_hours: string | null; timezone: string | null }>(
      db,
      `SELECT special_hours, timezone FROM business_locations WHERE id = ? LIMIT 1`,
      [experience.location_id],
    )
    if (location?.special_hours) {
      const [year, month, day] = bookingDate.split('-').map(Number) as [number, number, number]
      const closure = getActiveSpecialClosure(location.special_hours, location.timezone, { year, month, day })
      if (closure) {
        return jsonResponse({ error: 'This location is temporarily closed and not accepting bookings for the selected date.' }, { status: 409 })
      }
    }
  }

  if (!timeSlot) return jsonResponse({ error: 'A time slot is required' }, { status: 400 })
  const effectiveSlots = resolveEffectiveTimeSlots(experience, bookingDate)
    .filter((slot) => !isTimeSlotInPast(bookingDate, slot, experienceTimezone))
  if (effectiveSlots.length === 0) {
    return jsonResponse({ error: 'No available time slots for this date' }, { status: 400 })
  }
  if (!effectiveSlots.includes(timeSlot)) {
    return jsonResponse({ error: 'Invalid time slot' }, { status: 400 })
  }
  if (experience.max_capacity && partySize > experience.max_capacity) {
    return jsonResponse({ error: `Maximum party size for this experience is ${experience.max_capacity}` }, { status: 400 })
  }
  if (effectiveSlots.length) {
    const availability = await getSlotAvailability(db, siteId, experience, bookingDate, experienceTimezone)
    const slotAvailability = availability.find((s) => s.time_slot === timeSlot)
    if (slotAvailability?.is_closed) {
      return jsonResponse({ error: 'This time slot is closed for booking.' }, { status: 409 })
    }
    if (slotAvailability && slotAvailability.remaining !== null && partySize > slotAvailability.remaining) {
      return jsonResponse({ error: `Only ${Math.max(slotAvailability.remaining, 0)} spot(s) left for this time slot.` }, { status: 409 })
    }
  }

  // Rate limiting (skipped in dev so E2E tests can run repeatedly without hitting limits)
  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const emailHash = await hashIdentifier(guestEmail)

  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]

    const ipOk = await incrementHourlyRateLimit(db, `rate:xp-book:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)
    if (!ipOk) return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })

    const emailOk = await incrementHourlyRateLimit(db, `rate:xp-book:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)
    if (!emailOk) return jsonResponse({ error: 'Too many booking requests from this email. Please try again tomorrow.' }, { status: 429 })
  }

  const cancellation = createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)

  const booking = await createExperienceBooking(db, {
    experience_id: experience.id,
    organization_id: site.organization_id,
    site_id: siteId,
    location_id: experience.location_id,
    guest_name: guestName,
    guest_email: guestEmail,
    guest_phone: guestPhone || null,
    party_size: partySize,
    booking_date: bookingDate,
    time_slot: timeSlot,
    status: 'pending',
    notes: notes || null,
    ip_hash: ipHash,
    cancellation_token_hash: cancellationTokenHash,
    cancellation_token_expires_at: cancellation.expiresAt,
  })

  try {
    const { contactPhone, contactEmail } = await resolveLocationContact(db, siteId, experience.location_id)
    const platformDomain = getPlatformDomain(env)
    const siteBaseUrl = site.public_url?.replace(/\/$/, '') || (site.subdomain ? `https://${site.subdomain}.${platformDomain}` : null)
    const cancelUrl = siteBaseUrl ? `${siteBaseUrl}/experiences/cancel?id=${booking.id}#${cancellation.token}` : null
    await notifyExperienceBookingCreated(env, db, {
      organizationId: site.organization_id,
      siteId,
      siteName: site.brand_name,
      locationId: experience.location_id,
      bookingId: booking.id,
      guestName,
      email: guestEmail,
      guestPhone,
      experienceTitle: experience.title,
      bookingDate,
      timeSlot,
      partySize,
      notes: notes || null,
      cancelUrl,
      contactPhone,
      contactEmail,
    })
  } catch (error) {
    console.error('experience_booking_notification_failed', {
      organizationId: site.organization_id,
      siteId,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const policy = await resolveBookingPolicy(db, {
    siteId,
    policyType: 'experience',
    locationId: experience.location_id,
    experienceId: experience.id,
  })

  const requestedLocale = cleanString(body.locale, 10)
  const locale = requestedLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale)
    ? requestedLocale
    : await getSourceLocale(db, site.organization_id, siteId)

  return jsonResponse({
    success: true,
    booking_id: booking.id,
    cancellation_token: cancellation.token,
    message: `Your booking request for ${experience.title} on ${bookingDate} at ${fmt12Hour(timeSlot)} has been received. We'll confirm shortly.`,
    policy_summary: renderBookingPolicySummary(policy, locale),
  }, { status: 201 })
})
