import { jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const customerId = getRouterParam(event, 'customerId')
  if (!siteId || !customerId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireSiteAccess(event, siteId)

  const customer = await queryFirst<ApiRecord>(db, `
    SELECT id, name, email, phone, source, status, user_id, stripe_customer_id, review_request_opted_out_at, created_at, updated_at
    FROM customers
    WHERE id = ? AND site_id = ? AND status != 'deleted'
    LIMIT 1
  `, [customerId, siteId])
  if (!customer) return jsonResponse({ error: 'Customer not found' }, { status: 404 })

  // When and for how many live on the reservation, not on the thread: the
  // thread is the conversation, and the table held is its own row.
  const reservations = await queryAll<ApiRecord>(db, `
    SELECT r.id, res.location_id, json_extract(r.payload_json, '$.guest.name') AS name, json_extract(r.payload_json, '$.guest.email') AS email, json_extract(r.payload_json, '$.guest.phone') AS phone, res.starts_at, res.timezone, res.party_size || CASE WHEN json_extract(r.payload_json, '$.party_size_is_minimum') THEN '+' ELSE '' END AS guests, res.status, json_extract(r.payload_json, '$.completion.at') AS completed_at, json_extract(r.payload_json, '$.completion.source') AS completion_source, json_extract(r.payload_json, '$.review.request_sent_at') AS review_request_sent_at, json_extract(r.payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at, json_extract(r.payload_json, '$.review.submitted_at') AS review_submitted_at, r.review_id, r.created_at
    FROM requests r JOIN reservations res ON res.request_id = r.id
    WHERE r.kind = 'reservation' AND r.site_id = ? AND r.customer_id = ?
    ORDER BY res.starts_at DESC, r.created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const bookings = await queryAll<ApiRecord>(db, `
    SELECT r.id, ps.location_id, b.product_id, p.name AS product_title, json_extract(r.payload_json, '$.guest.name') AS guest_name, json_extract(r.payload_json, '$.guest.email') AS guest_email, json_extract(r.payload_json, '$.guest.phone') AS guest_phone, ps.starts_at, ps.timezone, b.party_size, b.status, json_extract(r.payload_json, '$.completion.at') AS completed_at, json_extract(r.payload_json, '$.completion.source') AS completion_source, json_extract(r.payload_json, '$.review.request_sent_at') AS review_request_sent_at, json_extract(r.payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at, json_extract(r.payload_json, '$.review.submitted_at') AS review_submitted_at, r.review_id, r.created_at
    FROM requests r
    JOIN bookings b ON b.request_id = r.id
    JOIN product_sessions ps ON ps.id = b.product_session_id
    LEFT JOIN products p ON p.id = b.product_id
    WHERE r.kind = 'booking' AND r.site_id = ? AND r.customer_id = ?
    ORDER BY ps.starts_at DESC, r.created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const reviews = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, rating, title, content, status, source, booking_type, booking_id, review_request_id, helpful_count, created_at, updated_at
    FROM reviews
    WHERE site_id = ? AND customer_id = ?
    ORDER BY created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const reviewRequests = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, booking_type, booking_id, expires_at, first_sent_at, reminder_sent_at, submitted_at, clicked_at, revoked_at, send_count, last_error, anonymous_user_id, user_id, created_at, updated_at
    FROM review_requests
    WHERE site_id = ? AND customer_id = ?
    ORDER BY created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  return jsonResponse({
    customer, reservations, bookings, reviews, reviewRequests, })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
