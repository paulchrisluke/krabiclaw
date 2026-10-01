import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { CapacityUnavailableError, claimSessionCapacity, requireBookingConfig } from '~/server/utils/availability'
import { cloudflareEnv, jsonResponse, cleanString, readRequiredBody } from '~/server/utils/api-response'
import { isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { notifyBookingCreated, raiseSettledFailures } from '~/server/utils/notifications'
import { measurementOutcome, readPageEventId, recordOrganizationConversionEvent } from '~/server/utils/organization-conversions'
import { resolveLocationContact } from '~/server/utils/contact-resolution'
import { parsePhone } from '~/utils/phone'
import { queryAll, queryFirst } from '~/server/db'
import { productPolicySummarySource, renderBookingPolicySummary } from '~/server/utils/reservations'
import { getProduct, resolveVariantPrice } from '~/server/utils/product-management'
import { isCurrencyCode } from '~/shared/currencies'
import { getSourceLocale } from '~/server/utils/organization-locales'
import { buildOwnerThreadInboxUrl } from '~/server/utils/dashboard-notification-links'
import { createReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { ensureInteractionUser } from '~/server/utils/auth'
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
  const organizationId = event.context.organizationId as string | null | undefined
  const slug = getRouterParam(event, 'slug')
  if (!organizationId || !slug) return jsonResponse({ error: 'organizationId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const organization = await queryFirst<{ id: string; name: string | null; default_currency: string; public_url: string | null }>(db, `SELECT id, name, default_currency, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active') AS public_url FROM organization WHERE id = ? AND status = 'active' LIMIT 1`, [organizationId])
  if (!organization) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const product = await queryFirst<{ id: string; name: string }>(db, `
    SELECT p.id, p.name FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      JOIN product_booking_configs cfg ON cfg.product_id = p.id
     WHERE pub.organization_id = ? AND pub.published = 1 AND p.slug = ? AND p.active = 1 LIMIT 1
  `, [organizationId, slug])
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
  const pageEventId = readPageEventId(body.page_event_id)
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
           JOIN business_locations l ON l.id = pl.location_id AND l.organization_id = ? AND l.status = 'active'
          WHERE pl.product_id = s.product_id AND pl.location_id = s.location_id
            AND pl.active = 1 AND pl.published = 1
       ))
  `, [sessionId, product.id, organization.id, organizationId])
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
  `, [product.id, organization.id])
  if (variants.length === 0) return jsonResponse({ error: 'This product has no bookable option' }, { status: 409 })
  if (requestedVariantId && !variants.some(variant => variant.id === requestedVariantId)) {
    return jsonResponse({ error: 'That option is not available for this product' }, { status: 400 })
  }
  if (!requestedVariantId && variants.length > 1) {
    return jsonResponse({ error: 'Choose an option before booking' }, { status: 400 })
  }
  const productVariantId = requestedVariantId || variants[0]!.id

  const full = await getProduct(db, organization.id, product.id)
  const config = await requireBookingConfig(db, organization.id, product.id)
  if (config.online_payment_required) {
    if (!isCurrencyCode(organization.default_currency)) throw new Error(`Unsupported organization currency: ${organization.default_currency}`)
    const variant = full.variants.find(candidate => candidate.id === productVariantId)
    if (!variant) throw new Error('The selected variant is missing')
    const price = resolveVariantPrice(variant, { currency: organization.default_currency, location_id: session.location_id, at: new Date().toISOString() })
    if (!price) return jsonResponse({ error: 'A valid Price is required for this offering', code: 'price_unavailable' }, { status: 409 })
    if (price.unit_amount > 0) return jsonResponse({ error: 'Online payment is required to request this appointment', code: 'payment_required' }, { status: 409 })
  }
  const bookingStatus = config.confirmation_mode === 'review' ? 'pending' : 'confirmed'


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
  // The person is the Better Auth user; what they typed stays on the thread as
  // this booking's guest snapshot and is never copied onto that user.
  const userId = await ensureInteractionUser(event, env)

  const now = new Date().toISOString()
  const threadId = crypto.randomUUID()
  const payload = threadPayloadForGuest({ name: guestName, email: guestEmail, phone: normalizedGuestPhone, notes, ipHash })
  payload.cancellation = { token_hash: cancellationTokenHash, expires_at: cancellation.expiresAt, used_at: null }

  let operationalBookingId: string
  try {
    // The seat is claimed first, and the thread is written only where that
    // claim landed: a claim that finds the session full inserts nothing and
    // raises nothing, so a thread written ahead of it would commit on its own.
    // The booking takes its request id once the thread exists.
    const claim = await claimSessionCapacity(db, {
      organizationId: organization.id, productId: product.id, sessionId: session.id,
      productVariantId, partySize, userId, requestId: null,
      following: bookingId => [
        ...requestInsertQueries({
          kind: 'booking', id: threadId, organization_id: organization.id,
          location_id: session.location_id, user_id: userId, review_id: null,
          conversation_state: 'needs_attention', resolved_at: null, payload,
          created_at: now, updated_at: now,
        }, { query: 'SELECT 1 FROM bookings WHERE id = ?', params: [bookingId] }),
        {
          query: `UPDATE bookings SET request_id = ?, updated_at = ?
                   WHERE id = ? AND EXISTS (SELECT 1 FROM requests WHERE id = ?)`,
          params: [threadId, now, bookingId, threadId],
        },
        {
          query: `INSERT INTO activity_entries (id, request_id, kind, scope_kind, actor_kind, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
                  SELECT ?, request_id, 'operation', 'request', 'system', 'booking.created',
                    json_object('operational_booking_id', id, 'request_id', request_id, 'afterStatus', status), ?,
                    COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id = bookings.request_id), 0) + 1, ?, ?
                  FROM bookings WHERE id = ? AND request_id IS NOT NULL`,
          params: [crypto.randomUUID(), `booking:${bookingId}:created`, now, now, bookingId],
        },
      ],
    })
    operationalBookingId = claim.bookingId
  } catch (error) {
    // Nothing to roll back: the batch either applied whole or not at all.
    if (!(error instanceof CapacityUnavailableError)) throw error
    return jsonResponse({ error: 'This session just filled up. Please pick another time.' }, { status: 409 })
  }

  await publishGuestInboxThreadEvent(env, db, { threadId, type: 'thread.created' })

  // One instant, one zone: the message the guest reads and the record the
  // host sees are formatted from the same session row.
  const whenLabel = new Intl.DateTimeFormat('en-US', { timeZone: session.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at)) + (session.location_id === null ? ` (${session.timezone})` : '')
  const [{ contactPhone, contactEmail }, ownerInboxUrl] = await Promise.all([
    resolveLocationContact(db, organizationId, session.location_id),
    buildOwnerThreadInboxUrl(env, db, { organizationId: organization.id, locationId: session.location_id ?? undefined, threadId }),
  ])
  const organizationBaseUrl = organization.public_url?.replace(/\/$/, '')
  const cancelUrl = organizationBaseUrl ? `${organizationBaseUrl}/bookings/cancel?id=${threadId}#${cancellation.token}` : null
  // Telling the owner and recording the conversion are independent, so both are
  // attempted before either failure is raised: running the notification first
  // meant a failed dispatch silently cost the tenant the conversion record too.
  // The measurement of a committed booking, quote included. The value the guest is shown is
  // snapshotted here, after the commit: a later price edit never revalues this booking or a retried
  // event, and a quote that cannot be resolved is a measurement failure reported beside the
  // committed booking, never a reason the booking was not made. Seats are priced per person, as the
  // product page states, so the quoted amount is unit price x seats. A variant with no offer has an
  // unknown value, not a zero one.
  const recordBookingMeasurement = async () => {
    if (!isCurrencyCode(organization.default_currency)) throw new Error(`Unsupported organization currency: ${organization.default_currency}`)
    const variant = full.variants.find(candidate => candidate.id === productVariantId)
    if (!variant) throw new Error(`Variant ${productVariantId} missing from product ${product.id}`)
    const offer = resolveVariantPrice(variant, { currency: organization.default_currency, location_id: session.location_id, at: new Date().toISOString() })
    const quotedValue = offer ? {
      basis: 'quoted' as const,
      amount_minor: offer.unit_amount * partySize,
      currency: offer.currency,
      items: [{ item_id: product.id, item_name: product.name, item_variant: variant.name, amount_minor: offer.unit_amount * partySize, quantity: partySize }],
    } : null
    const recorded = await recordOrganizationConversionEvent(db, event.req, {
      organizationId: organization.id, eventName: 'booking_submit', stage: 'submitted', surface: 'website',
      locationId: session.location_id, entityType: 'request', entityId: threadId,
      productId: product.id, variantId: productVariantId,
      pageType: 'product', routePath: `/products/${slug}`, value: quotedValue, originEventId: pageEventId,
    })
    return { ...recorded, quotedValue }
  }

  const requestedLocale = cleanString(body.locale, 10)
  const [locale, ...followUps] = await Promise.all([
    requestedLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale) ? requestedLocale : getSourceLocale(db, organization.id),
    ...await Promise.allSettled([
      notifyBookingCreated(env, db, {
        organizationId: organization.id, organizationName: organization.name, locationId: session.location_id,
        bookingId: threadId, status: bookingStatus, guestName, email: guestEmail, guestPhone: normalizedGuestPhone,
        productId: product.id, productTitle: product.name, startsAt: session.starts_at, timezone: session.timezone,
        partySize, notes: notes || null,
        cancelUrl, contactPhone, contactEmail, ownerInboxUrl,
      }),
      recordBookingMeasurement(),
    ]),
  ])
  // Only the owner notification can fail the request. Measurement is reported beside the
  // committed result: a guest told a confirmed submission failed would submit again.
  raiseSettledFailures('booking follow-up', `bookingId ${threadId}`, followUps.slice(0, 1),
    ['notifyBookingCreated'])
  const measurement = measurementOutcome(followUps[1]!)
  const quotedValueOf = (result: PromiseSettledResult<unknown>) => result.status === 'fulfilled' ? (result.value as { quotedValue: unknown }).quotedValue : null

  return jsonResponse({
    success: true, booking_id: threadId, request_id: threadId, operational_booking_id: operationalBookingId, status: bookingStatus, cancellation_token: cancellation.token, quoted_value: quotedValueOf(followUps[1]!), measurement,
    message: bookingStatus === 'pending' ? `Your request for ${product.name} on ${whenLabel} is awaiting review.` : `Your booking for ${product.name} on ${whenLabel} is confirmed.`,
    policy_summary: renderBookingPolicySummary(productPolicySummarySource(full.metafields), locale),
  }, { status: 201 })
})
