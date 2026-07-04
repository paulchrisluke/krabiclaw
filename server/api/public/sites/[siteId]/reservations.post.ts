import { execute, queryFirst, type DbClient } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCreated } from '~/server/utils/notifications'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { resolveLocationTimezone, isDateBeforeTimezoneToday, isTimeSlotInPast } from '~/server/utils/site-config'
import { generateReservationTimes, isStructuredOpeningHours } from '~/shared/reservation-hours'
import { getReservationSlotAvailability } from '~/server/utils/reservations'
import { renderBookingPolicySummary, resolveBookingPolicy } from '~/server/utils/booking-policies'
import { getSourceLocale } from '~/server/utils/site-locales'

const IP_HOURLY_LIMIT = 5
const EMAIL_DAILY_LIMIT = 3

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.toLowerCase().trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getClientIp(event: ApiValue): string {
  const cfIp = getHeader(event, 'CF-Connecting-IP')
  return cfIp || 'unknown'
}

async function incrementRateLimit(db: DbClient, key: string, limit: number, expireMs: number): Promise<boolean> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + expireMs).toISOString()
  const result = await execute(db,
    `INSERT INTO rate_limits (key, count, updated_at, expires_at) VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.expires_at IS NULL OR rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         expires_at = CASE WHEN rate_limits.expires_at IS NULL OR rate_limits.expires_at <= ? THEN ? ELSE rate_limits.expires_at END,
         updated_at = ?
       WHERE (CASE WHEN rate_limits.expires_at IS NULL OR rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END) <= ?`,
    [key, now, expiresAt, now, now, expiresAt, now, now, limit],
  )
  return Boolean(result?.success && result?.meta?.changes)
}

// Fallback used only when a location has no structured opening_hours (e.g. Google Places imports,
// which store hours as free-text weekday descriptions that can't be parsed into slots).
const FALLBACK_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const VALID_GUESTS = ['1','2','3','4','5','6','7','8+']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  let body: ApiRecord
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const name       = cleanString(body.name, 100)
  const email      = cleanString(body.email, 200)
  let phone = cleanString(body.phone, 30)
  if (phone) {
    try {
      const { normalizePhone } = await import('~/server/utils/whatsapp')
      phone = normalizePhone(phone)
    } catch { /* fallback to raw if unparseable */ }
  }
  const date       = cleanString(body.date, 10)
  const time       = cleanString(body.time, 5)
  const guests     = cleanString(body.guests, 3)
  const requests   = cleanString(body.requests, 1000)
  const locationId: string | null = cleanString(body.location_id, 36) || null

  if (!name) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!phone) return jsonResponse({ error: 'Please enter your phone number.' }, { status: 400 })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })
  if (!time || !TIME_PATTERN.test(time))
    return jsonResponse({ error: 'Please choose a valid time.' }, { status: 400 })
  if (!VALID_GUESTS.includes(guests))
    return jsonResponse({ error: 'Please choose a valid party size.' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name?: string | null; public_url?: string | null; subdomain?: string | null }>(
    db,
    'SELECT id, organization_id, brand_name, public_url, subdomain FROM sites WHERE id = ? AND status = ? LIMIT 1',
    [siteId, 'active'],
  )
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  // Location is always required — there is no site shape where a reservation isn't tied to a
  // specific room/location, so this never silently falls back to a "primary" or first location.
  if (!locationId) return jsonResponse({ error: 'Please choose a location.' }, { status: 400 })
  const resolvedLocationId = locationId

  const location = await queryFirst<{ title: string | null; opening_hours: string | null; max_capacity: number | null }>(
    db,
    'SELECT title, opening_hours, max_capacity FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1',
    [resolvedLocationId, siteId],
  )
  if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })

  const reservationTimezone = await resolveLocationTimezone(db, site.organization_id, siteId, resolvedLocationId)
  if (isDateBeforeTimezoneToday(date, reservationTimezone))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })

  let parsedHours: unknown = null
  let parseFailed = false
  if (location.opening_hours) {
    try {
      parsedHours = JSON.parse(location.opening_hours)
    } catch {
      parseFailed = true
    }
  }
  if (parseFailed) {
    return jsonResponse({ error: 'Location hours configuration is invalid. Please contact support.' }, { status: 500 })
  }
  const validTimes = (isStructuredOpeningHours(parsedHours) ? generateReservationTimes(parsedHours, date) : FALLBACK_TIMES)
    .filter((slot) => !isTimeSlotInPast(date, slot, reservationTimezone))
  if (!validTimes.includes(time))
    return jsonResponse({ error: 'Please choose a valid time — this location is closed at that time.' }, { status: 400 })

  // Party size + capacity used by the atomic insert guard below — capacity enforcement is
  // skipped entirely (party size stays null) when the location has no max_capacity, matching
  // getReservationSlotAvailability's unlimited-capacity behavior (remaining === null).
  let partySizeForCapacityCheck: number | null = null
  if (isStructuredOpeningHours(parsedHours)) {
    const availability = await getReservationSlotAvailability(db, siteId, { id: resolvedLocationId, max_capacity: location.max_capacity, opening_hours: parsedHours }, date, reservationTimezone)
    const slotAvailability = availability.find((s) => s.time_slot === time)
    if (slotAvailability?.is_closed) {
      return jsonResponse({ error: 'This time is closed for booking.' }, { status: 409 })
    }
    const partySize = guests === '8+' ? 8 : Number.parseInt(guests, 10)
    if (slotAvailability && slotAvailability.remaining !== null && partySize > slotAvailability.remaining) {
      return jsonResponse({ error: `Only ${Math.max(slotAvailability.remaining, 0)} spot(s) left at this time.` }, { status: 409 })
    }
    if (location.max_capacity != null) partySizeForCapacityCheck = partySize
  }

  const id = crypto.randomUUID()
  const clientIp = getClientIp(event)
  const ipHash = await hashIp(clientIp)
  const emailHash = await hashValue(email)
  const cancellation = createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)

  // Rate limiting (skipped in dev so local work and E2E can submit repeatedly)
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]

    const ipOk = await incrementRateLimit(db, `rate:reservation:ip:${await hashValue(clientIp)}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)
    if (!ipOk) return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })

    const emailOk = await incrementRateLimit(db, `rate:reservation:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)
    if (!emailOk) return jsonResponse({ error: 'Too many reservation requests from this email. Please try again tomorrow.' }, { status: 429 })
  }

  // Single atomic statement: the capacity re-check and the insert happen in one SQL statement
  // (D1/SQLite guarantees single-statement atomicity even without BEGIN/COMMIT support — see
  // CLAUDE.md "D1 does not support raw transactions") so a concurrent request can't slip in
  // between a separate read and write. When partySizeForCapacityCheck is null (no max_capacity,
  // or unstructured hours), the WHERE clause is unconditionally true and the insert always runs.
  const insertResult = await execute(db, `
    INSERT INTO reservation_submissions (
      id, organization_id, site_id, name, email, phone, date, time, guests, requests, ip_hash,
      cancellation_token_hash, cancellation_token_expires_at, location_id
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? IS NULL OR (
      COALESCE((
        SELECT SUM(CASE WHEN guests = '8+' THEN 8 ELSE CAST(guests AS INTEGER) END)
        FROM reservation_submissions
        WHERE location_id = ? AND date = ? AND time = ? AND status != 'cancelled'
      ), 0) + ? <= ?
    )
  `, [
    id,
    site.organization_id,
    siteId,
    name,
    email,
    phone,
    date,
    time,
    guests,
    requests || null,
    ipHash,
    cancellationTokenHash,
    cancellation.expiresAt,
    resolvedLocationId,
    partySizeForCapacityCheck,
    resolvedLocationId,
    date,
    time,
    partySizeForCapacityCheck,
    location.max_capacity,
  ])

  if (!insertResult?.meta?.changes) {
    return jsonResponse({ error: 'This time is no longer available. Please choose another time.' }, { status: 409 })
  }

  // Build absolute cancel URL for the confirmation email
  const siteBaseUrl = site.public_url?.replace(/\/$/, '') || (site.subdomain ? `https://${site.subdomain}.krabiclaw.com` : null)
  const cancelUrl = siteBaseUrl ? `${siteBaseUrl}/reservations/cancel?id=${id}#${cancellation.token}` : null

  // Resolve contact info — location-specific when available, site-level fallback
  const { contactPhone, contactEmail } = await resolveLocationContact(db, siteId, resolvedLocationId)

  try {
    await notifyReservationCreated(env, db, {
      organizationId: site.organization_id,
      siteId,
      siteName: site.brand_name,
      locationId: resolvedLocationId,
      locationName: location.title,
      reservationId: id,
      guestName: name,
      email,
      phone,
      date,
      time,
      guests,
      requests,
      cancelUrl,
      contactPhone,
      contactEmail,
    })
  } catch (error) {
    console.error('reservation_notification_failed', {
      organizationId: site.organization_id,
      siteId,
      reservationId: id,
      error: error instanceof Error ? error.message : String(error)
    })
  }

  const policy = await resolveBookingPolicy(db, {
    siteId,
    policyType: 'reservation',
    locationId: resolvedLocationId,
  })

  const requestedLocale = cleanString(body.locale, 10)
  const locale = requestedLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale)
    ? requestedLocale
    : await getSourceLocale(db, site.organization_id, siteId)

  return jsonResponse({
    success: true,
    id,
    cancellationToken: cancellation.token,
    message: 'Your reservation request has been received. We will confirm shortly.',
    policy_summary: renderBookingPolicySummary(policy, locale),
  }, { status: 201 })
})
