import { cloudflareEnv, jsonResponse, cleanString } from '~/server/utils/api-response'
import { getExperienceBySlug, createExperienceBooking } from '~/server/utils/experiences'
import { notifyExperienceBookingCreated } from '~/server/utils/notifications'

const IP_HOURLY_LIMIT = 5
const EMAIL_DAILY_LIMIT = 3

async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.toLowerCase().trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getClientIp(event: ApiValue): string {
  const fwd = event.node?.req?.headers?.['x-forwarded-for']
  const forwardedFor = Array.isArray(fwd) ? fwd.join(',') : String(fwd || '')
  return forwardedFor.split(',').map((p: string) => p.trim()).find(Boolean)
    || event.node?.req?.socket?.remoteAddress
    || 'unknown'
}

async function incrementRateLimit(db: D1Database, key: string, limit: number, expireMs: number): Promise<boolean> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + expireMs).toISOString()
  const result = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, updated_at, expires_at) VALUES (?, 1, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         expires_at = CASE WHEN rate_limits.expires_at <= ? THEN ? ELSE rate_limits.expires_at END,
         updated_at = ?
       WHERE (CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END) <= ?`,
    )
    .bind(key, now, expiresAt, now, now, expiresAt, now, now, limit)
    .run()
  return Boolean(result?.success && result?.meta?.changes)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await db
    .prepare(`SELECT id, organization_id, brand_name FROM sites WHERE id = ? AND status = 'active' LIMIT 1`)
    .bind(siteId)
    .first<{ id: string; organization_id: string; brand_name: string | null }>()
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
  const guestPhone = cleanString(body.guest_phone, 30)
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
  if (new Date(bookingDate) < new Date(new Date().toISOString().split('T')[0]!)) {
    return jsonResponse({ error: 'Booking date must be today or in the future' }, { status: 400 })
  }
  if (!timeSlot) return jsonResponse({ error: 'A time slot is required' }, { status: 400 })
  if (experience.time_slots?.length && !experience.time_slots.includes(timeSlot)) {
    return jsonResponse({ error: 'Invalid time slot' }, { status: 400 })
  }
  if (experience.max_capacity && partySize > experience.max_capacity) {
    return jsonResponse({ error: `Maximum party size for this experience is ${experience.max_capacity}` }, { status: 400 })
  }

  // Rate limiting (skipped in dev so E2E tests can run repeatedly without hitting limits)
  const clientIp = getClientIp(event)
  const ipHash = await hashValue(clientIp)
  const emailHash = await hashValue(guestEmail)

  if (!import.meta.dev) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]

    const ipOk = await incrementRateLimit(db, `rate:xp-book:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)
    if (!ipOk) return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })

    const emailOk = await incrementRateLimit(db, `rate:xp-book:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)
    if (!emailOk) return jsonResponse({ error: 'Too many booking requests from this email. Please try again tomorrow.' }, { status: 429 })
  }

  const booking = await createExperienceBooking(db, {
    experience_id: experience.id,
    organization_id: site.organization_id,
    site_id: siteId,
    guest_name: guestName,
    guest_email: guestEmail,
    guest_phone: guestPhone || null,
    party_size: partySize,
    booking_date: bookingDate,
    time_slot: timeSlot,
    status: 'pending',
    notes: notes || null,
    ip_hash: ipHash,
  })

  try {
    await notifyExperienceBookingCreated(env, db, {
      organizationId: site.organization_id,
      siteId,
      siteName: site.brand_name,
      bookingId: booking.id,
      guestName,
      email: guestEmail,
      guestPhone,
      experienceTitle: experience.title,
      bookingDate,
      timeSlot,
      partySize,
    })
  } catch (error) {
    console.error('experience_booking_notification_failed', {
      organizationId: site.organization_id,
      siteId,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return jsonResponse({
    success: true,
    booking_id: booking.id,
    message: `Your booking request for ${experience.title} on ${bookingDate} at ${timeSlot} has been received. We'll confirm shortly.`,
  }, { status: 201 })
})
