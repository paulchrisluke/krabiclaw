import { requestInsertQueries, threadPayloadForGuest } from '~/server/domain/requests'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { notifyReservationCreated } from '~/server/utils/notifications'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { resolveLocationTimezone, isDateBeforeTimezoneToday } from '~/server/utils/site-config'
import {
  claimReservation,
  listReservationSlots,
  renderBookingPolicySummary,
  requireLocationReservationConfig,
  reservationPolicySummarySource,
  ReservationUnavailableError,
} from '~/server/utils/reservations'
import { getSourceLocale } from '~/server/utils/site-locales'
import { deleteCustomerIfUnlinked, findOrCreateCustomer, recordCustomerBooking } from '~/server/utils/customers'
import { getAuthSession } from '~/server/utils/auth'
import { DEFAULT_EMAIL_DAILY_LIMIT as EMAIL_DAILY_LIMIT, DEFAULT_IP_HOURLY_LIMIT as IP_HOURLY_LIMIT, getClientIp, hashClientIp, hashIdentifier, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { parsePhone } from '~/utils/phone'
import { recordSubmissionConversionSafe } from '~/server/utils/site-conversions'
import { buildOwnerThreadInboxUrl } from '~/server/utils/dashboard-notification-links'
import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'

const VALID_GUESTS = ['1', '2', '3', '4', '5', '6', '7', '8+']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = (await readBody(event)) ?? {} } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const name       = cleanString(body.name, 100)
  const email      = cleanString(body.email, 200)
  let phone = cleanString(body.phone, 30)
  if (phone) {
    const parsedPhone = parsePhone(phone, { defaultCountry: 'TH' })
    if (parsedPhone.valid && parsedPhone.e164) phone = parsedPhone.e164
    else return jsonResponse({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  const date       = cleanString(body.date, 10)
  const time       = cleanString(body.time, 5)
  const guests     = cleanString(body.guests, 3)
  const requests   = cleanString(body.requests, 1000)
  const locationId = typeof body.location_id === 'string' ? body.location_id.trim() : null

  if (!name) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400 })
  // Reserved test domains (example.com, wa-verify@example.com, etc.) are guaranteed to
  // hard-bounce and must never be accepted where the environment sends real email.
  if (shouldSendRealEmail(env) && isReservedTestDomain(email))
    return jsonResponse({ error: 'Please enter a real email address.' }, { status: 422 })
  if (!phone) return jsonResponse({ error: 'Please enter your phone number.' }, { status: 400 })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })
  if (!time || !TIME_PATTERN.test(time))
    return jsonResponse({ error: 'Please choose a valid time.' }, { status: 400 })
  if (!VALID_GUESTS.includes(guests))
    return jsonResponse({ error: 'Please choose a valid party size.' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name?: string | null; public_url?: string | null }>(
    db, `SELECT id, organization_id, brand_name, (SELECT 'https://' || domain FROM site_domains WHERE site_id = sites.id AND role = 'canonical' AND status = 'active') AS public_url FROM sites WHERE id = ? AND status = ? LIMIT 1`, [siteId, 'active'], )
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  const siteBaseUrl = site.public_url?.trim().replace(/\/$/, '')
  if (!siteBaseUrl) return jsonResponse({ error: 'Site public URL is not configured' }, { status: 500 })

  // Location is always required — there is no site shape where a reservation isn't tied to a
  // specific room/location, so this never silently falls back to a "primary" or first location.
  if (!locationId) return jsonResponse({ error: 'Please choose a location.' }, { status: 400 })
  const resolvedLocationId = locationId

  const location = await queryFirst<{ title: string | null; opening_hours: string | null; max_capacity: number | null }>(
    db, 'SELECT title, opening_hours, max_capacity FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1', [resolvedLocationId, siteId], )
  if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })

  const reservationTimezone = await resolveLocationTimezone(db, site.organization_id, siteId, resolvedLocationId)
  if (isDateBeforeTimezoneToday(date, reservationTimezone))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })

  const availability = await listReservationSlots(db, { organizationId: site.organization_id, locationId: resolvedLocationId, date })
  const slot = availability.slots.find(entry => entry.time_slot === time)
  if (!slot) return jsonResponse({ error: 'Please choose a valid time — this location is closed at that time.' }, { status: 400 })
  if (slot.is_closed) return jsonResponse({ error: 'This time is closed for booking.' }, { status: 409 })
  const partySize = guests === '8+' ? 8 : Number.parseInt(guests, 10)
  // An early answer so the form can say something useful. The claim below
  // carries its own predicate and is the authoritative one.
  if (slot.remaining !== null && partySize > slot.remaining) {
    return jsonResponse({ error: `Only ${Math.max(slot.remaining, 0)} spot(s) left at this time.` }, { status: 409 })
  }
  const id = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const emailHash = await hashIdentifier(email)
  const cancellation = createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)

  // Rate limiting (skipped in dev so local work and E2E can submit repeatedly) — runs before
  // customer creation so a rate-limited request never leaves behind an orphaned customer row.
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]

    const ipOk = await incrementHourlyRateLimit(db, `rate:reservation:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)
    if (!ipOk) return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })

    const emailOk = await incrementHourlyRateLimit(db, `rate:reservation:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)
    if (!emailOk) return jsonResponse({ error: 'Too many reservation requests from this email. Please try again tomorrow.' }, { status: 429 })
  }

  const session = await getAuthSession(event, env)
  const userId = session?.user?.id || null

  const customerInput = {
    organizationId: site.organization_id, siteId, name, email, phone, source: 'reservation', userId, } as const
  const customer = await findOrCreateCustomer(db, customerInput)

  const now = new Date().toISOString()
  const payload = threadPayloadForGuest({ name, email, phone, notes: requests, ipHash, partySizeIsMinimum: guests.endsWith('+') })
  payload.cancellation = { token_hash: cancellationTokenHash, expires_at: cancellation.expiresAt, used_at: null }

  // The reservation and its inbox thread commit in one batch, the thread
  // conditional on the claim: the claim's capacity predicate decides whether
  // the table is there, and nothing is left behind if it is not.
  const durationMinutes = 120
  try {
    await claimReservation(db, {
      organizationId: site.organization_id, siteId, locationId: resolvedLocationId,
      reservationId, requestId: id, customerId: customer.id,
      timezone: availability.timezone, startsAt: slot.starts_at,
      endsAt: new Date(Date.parse(slot.starts_at) + durationMinutes * 60_000).toISOString(),
      partySize, status: 'confirmed',
      thread: requestInsertQueries({
        id, kind: 'reservation', organization_id: site.organization_id, site_id: siteId,
        location_id: resolvedLocationId, customer_id: customer.id, review_id: null,
        conversation_state: 'needs_attention', resolved_at: null, payload, created_at: now, updated_at: now,
      }, { query: 'SELECT 1 FROM reservations WHERE id = ?', params: [reservationId] }),
    })
  } catch (error) {
    if (!(error instanceof ReservationUnavailableError)) throw error
    if (customer.created) await deleteCustomerIfUnlinked(db, customer.id)
    return jsonResponse({ error: 'This time is no longer available. Please choose another time.' }, { status: 409 })
  }
  await recordCustomerBooking(db, customer.id, customerInput)

  await publishGuestInboxThreadEvent(env, db, { threadId: id, type: 'thread.created' })

  // Build absolute cancel URL for the confirmation email
  const cancelUrl = `${siteBaseUrl}/reservations/cancel?id=${id}#${cancellation.token}`

  // Resolve contact info — location-specific when available, site-level fallback
  const [{ contactPhone, contactEmail }, ownerInboxUrl] = await Promise.all([
    resolveLocationContact(db, siteId, resolvedLocationId),
    buildOwnerThreadInboxUrl(env, db, {
      organizationId: site.organization_id,
      siteId,
      locationId: resolvedLocationId,
      threadId: id,
    }),
  ])

  try {
    await notifyReservationCreated(env, db, {
      organizationId: site.organization_id, siteId, siteName: site.brand_name, locationId: resolvedLocationId, locationName: location.title, reservationId: id, guestName: name, email, phone, date, time, guests, requests, cancelUrl, contactPhone, contactEmail, ownerInboxUrl, })
  } catch (error) {
    console.error('reservation_notification_failed', {
      organizationId: site.organization_id, siteId, reservationId: id, error: error instanceof Error ? error.message : String(error)
    })
  }

  const requestedLocale = cleanString(body.locale, 10)
  const [policy, locale] = await Promise.all([
    requireLocationReservationConfig(db, { organizationId: site.organization_id, locationId: resolvedLocationId }),
    requestedLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale)
      ? requestedLocale
      : getSourceLocale(db, site.organization_id, siteId),
    recordSubmissionConversionSafe(db, event, {
      organizationId: site.organization_id,
      siteId,
      eventName: 'reservation_submit',
      stage: 'submitted',
      locationId: resolvedLocationId,
      entityType: 'request',
      entityId: id,
      pageType: 'reservations',
      pagePath: '/reservations',
    }),
  ])

  return jsonResponse({
    success: true, id, cancellationToken: cancellation.token, message: 'Your reservation is confirmed.', policy_summary: renderBookingPolicySummary(reservationPolicySummarySource(policy), locale), }, { status: 201 })
})
