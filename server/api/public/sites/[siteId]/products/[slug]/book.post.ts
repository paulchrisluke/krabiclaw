import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { CapacityUnavailableError, claimSessionCapacity } from '~/server/utils/availability'
import { cloudflareEnv, jsonResponse, cleanString, readRequiredBody } from '~/server/utils/api-response'
import { isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { notifyBookingCreated } from '~/server/utils/notifications'
import { recordSubmissionConversionSafe } from '~/server/utils/site-conversions'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { parsePhone } from '~/utils/phone'
import { queryAll, queryFirst } from '~/server/db'
import { productPolicySummarySource, renderBookingPolicySummary } from '~/server/utils/reservations'
import { getProduct } from '~/server/utils/product-management'
import { getSourceLocale } from '~/server/utils/site-locales'
import { buildOwnerThreadInboxUrl } from '~/server/utils/dashboard-notification-links'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { deleteCustomerIfUnlinked, findOrCreateCustomer, recordCustomerBooking } from '~/server/utils/customers'
import { getAuthSession } from '~/server/utils/auth'
import { requestInsertQueries, threadPayloadForGuest } from '~/server/domain/requests'
import { DEFAULT_EMAIL_DAILY_LIMIT as EMAIL_DAILY_LIMIT, DEFAULT_IP_HOURLY_LIMIT as IP_HOURLY_LIMIT, getClientIp, hashClientIp, hashIdentifier, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Claim seats on a session.
 *
 * The guest names a SESSION, not a date and a time: the occurrence is a real
 * row, so there is nothing to re-derive and nothing to disagree about. The
 * claim carries its own capacity predicate, so this route does no
 * check-then-write — the insert either takes the seats or takes none.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name: string | null; public_url: string | null }>(db, `SELECT id, organization_id, brand_name, (SELECT 'https://' || domain FROM site_domains WHERE site_id = sites.id AND role = 'canonical' AND status = 'active') AS public_url FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const product = await queryFirst<{ id: string; name: string }>(db, `
    SELECT p.id, p.name FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      JOIN product_booking_configs cfg ON cfg.product_id = p.id
     WHERE pub.site_id = ? AND pub.published = 1 AND p.slug = ? AND p.active = 1 LIMIT 1
  `, [siteId, slug])
  if (!product) return jsonResponse({ error: 'Product not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await readRequiredBody<Record<string, unknown>>(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const guestName = cleanString(body.guest_name, 100)
  const guestEmail = cleanString(body.guest_email, 254)
  const guestPhone = cleanString(body.guest_phone, 30)
  let normalizedGuestPhone: string | null = null
  if (guestPhone) {
    const parsedPhone = parsePhone(guestPhone, { defaultCountry: 'TH' })
    if (!parsedPhone.valid || !parsedPhone.e164) return jsonResponse({ error: 'A valid phone number is required.' }, { status: 400 })
    normalizedGuestPhone = parsedPhone.e164
  }
  const sessionId = cleanString(body.session_id, 64)
  const requestedVariantId = cleanString(body.variant_id, 64)
  const notes = cleanString(body.notes, 1000)
  const partySizeValue = typeof body.party_size === 'number' || typeof body.party_size === 'string' ? Number(body.party_size) : Number.NaN
  if (!Number.isInteger(partySizeValue) || partySizeValue < 1 || partySizeValue > 99) {
    return jsonResponse({ error: 'Party size must be a whole number between 1 and 99.' }, { status: 400 })
  }
  const partySize = partySizeValue

  if (!guestName) return jsonResponse({ error: 'Name is required' }, { status: 400 })
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return jsonResponse({ error: 'A valid email address is required' }, { status: 400 })
  // Reserved test domains (example.com and friends) hard-bounce and must never
  // be accepted where the environment sends real email.
  if (shouldSendRealEmail(env) && isReservedTestDomain(guestEmail)) return jsonResponse({ error: 'Please enter a real email address.' }, { status: 422 })
  if (!sessionId) return jsonResponse({ error: 'A session is required' }, { status: 400 })

  const session = await queryFirst<{ id: string; location_id: string | null; starts_at: string; timezone: string }>(db, `
    SELECT s.id, s.location_id, s.starts_at, s.timezone
      FROM product_sessions s
     WHERE s.id = ? AND s.product_id = ? AND s.organization_id = ? AND s.status = 'scheduled'
       -- A branch that has stopped selling this product does not take seats
       -- for it, whatever the site and the product itself still say.
       AND (s.location_id IS NULL OR EXISTS (
         SELECT 1 FROM product_locations pl
           JOIN business_locations l ON l.id = pl.location_id AND l.site_id = ? AND l.status = 'active'
          WHERE pl.product_id = s.product_id AND pl.location_id = s.location_id
            AND pl.active = 1 AND pl.published = 1
       ))
  `, [sessionId, product.id, site.organization_id, siteId])
  if (!session) return jsonResponse({ error: 'That session is not open for booking' }, { status: 404 })

  // What is being bought is a variant. Adult and child seats, or a class and
  // its private package, are different things at different prices, so the
  // guest's choice is carried here — never resolved by sort order. One active
  // variant is not a choice; several with none named is a request that cannot
  // be filled.
  const variants = await queryAll<{ id: string }>(db, `
    SELECT id FROM product_variants
     WHERE product_id = ? AND organization_id = ? AND active = 1
     ORDER BY sort_order, id
  `, [product.id, site.organization_id])
  if (variants.length === 0) return jsonResponse({ error: 'This product has no bookable option' }, { status: 409 })
  if (requestedVariantId && !variants.some(variant => variant.id === requestedVariantId)) {
    return jsonResponse({ error: 'That option is not available for this product' }, { status: 400 })
  }
  if (!requestedVariantId && variants.length > 1) {
    return jsonResponse({ error: 'Choose an option before booking' }, { status: 400 })
  }
  const productVariantId = requestedVariantId || variants[0]!.id

  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const emailHash = await hashIdentifier(guestEmail)
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]
    if (!await incrementHourlyRateLimit(db, `rate:book:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)) {
      return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }
    if (!await incrementHourlyRateLimit(db, `rate:book:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)) {
      return jsonResponse({ error: 'Too many booking requests from this email. Please try again tomorrow.' }, { status: 429 })
    }
  }

  const cancellation = createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)
  const authSession = await getAuthSession(event, env)
  const customerInput = {
    organizationId: site.organization_id, siteId, name: guestName, email: guestEmail,
    phone: normalizedGuestPhone, source: 'booking', userId: authSession?.user?.id || null,
  } as const
  const customer = await findOrCreateCustomer(db, customerInput)

  const now = new Date().toISOString()
  const threadId = crypto.randomUUID()
  const payload = threadPayloadForGuest({ name: guestName, email: guestEmail, phone: normalizedGuestPhone, notes, ipHash })
  payload.cancellation = { token_hash: cancellationTokenHash, expires_at: cancellation.expiresAt, used_at: null }

  try {
    // The seat is claimed first, and the thread is written only where that
    // claim landed: a claim that finds the session full inserts nothing and
    // raises nothing, so a thread written ahead of it would commit on its own.
    // The booking takes its request id once the thread exists.
    await claimSessionCapacity(db, {
      organizationId: site.organization_id, siteId, productId: product.id, sessionId: session.id,
      productVariantId, partySize, customerId: customer.id, requestId: null,
      following: bookingId => [
        ...requestInsertQueries({
          kind: 'booking', id: threadId, organization_id: site.organization_id, site_id: siteId,
          location_id: session.location_id, customer_id: customer.id, review_id: null,
          conversation_state: 'needs_attention', resolved_at: null, payload,
          created_at: now, updated_at: now,
        }, { query: 'SELECT 1 FROM bookings WHERE id = ?', params: [bookingId] }),
        {
          query: `UPDATE bookings SET request_id = ?, updated_at = ?
                   WHERE id = ? AND EXISTS (SELECT 1 FROM requests WHERE id = ?)`,
          params: [threadId, now, bookingId, threadId],
        },
      ],
    })
  } catch (error) {
    // Nothing to roll back: the batch either applied whole or not at all. The
    // customer row is the exception — it was written before this.
    if (customer.created) await deleteCustomerIfUnlinked(db, customer.id)
    if (!(error instanceof CapacityUnavailableError)) throw error
    return jsonResponse({ error: 'This session just filled up. Please pick another time.' }, { status: 409 })
  }

  await recordCustomerBooking(db, customer.id, customerInput)
  await publishGuestInboxThreadEvent(env, db, { threadId, type: 'thread.created' })

  // One instant, one zone: the message the guest reads and the record the
  // host sees are formatted from the same session row.
  const whenLabel = new Intl.DateTimeFormat('en-US', { timeZone: session.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))
  try {
    const [{ contactPhone, contactEmail }, ownerInboxUrl] = await Promise.all([
      resolveLocationContact(db, siteId, session.location_id),
      buildOwnerThreadInboxUrl(env, db, { organizationId: site.organization_id, siteId, locationId: session.location_id ?? undefined, threadId }),
    ])
    const siteBaseUrl = site.public_url?.replace(/\/$/, '')
    const cancelUrl = siteBaseUrl ? `${siteBaseUrl}/bookings/cancel?id=${threadId}#${cancellation.token}` : null
    await notifyBookingCreated(env, db, {
      organizationId: site.organization_id, siteId, siteName: site.brand_name, locationId: session.location_id,
      bookingId: threadId, guestName, email: guestEmail, guestPhone: normalizedGuestPhone,
      productTitle: product.name, startsAt: session.starts_at, timezone: session.timezone,
      partySize, notes: notes || null,
      cancelUrl, contactPhone, contactEmail, ownerInboxUrl,
    })
  } catch (error) {
    console.error('booking_notification_failed', { organizationId: site.organization_id, siteId, threadId, error: error instanceof Error ? error.message : String(error) })
  }

  const requestedLocale = cleanString(body.locale, 10)
  const [full, locale] = await Promise.all([
    // The policy the guest is shown is the product's own attribute. There is
    // no site or location policy merged underneath it.
    getProduct(db, site.organization_id, product.id),
    requestedLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale) ? requestedLocale : getSourceLocale(db, site.organization_id, siteId),
    recordSubmissionConversionSafe(db, event, {
      organizationId: site.organization_id, siteId, eventName: 'booking_submit', stage: 'submitted',
      locationId: session.location_id, entityType: 'request', entityId: threadId,
      pageType: 'product', pagePath: `/products/${slug}`,
    }),
  ])

  return jsonResponse({
    success: true, booking_id: threadId, cancellation_token: cancellation.token,
    message: `Your booking request for ${product.name} on ${whenLabel} has been received. We'll confirm shortly.`,
    policy_summary: renderBookingPolicySummary(productPolicySummarySource(full.metafields), locale),
  }, { status: 201 })
})
