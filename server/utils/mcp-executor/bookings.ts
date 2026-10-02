import { reassignBookingProvider } from '~/server/domain/provider-reassignment'
import { refreshProductBusy } from '~/server/domain/member-scheduling'
import { HTTPError } from 'nitro'
import { queryAll, queryFirst } from '~/server/db'
import { listSessions } from '~/server/utils/availability'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { createProductBooking } from '~/server/domain/product-bookings'
import { getGuestRequest, getThreadOperationalRecord } from '~/server/domain/requests'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { requestBookingChange } from '~/server/domain/guest-threads/booking-changes'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { NOT_HANDLED, requiredString, optionalString, type McpExecutorContext } from './shared'

export async function handleBookingsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { organization, args, toolName, event } = ctx
  const { db, env, organizationId } = organization
  if (toolName === 'list_product_booking_sessions') {
    const from = requiredString(args, 'from')
    const to = requiredString(args, 'to')
    const start = Date.parse(from), end = Date.parse(to)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * 86400000) throw new HTTPError({ statusCode: 400, message: 'A valid date range of at most 93 days is required' })
    const productId = requiredString(args, 'product_id')
    const product = await queryFirst(db, 'SELECT id FROM products WHERE id = ? AND organization_id = ?', [productId, organizationId])
    if (!product) throw new HTTPError({ statusCode: 404, message: 'Product not found in this organization' })
    await refreshProductBusy(db,env,organizationId,productId)
    const sessions = await listSessions(db, { organizationId, productId, fromInstant: new Date(start).toISOString(), toInstant: new Date(end).toISOString() })
    const page = paginateMcpCollection(sessions, args, { resource: `booking-sessions:${organizationId}:${productId}:${from}:${to}` })
    return { sessions: page.items, page_info: page.page_info }
  }
  if(toolName==='reassign_product_booking')return reassignBookingProvider({env,organizationId,userId:organization.userId},{booking_id:requiredString(args,'operational_booking_id'),member_id:requiredString(args,'member_id'),expected_updated_at:requiredString(args,'expected_updated_at'),idempotency_key:requiredString(args,'idempotency_key')})
  if (toolName === 'list_product_bookings') {
    const rows = await queryAll<Record<string, unknown> & { guest_json: string | null; provenance_json: string | null }>(db, `SELECT b.id AS operational_booking_id, b.request_id, b.product_id, b.product_variant_id, b.product_session_id, b.status, b.party_size, b.user_id, b.updated_at, b.assigned_member_id, s.starts_at, s.ends_at, s.timezone, json_extract(r.payload_json, '$.guest') AS guest_json, json_extract(r.payload_json, '$.provenance') AS provenance_json FROM bookings b JOIN product_sessions s ON s.id = b.product_session_id LEFT JOIN requests r ON r.id = b.request_id AND r.organization_id = b.organization_id WHERE b.organization_id = ? AND (? IS NULL OR b.assigned_member_id=?) ORDER BY s.starts_at, b.id`, [organizationId,args.assigned_member_id??null,args.assigned_member_id??null])
    const bookings = rows.map(({ guest_json, provenance_json, ...booking }) => ({ ...booking, guest: guest_json === null ? null : JSON.parse(guest_json), provenance: provenance_json === null ? null : JSON.parse(provenance_json) }))
    const page = paginateMcpCollection(bookings, args, { resource: `product-bookings:${organizationId}` })
    return { bookings: page.items, page_info: page.page_info }
  }
  if (toolName === 'create_product_booking') {
    if (!event) throw new HTTPError({ statusCode: 500, message: 'Booking creation requires the request context' })
    const result = await createProductBooking(event, {
      organizationId, slug: requiredString(args, 'product_slug'), body: args,
      operator: { userId: organization.userId, idempotencyKey: requiredString(args, 'idempotency_key'), source: requiredString(args, 'source'), externalReference: optionalString(args, 'external_reference') ?? null, guestAcknowledgement: args.guest_acknowledgement === true },
    })
    return { success: result.status < 400, ...result.body, http_status: result.status }
  }
  if (!['get_product_booking', 'confirm_product_booking', 'reject_product_booking', 'cancel_product_booking', 'request_product_booking_change', 'cancel_table_reservation', 'request_table_reservation_change'].includes(toolName)) return NOT_HANDLED
  const reservation = toolName.includes('table_reservation')
  const id = requiredString(args, reservation ? 'operational_reservation_id' : 'operational_booking_id')
  const row = await queryFirst<{ request_id: string | null; updated_at: string }>(db, `SELECT request_id, updated_at FROM ${reservation ? 'reservations' : 'bookings'} WHERE id = ? AND organization_id = ?`, [id, organizationId])
  if (!row?.request_id) throw new HTTPError({ statusCode: 404, message: 'Operational booking with an inbox thread not found in this organization' })
  const thread = await getGuestRequest(db, row.request_id, organizationId, reservation ? 'reservation' : 'booking')
  if (!thread) throw new HTTPError({ statusCode: 404, message: 'Booking thread not found' })
  if (toolName === 'get_product_booking') return { operational_booking_id: id, request_id: thread.id, updated_at: thread.updated_at, operational_updated_at: row.updated_at, guest_user_id: thread.user_id, guest: thread.payload.guest, provenance: thread.kind === 'booking' ? thread.payload.provenance ?? null : null, record: await getThreadOperationalRecord(db, thread.id) }
  const key = requiredString(args, 'idempotency_key')
  if (toolName.startsWith('request_')) {
    const fields = reservation ? { kind: 'reservation', locationId: requiredString(args, 'location_id'), bookingDate: requiredString(args, 'date'), bookingTime: requiredString(args, 'time'), partySize: args.party_size } : { kind: 'booking', sessionId: requiredString(args, 'session_id'), partySize: args.party_size }
    await requestBookingChange(db, env, thread, organization.userId, { ...fields, expectedUpdatedAt: requiredString(args, 'expected_updated_at') }, key)
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
    return { success: true, request_id: thread.id, change_status: 'awaiting_guest_acceptance', record: await getThreadOperationalRecord(db, thread.id) }
  }
  const outcome = await executeGuestThreadOperation(db, { threadId: thread.id, organizationId, action: toolName.split('_')[0]!, actorUserId: organization.userId, idempotencyKey: key, env })
  if (outcome.ok || outcome.reason === 'delivery_failed' || outcome.reason === 'delivery_unknown') await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  return { ...outcome, record: await getThreadOperationalRecord(db, thread.id) }
}
