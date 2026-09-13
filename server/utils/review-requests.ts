import { execute, queryFirst, type DbClient } from '~/server/db'
import { hasSiteEntitlement } from '~/server/utils/billing'

export type ReviewBookingType = 'reservation' | 'booking'
export type CompletionSource = 'manual' | 'auto'

export interface ReviewRequestRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  customer_id: string
  booking_type: ReviewBookingType
  booking_id: string
  token_hash: string
  expires_at: string
  first_sent_at: string | null
  reminder_sent_at: string | null
  submitted_at: string | null
  clicked_at: string | null
  revoked_at: string | null
  send_count: number
  last_error: string | null
  anonymous_user_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface ReviewBookingContext {
  booking_type: ReviewBookingType
  booking_id: string
  organization_id: string
  site_id: string
  location_id: string | null
  customer_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_opted_out_at: string | null
  guest_name: string | null
  guest_email: string | null
  status: string
  completed_at: string | null
  review_request_sent_at: string | null
  review_reminder_sent_at: string | null
  review_submitted_at: string | null
  review_id: string | null
  site_name: string | null
  site_public_url: string | null
  site_subdomain: string | null
  location_slug: string | null
  location_title: string | null
  google_place_id: string | null
  google_review_url: string | null
  visit_starts_at: string
  visit_timezone: string
  party_size: number
}

export const REVIEW_REQUEST_TTL_DAYS = 30
export const RESERVATION_FIRST_SEND_DELAY_HOURS = 2
export const EXPERIENCE_FIRST_SEND_DELAY_HOURS = 24
export const REVIEW_REMINDER_DELAY_DAYS = 5

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString()
}

export function addHours(iso: string, hours: number): string {
  return isoFromMs(new Date(iso).getTime() + hours * 3_600_000)
}

export function addDays(iso: string, days: number): string {
  return isoFromMs(new Date(iso).getTime() + days * 86_400_000)
}

export async function hasReviewRequestsEntitlement(db: DbClient, siteId: string): Promise<boolean> {
  return await hasSiteEntitlement(db, siteId, 'review_requests')
}

export function createReviewRequestToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export async function hashReviewRequestToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function resolveGoogleReviewUrl(location: Pick<ReviewBookingContext, 'google_review_url' | 'google_place_id'>): string | null {
  const manualUrl = location.google_review_url?.trim()
  if (manualUrl) return manualUrl
  const placeId = location.google_place_id?.trim()
  return placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null
}

export async function getReviewBookingContext(
  db: DbClient,
  bookingType: ReviewBookingType,
  bookingId: string,
): Promise<ReviewBookingContext | null> {
  return queryFirst<ReviewBookingContext>(db, `SELECT r.kind AS booking_type, r.id AS booking_id, r.organization_id, r.site_id, r.location_id, r.customer_id,
    c.name AS customer_name, c.email AS customer_email, c.review_request_opted_out_at AS customer_opted_out_at,
    json_extract(r.payload_json, '$.guest.name') AS guest_name, json_extract(r.payload_json, '$.guest.email') AS guest_email, record.status,
    json_extract(r.payload_json, '$.completion.at') AS completed_at,
    json_extract(r.payload_json, '$.review.request_sent_at') AS review_request_sent_at,
    json_extract(r.payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at,
    json_extract(r.payload_json, '$.review.submitted_at') AS review_submitted_at, r.review_id,
    s.brand_name AS site_name, (SELECT 'https://' || domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active') AS site_public_url,
    s.subdomain AS site_subdomain, bl.slug AS location_slug, bl.title AS location_title, bl.google_place_id, bl.google_review_url,
    record.starts_at AS visit_starts_at, record.timezone AS visit_timezone, record.party_size
    FROM requests r JOIN sites s ON s.id = r.site_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN business_locations bl ON bl.id = r.location_id
    -- The visit itself lives on the operational record, never on the thread. A
    -- review request only exists once that record reached 'completed', so this
    -- join is total: same UNION shape the automation sweep uses.
    JOIN (
      SELECT b.request_id, b.status, ps.timezone, ps.starts_at, b.party_size FROM bookings b JOIN product_sessions ps ON ps.id = b.product_session_id
      UNION ALL
      SELECT res.request_id, res.status, res.timezone, res.starts_at, res.party_size FROM reservations res
    ) record ON record.request_id = r.id
    WHERE r.id = ? AND r.kind = ?`, [bookingId, bookingType])
}

export async function getReviewRequestByToken(
  db: DbClient,
  token: string,
  opts: { markClicked?: boolean } = {},
): Promise<{ request: ReviewRequestRow; context: ReviewBookingContext } | null> {
  const tokenHash = await hashReviewRequestToken(token)
  const request = await queryFirst<ReviewRequestRow>(db, `
    SELECT *
    FROM review_requests
    WHERE token_hash = ?
      AND revoked_at IS NULL
      AND submitted_at IS NULL
      AND expires_at > ?
    LIMIT 1
  `, [tokenHash, new Date().toISOString()])

  if (!request) return null
  const context = await getReviewBookingContext(db, request.booking_type, request.booking_id)
  if (!context || context.customer_id !== request.customer_id) return null

  if (opts.markClicked && !request.clicked_at) {
    const now = new Date().toISOString()
    await execute(db, `
      UPDATE review_requests
      SET clicked_at = COALESCE(clicked_at, ?), updated_at = ?
      WHERE id = ?
    `, [now, now, request.id])
    request.clicked_at = now
    request.updated_at = now
  }

  return { request, context }
}

export async function createOrRotateReviewRequest(
  db: DbClient,
  context: ReviewBookingContext,
  now = new Date().toISOString(),
): Promise<{ request: ReviewRequestRow; token: string; created: boolean }> {
  if (!context.customer_id) throw new Error('Booking is not linked to a customer')
  if (!context.completed_at) throw new Error('Booking is not completed')
  if (context.status === 'cancelled') throw new Error('Cancelled bookings cannot receive review requests')
  if (context.review_submitted_at || context.review_id) throw new Error('Booking already has a submitted review')
  if (context.customer_opted_out_at) throw new Error('Customer has opted out of review requests')

  const entitled = await hasReviewRequestsEntitlement(db, context.site_id)
  if (!entitled) throw new Error('Review requests are not enabled for this site')

  const token = createReviewRequestToken()
  const tokenHash = await hashReviewRequestToken(token)
  const expiresAt = addDays(now, REVIEW_REQUEST_TTL_DAYS)
  const id = crypto.randomUUID()

  const insertResult = await execute(db, `
    INSERT OR IGNORE INTO review_requests (
      id, organization_id, site_id, location_id, customer_id, booking_type, booking_id,
      token_hash, expires_at, send_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `, [
    id,
    context.organization_id,
    context.site_id,
    context.location_id,
    context.customer_id,
    context.booking_type,
    context.booking_id,
    tokenHash,
    expiresAt,
    now,
    now,
  ])

  const created = Number(insertResult.meta.changes ?? 0) > 0
  if (!created) {
    await execute(db, `
      UPDATE review_requests
      SET token_hash = ?,
          expires_at = ?,
          last_error = NULL,
          updated_at = ?
      WHERE site_id = ?
        AND booking_type = ?
        AND booking_id = ?
        AND submitted_at IS NULL
        AND revoked_at IS NULL
    `, [tokenHash, expiresAt, now, context.site_id, context.booking_type, context.booking_id])
  }

  const request = await queryFirst<ReviewRequestRow>(db, `
    SELECT *
    FROM review_requests
    WHERE token_hash = ?
    LIMIT 1
  `, [tokenHash])

  if (!request) throw new Error('Failed to create review request')
  return { request, token, created }
}

export async function markReviewRequestSendSuccess(
  db: DbClient,
  requestId: string,
  kind: 'first' | 'reminder',
  sentAt = new Date().toISOString(),
): Promise<void> {
  if (kind === 'first') {
    await execute(db, `
      UPDATE review_requests
      SET first_sent_at = COALESCE(first_sent_at, ?),
          send_count = CASE WHEN first_sent_at IS NULL THEN send_count + 1 ELSE send_count END,
          last_error = NULL,
          updated_at = ?
      WHERE id = ?
    `, [sentAt, sentAt, requestId])
    const request = await queryFirst<ReviewRequestRow>(db, `SELECT * FROM review_requests WHERE id = ? LIMIT 1`, [requestId])
    if (request) await markBookingReviewRequestSent(db, request.booking_type, request.booking_id, kind, sentAt)
    return
  }

  await execute(db, `
    UPDATE review_requests
    SET reminder_sent_at = COALESCE(reminder_sent_at, ?),
        send_count = CASE WHEN reminder_sent_at IS NULL THEN send_count + 1 ELSE send_count END,
        last_error = NULL,
        updated_at = ?
    WHERE id = ?
  `, [sentAt, sentAt, requestId])
  const request = await queryFirst<ReviewRequestRow>(db, `SELECT * FROM review_requests WHERE id = ? LIMIT 1`, [requestId])
  if (request) await markBookingReviewRequestSent(db, request.booking_type, request.booking_id, kind, sentAt)
}

export async function markBookingReviewRequestSent(
  db: DbClient,
  bookingType: ReviewBookingType,
  bookingId: string,
  kind: 'first' | 'reminder',
  sentAt = new Date().toISOString(),
): Promise<void> {
  const path = kind === 'first' ? '$.review.request_sent_at' : '$.review.reminder_sent_at'
  await execute(db, `
    UPDATE requests
    SET payload_json = json_set(payload_json, ?, COALESCE(json_extract(payload_json, ?), ?)), updated_at = ?
    WHERE id = ? AND kind = ?
  `, [path, path, sentAt, sentAt, bookingId, bookingType])
}

export async function markReviewRequestSendFailure(
  db: DbClient,
  requestId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await execute(db, `
    UPDATE review_requests
    SET last_error = ?, updated_at = ?
    WHERE id = ?
  `, [message.slice(0, 1000), new Date().toISOString(), requestId])
}

export async function markReviewSubmittedForRequest(
  db: DbClient,
  request: ReviewRequestRow,
  reviewId: string,
  submittedAt = new Date().toISOString(),
): Promise<void> {
  await execute(db, `
    UPDATE review_requests
    SET submitted_at = COALESCE(submitted_at, ?), updated_at = ?
    WHERE id = ? AND submitted_at IS NULL
  `, [submittedAt, submittedAt, request.id])

  await execute(db, `
    UPDATE requests
    SET payload_json = json_set(payload_json, '$.review.submitted_at', COALESCE(json_extract(payload_json, '$.review.submitted_at'), ?)),
        review_id = COALESCE(review_id, ?),
        updated_at = ?
    WHERE id = ?
  `, [submittedAt, reviewId, submittedAt, request.booking_id])


}

export async function optOutCustomerReviewRequests(
  db: DbClient,
  request: ReviewRequestRow,
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE customers
    SET review_request_opted_out_at = COALESCE(review_request_opted_out_at, ?), updated_at = ?
    WHERE id = ?
  `, [now, now, request.customer_id])
}
