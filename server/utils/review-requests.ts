import { execute, queryFirst, type DbClient } from '~/server/db'
import { hasOrganizationEntitlement } from '~/server/utils/billing'

export type ReviewBookingType = 'reservation' | 'booking'
export type CompletionSource = 'manual' | 'auto'

export interface ReviewRequestRow {
  id: string
  organization_id: string
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
  location_id: string | null
  /** The product a booking was for; a reservation has none. */
  product_id: string | null
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
  organization_name: string | null
  organization_public_url: string | null
  organization_subdomain: string | null
  location_slug: string | null
  location_title: string | null
  google_place_id: string | null
  google_review_url: string | null
  visit_starts_at: string
  visit_timezone: string
  party_size: number
}

export const REVIEW_REQUEST_TTL_DAYS = 30
export const RESERVATION_FIRST_SEND_DELAY_HOURS = 24
export const EXPERIENCE_FIRST_SEND_DELAY_HOURS = 24

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString()
}

export function addHours(iso: string, hours: number): string {
  return isoFromMs(new Date(iso).getTime() + hours * 3_600_000)
}

export function addDays(iso: string, days: number): string {
  return isoFromMs(new Date(iso).getTime() + days * 86_400_000)
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
  return queryFirst<ReviewBookingContext>(db, `SELECT r.kind AS booking_type, r.id AS booking_id, r.organization_id, r.location_id, r.customer_id,
    c.name AS customer_name, c.email AS customer_email, c.review_request_opted_out_at AS customer_opted_out_at,
    json_extract(r.payload_json, '$.guest.name') AS guest_name, json_extract(r.payload_json, '$.guest.email') AS guest_email, record.status,
    record.ends_at AS completed_at,
    json_extract(r.payload_json, '$.review.request_sent_at') AS review_request_sent_at,
    json_extract(r.payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at,
    json_extract(r.payload_json, '$.review.submitted_at') AS review_submitted_at, r.review_id,
    s.name AS organization_name, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active') AS organization_public_url,
    s.subdomain AS organization_subdomain, bl.slug AS location_slug, bl.title AS location_title, bl.google_place_id, bl.google_review_url,
    record.starts_at AS visit_starts_at, record.timezone AS visit_timezone, record.party_size, record.product_id
    FROM requests r JOIN organization s ON s.id = r.organization_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN business_locations bl ON bl.id = r.location_id
    -- The visit itself lives on the operational record, never on the thread. A
    -- review request only exists once that visit has ended, and its end is on
    -- the record: same UNION shape the automation sweep uses.
    JOIN (
      SELECT b.request_id, b.status, ps.timezone, ps.starts_at, ps.ends_at, b.party_size, ps.product_id FROM bookings b JOIN product_sessions ps ON ps.id = b.product_session_id
      UNION ALL
      SELECT res.request_id, res.status, res.timezone, res.starts_at, res.ends_at, res.party_size, NULL AS product_id FROM reservations res
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
  env: CloudflareEnv,
  db: DbClient,
  context: ReviewBookingContext,
  now = new Date().toISOString(),
): Promise<{ request: ReviewRequestRow; token: string; created: boolean }> {
  if (!context.customer_id) throw new Error('Booking is not linked to a customer')
  if (!context.completed_at || context.completed_at > now) throw new Error('Booking is not complete yet')
  if (context.status === 'cancelled') throw new Error('Cancelled bookings cannot receive review requests')
  if (context.review_submitted_at || context.review_id) throw new Error('Booking already has a submitted review')
  if (context.customer_opted_out_at) throw new Error('Customer has opted out of review requests')

  const entitled = await hasOrganizationEntitlement(env, context.organization_id, 'review_requests')
  if (!entitled) throw new Error('Review requests are not enabled for this organization')

  const token = createReviewRequestToken()
  const tokenHash = await hashReviewRequestToken(token)
  const expiresAt = addDays(now, REVIEW_REQUEST_TTL_DAYS)
  const id = crypto.randomUUID()

  const insertResult = await execute(db, `
    INSERT OR IGNORE INTO review_requests (
      id, organization_id, location_id, customer_id, booking_type, booking_id,
      token_hash, expires_at, send_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `, [
    id,
    context.organization_id,
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
      WHERE organization_id = ?
        AND booking_type = ?
        AND booking_id = ?
        AND submitted_at IS NULL
        AND revoked_at IS NULL
    `, [tokenHash, expiresAt, now, context.organization_id, context.booking_type, context.booking_id])
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
  sentAt = new Date().toISOString(),
): Promise<void> {
  await execute(db, `
    UPDATE review_requests
    SET first_sent_at = COALESCE(first_sent_at, ?),
        send_count = CASE WHEN first_sent_at IS NULL THEN send_count + 1 ELSE send_count END,
        last_error = NULL,
        updated_at = ?
    WHERE id = ?
  `, [sentAt, sentAt, requestId])
  const request = await queryFirst<ReviewRequestRow>(db, `SELECT * FROM review_requests WHERE id = ? LIMIT 1`, [requestId])
  if (request) await markBookingReviewRequestSent(db, request.booking_type, request.booking_id, sentAt)
}

export async function markBookingReviewRequestSent(
  db: DbClient,
  bookingType: ReviewBookingType,
  bookingId: string,
  sentAt = new Date().toISOString(),
): Promise<void> {
  const path = '$.review.request_sent_at'
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
