import { jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const customerId = getRouterParam(event, 'customerId')
  if (!siteId || !customerId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireSiteAccess(event, siteId)

  const customer = await queryFirst<ApiRecord>(db, `
    SELECT id, name, email, phone, source, status, user_id, stripe_customer_id,
           review_request_opted_out_at, last_booking_at, last_review_at,
           created_at, updated_at
    FROM customers
    WHERE id = ? AND site_id = ? AND status != 'deleted'
    LIMIT 1
  `, [customerId, siteId])
  if (!customer) return jsonResponse({ error: 'Customer not found' }, { status: 404 })

  const reservations = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, name, email, phone, date, time, guests, status,
           completed_at, completion_source, review_request_sent_at,
           review_reminder_sent_at, review_submitted_at, review_id, created_at
    FROM reservation_submissions
    WHERE site_id = ? AND customer_id = ?
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const experienceBookings = await queryAll<ApiRecord>(db, `
    SELECT eb.id, eb.location_id, eb.experience_id, e.title AS experience_title,
           eb.guest_name, eb.guest_email, eb.guest_phone, eb.booking_date,
           eb.time_slot, eb.party_size, eb.status, eb.completed_at,
           eb.completion_source, eb.review_request_sent_at,
           eb.review_reminder_sent_at, eb.review_submitted_at, eb.review_id,
           eb.created_at
    FROM experience_bookings eb
    LEFT JOIN experiences e ON e.id = eb.experience_id
    WHERE eb.site_id = ? AND eb.customer_id = ?
    ORDER BY eb.booking_date DESC, eb.time_slot DESC, eb.created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const reviews = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, rating, title, content, status, source,
           booking_type, booking_id, review_request_id, helpful_count,
           created_at, updated_at
    FROM reviews
    WHERE site_id = ? AND customer_id = ?
    ORDER BY created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  const reviewRequests = await queryAll<ApiRecord>(db, `
    SELECT id, location_id, booking_type, booking_id, expires_at,
           first_sent_at, reminder_sent_at, submitted_at, clicked_at,
           revoked_at, send_count, last_error, anonymous_user_id, user_id,
           created_at, updated_at
    FROM review_requests
    WHERE site_id = ? AND customer_id = ?
    ORDER BY created_at DESC
    LIMIT 25
  `, [siteId, customerId])

  return jsonResponse({
    customer,
    reservations,
    experienceBookings,
    reviews,
    reviewRequests,
  })
})
