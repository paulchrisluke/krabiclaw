import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { CapacityUnavailableError, claimSessionCapacity, requireBookingConfig } from '~/server/utils/availability'
import { cloudflareEnv, cleanString } from '~/server/utils/api-response'
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
import { createReservationCancelToken, createReplayableReservationCancelToken, hashReservationCancelToken } from '~/server/utils/reservation-cancel-token'
import { ensureInteractionUser } from '~/server/utils/auth'
import { requestInsertQueries, threadPayloadForGuest } from '~/server/domain/requests'
import { DEFAULT_EMAIL_DAILY_LIMIT as EMAIL_DAILY_LIMIT, DEFAULT_IP_HOURLY_LIMIT as IP_HOURLY_LIMIT, getClientIp, hashClientIp, hashIdentifier, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { resolveBookingPresentation } from '~/utils/booking-presentation'
import type { H3Event } from 'nitro'

export interface BookingCreationContext {
  organizationId: string
  slug: string
  body: Record<string, unknown>
  operator?: { userId: string; idempotencyKey: string; source: string; externalReference: string | null; guestAcknowledgement: boolean }
}

function creationResult(body: Record<string, unknown>, options: { status: number }) { return { body, status: options.status } }

/**
 * Claim seats on a session.
 *
 * The guest names a SESSION, not a date and a time: the occurrence is a real
 * row, so there is nothing to re-derive and nothing to disagree about. The
 * claim carries its own capacity predicate, so this route does no
 * check-then-write — the insert either takes the seats or takes none.
 */
export async function createProductBooking(event: H3Event, context: BookingCreationContext) {
  const { organizationId, slug, body, operator } = context
  if (!organizationId || !slug) return creationResult({ error: 'organizationId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return creationResult({ error: 'Database not available' }, { status: 500 })

  const organization = await queryFirst<{ id: string; name: string | null; default_currency: string; vertical: string | null; public_url: string | null }>(db, `SELECT id, name, default_currency, vertical, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active') AS public_url FROM organization WHERE id = ? AND status = 'active' LIMIT 1`, [organizationId])
  if (!organization) return creationResult({ error: 'Organization not found' }, { status: 404 })

  const guestName = cleanString(body.guest_name, 100)
  const guestEmail = cleanString(body.guest_email, 254)
  const guestPhone = cleanString(body.guest_phone, 30)
  let normalizedGuestPhone: string | null = null
  if (guestPhone) {
    const parsedPhone = parsePhone(guestPhone, { defaultCountry: 'TH' })
    if (!parsedPhone.valid || !parsedPhone.e164) return creationResult({ error: 'A valid phone number is required.' }, { status: 400 })
    normalizedGuestPhone = parsedPhone.e164
  }
  const sessionId = cleanString(body.session_id, 64)
  const requestedVariantId = cleanString(body.variant_id, 64)
  const notes = cleanString(body.notes, 1000)
  const pageEventId = readPageEventId(body.page_event_id)
  const partySizeValue = typeof body.party_size === 'number' || typeof body.party_size === 'string' ? Number(body.party_size) : Number.NaN
  if (!Number.isInteger(partySizeValue) || partySizeValue < 1 || partySizeValue > 99) {
    return creationResult({ error: 'Party size must be a whole number between 1 and 99.' }, { status: 400 })
  }
  const partySize = partySizeValue

  if (!guestName) return creationResult({ error: 'Name is required' }, { status: 400 })
  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return creationResult({ error: 'A valid email address is required' }, { status: 400 })
  // Reserved test domains (example.com and friends) hard-bounce and must never
  // be accepted where the environment sends real email.
  if (shouldSendRealEmail(env) && isReservedTestDomain(guestEmail)) return creationResult({ error: 'Please enter a real email address.' }, { status: 422 })
  if (!sessionId) return creationResult({ error: 'A session is required' }, { status: 400 })

  const threadId = operator ? await hashIdentifier(JSON.stringify([organizationId, operator.idempotencyKey])) : crypto.randomUUID()
  const replayState: { booking: { id: string; status: string; creation_status: string | null } | null } = { booking: null }
  const fingerprint = operator ? await hashIdentifier(JSON.stringify({ slug, sessionId, requestedVariantId, partySize, guestName, guestEmail, phone: normalizedGuestPhone, notes, source: operator.source, externalReference: operator.externalReference, guestAcknowledgement: operator.guestAcknowledgement })) : null
  const replay = async () => {
    const existing = await queryFirst<{ id: string; status: string; fingerprint: string | null; completed: number | null; creation_status: string | null }>(db, `SELECT b.id, b.status, json_extract(r.payload_json, '$.provenance.fingerprint') AS fingerprint, json_extract(r.payload_json, '$.provenance.followups_completed') AS completed, json_extract(r.payload_json, '$.provenance.creation_status') AS creation_status FROM bookings b JOIN requests r ON r.id = b.request_id WHERE b.organization_id = ? AND r.id = ?`, [organizationId, threadId])
    if (!existing) return null
    if (existing.fingerprint !== fingerprint) return creationResult({ error: 'Idempotency key was reused with different booking details', code: 'idempotency_conflict' }, { status: 409 })
    replayState.booking = existing
    if (!existing.completed) return null
    return creationResult({ success: true, booking_id: threadId, request_id: threadId, operational_booking_id: existing.id, status: existing.status, replayed: true }, { status: 200 })
  }
  if (operator) {
    const existing = await replay()
    if (existing) return existing
  }

  const product = await queryFirst<{ id: string; name: string }>(db, `
    SELECT p.id, p.name FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      JOIN product_booking_configs cfg ON cfg.product_id = p.id
     WHERE pub.organization_id = ? AND pub.published = 1 AND p.slug = ? AND p.active = 1 LIMIT 1
  `, [organizationId, slug])
  if (!product) return creationResult({ error: 'Product not found' }, { status: 404 })

  const session = await queryFirst<{ id: string; location_id: string | null; starts_at: string; ends_at: string; timezone: string }>(db, `
    SELECT s.id, s.location_id, s.starts_at, s.ends_at, s.timezone
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
  if (!session) return creationResult({ error: 'That session is not open for booking' }, { status: 404 })

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
  if (variants.length === 0) return creationResult({ error: 'This product has no bookable option' }, { status: 409 })
  if (requestedVariantId && !variants.some(variant => variant.id === requestedVariantId)) {
    return creationResult({ error: 'That option is not available for this product' }, { status: 400 })
  }
  if (!requestedVariantId && variants.length > 1) {
    return creationResult({ error: 'Choose an option before booking' }, { status: 400 })
  }
  const productVariantId = requestedVariantId || variants[0]!.id

  const full = await getProduct(db, organization.id, product.id)
  const presentation = resolveBookingPresentation('booking', organization.vertical)
  const config = await requireBookingConfig(db, organization.id, product.id)
  if (!replayState.booking && config.online_payment_required) {
    if (!isCurrencyCode(organization.default_currency)) throw new Error(`Unsupported organization currency: ${organization.default_currency}`)
    const variant = full.variants.find(candidate => candidate.id === productVariantId)
    if (!variant) throw new Error('The selected variant is missing')
    const price = resolveVariantPrice(variant, { currency: organization.default_currency, location_id: session.location_id, at: new Date().toISOString() })
    if (!price) return creationResult({ error: 'A valid Price is required for this offering', code: 'price_unavailable' }, { status: 409 })
    if (price.unit_amount > 0) return creationResult({ error: 'Online payment is required to request this appointment', code: 'payment_required' }, { status: 409 })
  }
  const bookingStatus = config.confirmation_mode === 'review' ? 'pending' : 'confirmed'


  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)
  const emailHash = await hashIdentifier(guestEmail)
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!operator && !import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]
    if (!await incrementHourlyRateLimit(db, `rate:book:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)) {
      return creationResult({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }
    if (!await incrementHourlyRateLimit(db, `rate:book:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)) {
      return creationResult({ error: 'Too many booking requests from this email. Please try again tomorrow.' }, { status: 429 })
    }
  }

  const cancellation = operator ? await createReplayableReservationCancelToken(env.EMAIL_REPLY_SECRET ?? '', threadId) : createReservationCancelToken()
  const cancellationTokenHash = await hashReservationCancelToken(cancellation.token)
  // The person is the Better Auth user; what they typed stays on the thread as
  // this booking's guest snapshot and is never copied onto that user.
  const userId = operator ? null : await ensureInteractionUser(event, env)

  const now = new Date().toISOString()
  const payload = threadPayloadForGuest({ name: guestName, email: guestEmail, phone: normalizedGuestPhone, notes, ipHash })
  if (operator) {
    payload.provenance = { source: operator.source, external_reference: operator.externalReference, actor_user_id: operator.userId, idempotency_key: operator.idempotencyKey, fingerprint: fingerprint!, guest_acknowledgement: operator.guestAcknowledgement, creation_kind: 'ordinary', creation_status: bookingStatus, followups_completed: false }
  }
  payload.cancellation = { token_hash: cancellationTokenHash, expires_at: cancellation.expiresAt, used_at: null }

  let operationalBookingId: string | undefined
  try {
    // The seat is claimed first, and the thread is written only where that
    // claim landed: a claim that finds the session full inserts nothing and
    // raises nothing, so a thread written ahead of it would commit on its own.
    // The booking takes its request id once the thread exists.
    const claim = replayState.booking ? { bookingId: replayState.booking.id } : await claimSessionCapacity(db, {
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
          query: `INSERT INTO activity_entries (id, request_id, kind, scope_kind, actor_kind, actor_user_id, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
                  SELECT ?, request_id, 'operation', 'request', ?, ?, 'booking.created',
                    json_object('operational_booking_id', id, 'request_id', request_id, 'afterStatus', status), ?,
                    COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id = bookings.request_id), 0) + 1, ?, ?
                  FROM bookings WHERE id = ? AND request_id IS NOT NULL`,
          params: [crypto.randomUUID(), operator ? 'member' : 'system', operator?.userId ?? null, `booking:${bookingId}:created`, now, now, bookingId],
        },
      ],
    })
    operationalBookingId = claim.bookingId
  } catch (error) {
    // Nothing to roll back: the batch either applied whole or not at all.
    if (operator) {
      const existing = await replay()
      if (existing) return existing
      if (replayState.booking) operationalBookingId = (replayState.booking as { id: string }).id
      else if (!(error instanceof CapacityUnavailableError)) throw error
    }
    if (!replayState.booking) {
      if (!(error instanceof CapacityUnavailableError)) throw error
      return creationResult({ error: 'This session just filled up. Please pick another time.' }, { status: 409 })
    }
  }

  if (!operationalBookingId) throw new Error('Booking allocation did not produce an operational ID')
  await publishGuestInboxThreadEvent(env, db, { threadId, type: 'thread.created' })

  // One instant, one zone: the message the guest reads and the record the
  // host sees are formatted from the same session row.
  const whenLabel = new Intl.DateTimeFormat('en-US', { timeZone: session.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.starts_at))
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
        guestAcknowledgement: operator?.guestAcknowledgement ?? true, bookingId: threadId, status: replayState.booking ? (replayState.booking.creation_status === 'pending' ? 'pending' : 'confirmed') : bookingStatus, guestName, email: guestEmail, guestPhone: normalizedGuestPhone,
        productId: product.id, productTitle: product.name, startsAt: session.starts_at, timezone: session.timezone,
        partySize, notes: notes || null,
        cancelUrl, contactPhone, contactEmail, ownerInboxUrl,
      }),
      operator ? Promise.resolve({ recorded: false, reason: 'operator_creation', quotedValue: null }) : recordBookingMeasurement(),
    ]),
  ])
  // Only the owner notification can fail the request. Measurement is reported beside the
  // committed result: a guest told a confirmed submission failed would submit again.
  raiseSettledFailures('booking follow-up', `bookingId ${threadId}`, followUps.slice(0, 1),
    ['notifyBookingCreated'])
  if (operator) await db.prepare(`UPDATE requests SET payload_json = json_set(payload_json, '$.provenance.followups_completed', json('true')) WHERE id = ? AND organization_id = ?`).bind(threadId, organizationId).run()
  const measurement = measurementOutcome(followUps[1]!)
  const quotedValueOf = (result: PromiseSettledResult<unknown>) => result.status === 'fulfilled' ? (result.value as { quotedValue: unknown }).quotedValue : null

  return creationResult({
    success: true, booking_id: threadId, request_id: threadId, operational_booking_id: operationalBookingId, status: replayState.booking?.status ?? bookingStatus, replayed: Boolean(replayState.booking), starts_at: session.starts_at, ends_at: session.ends_at, timezone: session.timezone, presentation, ...(operator ? {} : { cancellation_token: cancellation.token }), quoted_value: quotedValueOf(followUps[1]!), measurement,
    message: bookingStatus === 'pending' ? `Your request for ${product.name} on ${whenLabel} is awaiting review.` : `Your ${presentation.noun} for ${product.name} on ${whenLabel} is confirmed.`,
    policy_summary: renderBookingPolicySummary(productPolicySummarySource(full.metafields), locale),
  }, { status: 201 })
}
