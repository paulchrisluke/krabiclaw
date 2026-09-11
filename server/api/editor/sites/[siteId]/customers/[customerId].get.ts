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

  const reservations = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, json_extract(payload_json, '$.guest.name') AS name, json_extract(payload_json, '$.guest.email') AS email, json_extract(payload_json, '$.guest.phone') AS phone, booking_date AS date, time_slot AS time, party_size || CASE WHEN json_extract(payload_json, '$.party_size_is_minimum') THEN '+' ELSE '' END AS guests, status, json_extract(payload_json, '$.completion.at') AS completed_at, json_extract(payload_json, '$.completion.source') AS completion_source, json_extract(payload_json, '$.review.request_sent_at') AS review_request_sent_at, json_extract(payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at, json_extract(payload_json, '$.review.submitted_at') AS review_submitted_at, review_id, created_at
    FROM requests WHERE kind = 'reservation' AND site_id = ? AND customer_id = ?
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const bookings = await queryAll<ApiRecord>(db, `
    SELECT eb.id, eb.location_id, eb.product_id AS experience_id, p.name AS experience_title, json_extract(eb.payload_json, '$.guest.name') AS guest_name, json_extract(eb.payload_json, '$.guest.email') AS guest_email, json_extract(eb.payload_json, '$.guest.phone') AS guest_phone, eb.booking_date, eb.time_slot, eb.party_size, eb.status, json_extract(eb.payload_json, '$.completion.at') AS completed_at, json_extract(eb.payload_json, '$.completion.source') AS completion_source, json_extract(eb.payload_json, '$.review.request_sent_at') AS review_request_sent_at, json_extract(eb.payload_json, '$.review.reminder_sent_at') AS review_reminder_sent_at, json_extract(eb.payload_json, '$.review.submitted_at') AS review_submitted_at, eb.review_id, eb.created_at
    FROM requests eb
    LEFT JOIN products p ON p.id = eb.product_id
    WHERE eb.kind = 'booking' AND eb.site_id = ? AND eb.customer_id = ?
    ORDER BY eb.booking_date DESC, eb.time_slot DESC, eb.created_at DESC
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
