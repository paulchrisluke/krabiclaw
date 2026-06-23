import { execute, queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyReservationCreated } from '~/server/utils/notifications'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { resolveLocationTimezone, isDateBeforeTimezoneToday } from '~/server/utils/site-config'

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const VALID_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const VALID_GUESTS = ['1','2','3','4','5','6','7','8+']

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
  const phone      = cleanString(body.phone, 30)
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
  if (!VALID_TIMES.includes(time))
    return jsonResponse({ error: 'Please choose a valid time.' }, { status: 400 })
  if (!VALID_GUESTS.includes(guests))
    return jsonResponse({ error: 'Please choose a valid party size.' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name?: string | null; public_url?: string | null; subdomain?: string | null; primary_location_id: string | null }>(
    db,
    'SELECT id, organization_id, brand_name, public_url, subdomain, primary_location_id FROM sites WHERE id = ? AND status = ? LIMIT 1',
    [siteId, 'active'],
  )
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  let resolvedLocationId = locationId
  if (resolvedLocationId) {
    const location = await queryFirst<{ id: string }>(
      db,
      'SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1',
      [resolvedLocationId, siteId],
    )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  } else {
    resolvedLocationId = site.primary_location_id
      ?? (await queryFirst<{ id: string }>(
        db,
        'SELECT id FROM business_locations WHERE site_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1',
        [siteId],
      ))?.id
      ?? null
  }
  if (!resolvedLocationId) return jsonResponse({ error: 'This site has no location to reserve at.' }, { status: 400 })

  const reservationTimezone = await resolveLocationTimezone(db, site.organization_id, siteId, resolvedLocationId)
  if (isDateBeforeTimezoneToday(date, reservationTimezone))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })

  const id = crypto.randomUUID()
  const ipHash = await hashIp(getHeader(event, 'CF-Connecting-IP') ?? getHeader(event, 'x-forwarded-for') ?? '')
  const cancellation = createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)

  await execute(db, `
    INSERT INTO reservation_submissions (
      id, organization_id, site_id, name, email, phone, date, time, guests, requests, ip_hash,
      cancellation_token_hash, cancellation_token_expires_at, location_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  ])

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
      reservationId: id,
      guestName: name,
      email,
      phone,
      date,
      time,
      guests,
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

  return jsonResponse({
    success: true,
    id,
    cancellationToken: cancellation.token,
    message: 'Your reservation request has been received. We will confirm shortly.',
  }, { status: 201 })
})
