import { paginationInputSchema, pageInfoObject, organizationTool, type McpToolDefinition } from './shared'
import { reassignBookingProvider } from '~/server/domain/provider-reassignment'
import { refreshProductBusy } from '~/server/domain/member-scheduling'
import { HTTPError } from 'nitro'
import { createTableReservation } from '~/server/domain/table-reservations'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { assertResourceAccess, assertProductAccess, assertAssignedBookingAccess, assignedBookingSql, roleAllows, memberAccessPrincipal } from '~/server/utils/member-access'
import { queryAll, queryFirst } from '~/server/db'
import { createSession, getSessionAvailability, listSessions, updateSession } from '~/server/utils/availability'
import { mcpPageInfo, mcpPageWindow, paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { createProductBooking } from '~/server/domain/product-bookings'
import { getGuestRequest, getThreadOperationalRecord } from '~/server/domain/requests'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { requestBookingChange } from '~/server/domain/guest-threads/booking-changes'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { NOT_HANDLED, requiredString, optionalString, type McpExecutorContext } from './execution'
import { BOOKING_STATUSES, isBookingComplete, type BookingStatus } from '~/shared/bookings'

const key = { type: 'string', minLength: 1, maxLength: 200, description: 'Caller-supplied durable idempotency key. Reuse only for the identical operation.' }
const bookingId = { type: 'string', description: 'Booking ID returned by list_product_bookings or create_product_booking. Distinct from request_id, which identifies the inbox conversation.' }
const reservationId = { type: 'string', description: 'Reservation ID from list_reservation_inquiries. Distinct from the inbox conversation ID.' }
const description = 'Call after the user approves the exact change. Records the action in the inbox history and may send email to the guest.'

const text = { type: 'string' }
const nullableText = { type: ['string', 'null'] }
const guest = { type: 'object', properties: { name: text, email: text, phone: nullableText }, required: ['name', 'email'] }
const record = { type: 'object', properties: { id: text, kind: text, status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] }, party_size: { type: 'integer', minimum: 1 }, starts_at: text, ends_at: text, timezone: text } }
const booking = { type: 'object', properties: { operational_booking_id: text, request_id: nullableText, product_id: text, product_variant_id: nullableText, product_session_id: text, status: { type: 'string', enum: [...BOOKING_STATUSES] }, is_complete: { type: 'boolean' }, party_size: { type: 'integer' }, user_id: nullableText, updated_at: text, assigned_member_id: nullableText, location_id: nullableText, starts_at: text, ends_at: text, timezone: text, guest: { ...guest, type: ['object', 'null'] }, provenance: { type: ['object', 'null'], properties: { source: text, external_reference: nullableText, guest_acknowledgement: { type: 'boolean' } } } }, required: ['operational_booking_id', 'request_id', 'product_id', 'product_session_id', 'status', 'is_complete', 'party_size', 'location_id', 'starts_at', 'ends_at', 'timezone'] }
const session = { type: 'object', properties: { assigned_member_id: nullableText, id: text, organization_id: text, product_id: text, location_id: nullableText, timezone: text, starts_at: text, ends_at: text, updated_at: text, capacity: { type: ['integer', 'null'] }, status: text, claimed: { type: 'integer' }, remaining: { type: ['integer', 'null'] }, is_full: { type: 'boolean' } }, required: ['id', 'product_id', 'location_id', 'assigned_member_id', 'starts_at', 'ends_at', 'timezone', 'capacity', 'status', 'claimed', 'remaining', 'is_full', 'updated_at'] }
const operationResult = { type: 'object', properties: { ok: { const: true }, status: { const: 200 }, request_id: text, record, availableActions: { type: 'array', items: text }, thread: { type: 'object', properties: { id: text, kind: text, conversation_state: text } } }, required: ['ok', 'status', 'record'] }
const changeResult = { type: 'object', properties: { success: { const: true }, request_id: text, change_status: { const: 'awaiting_guest_acceptance' }, record }, required: ['success', 'request_id', 'change_status', 'record'] }
export const BOOKINGS_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'create_product_session', domain: 'bookings', minimumRole: 'member', description: 'Add a dated time for an existing bookable offering. An assigned team gets one session per member. Provide actual start and end times and its location, or null for online. Repeat the same idempotency key on retry.',
    inputSchema: { product_id: text, location_id: nullableText, starts_at: { type: 'string', format: 'date-time' }, ends_at: { type: 'string', format: 'date-time' }, capacity: { type: ['integer', 'null'], minimum: 0 }, idempotency_key: key }, required: ['product_id', 'location_id', 'starts_at', 'ends_at', 'idempotency_key'],
    outputSchema: { type: 'object', properties: { sessions: { type: 'array', items: session, minItems: 1 } }, required: ['sessions'] },
  }),
  organizationTool({ name: 'update_product_session', domain: 'bookings', minimumRole: 'member', description: 'Edit one session’s time, capacity or state. Requires its current updated_at. Times and state cannot change while bookings or checkout holds commit guests to this session; use the guest booking-change workflow for those commitments.',
    inputSchema: { product_id: text, session_id: text, expected_updated_at: text, starts_at: { type: 'string', format: 'date-time' }, ends_at: { type: 'string', format: 'date-time' }, capacity: { type: ['integer', 'null'], minimum: 0 }, status: { type: 'string', enum: ['scheduled', 'cancelled'] } }, required: ['product_id', 'session_id', 'expected_updated_at'],
    outputSchema: { type: 'object', properties: { session }, required: ['session'] },
  }),

 organizationTool({name:'reassign_product_booking',outputSchema:{type:'object',properties:{session_id:text,assigned_member_id:text},required:['session_id','assigned_member_id']},domain:'bookings',minimumRole:'admin',description:'Move a provider-led booking to another team member who is free at that time, without changing the service’s provider. The whole Session moves: attendees keep Booking IDs and Session time; active checkout holds refuse the change. Checks the member’s hours, time off, busy calendar and overlapping bookings atomically and audits actor/old/new assignment. The guest is told in their inbox thread; owners and both team members are notified. Retry the same key after a notification failure.',inputSchema:{operational_booking_id:bookingId,member_id:{type:'string'},expected_updated_at:{type:'string'},idempotency_key:key},required:['operational_booking_id','member_id','expected_updated_at','idempotency_key']}),
  organizationTool({ name: 'list_product_booking_sessions', outputSchema: { type: 'object', properties: { sessions: { type: 'array', items: session }, page_info: pageInfoObject }, required: ['sessions', 'page_info'] }, domain: 'bookings', minimumRole: 'member', description: 'List scheduled sessions and remaining places for a product when the user wants to find a time for a booking or consultation. Includes conflicts with other appointments in its shared calendar. Use the returned session IDs to create or change a booking. This tool does not create sessions.',
    inputSchema: { product_id: { type: 'string' }, from: { type: 'string', description: 'Inclusive ISO UTC instant.' }, to: { type: 'string', description: 'Exclusive ISO UTC instant, at most 93 days after from.' }, ...paginationInputSchema }, required: ['product_id', 'from', 'to'],
  }),
  organizationTool({ name: 'list_product_bookings', outputSchema: { type: 'object', properties: { bookings: { type: 'array', items: booking }, page_info: pageInfoObject }, required: ['bookings', 'page_info'] }, domain: 'bookings', minimumRole: 'member', description: 'List the selected business’s product bookings and consultations, with guests, session times, assigned members and current status. Results are paginated; use operational_booking_id to read or manage a booking and request_id to identify its inbox thread. Restaurant table reservations use list_reservation_inquiries.',
    inputSchema: { assigned_member_id: {type: 'string'}, location_id: { type: ['string', 'null'] }, product_id: { type: 'string' }, status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] }, from: { type: 'string', description: 'Inclusive session start instant.' }, to: { type: 'string', description: 'Exclusive session start instant.' }, ...paginationInputSchema },
  }),
  organizationTool({ name: 'create_table_reservation', domain: 'bookings', minimumRole: 'admin', description: 'Reserve a table for a named guest at an explicit location and local date/time. Uses the location’s hours, capacity and reservation policy. Requires the reservation duration to be configured. Deposits return a financial handoff before a reservation is confirmed. Reuse the same key for an identical retry.',
    inputSchema: { location_id: { type: 'string' }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, guest_name: { type: 'string', minLength: 1 }, guest_email: { type: 'string' }, guest_phone: { type: 'string', description: 'International phone number with calling code.' }, notes: { type: 'string', maxLength: 1000 }, idempotency_key: key, source: { type: 'string', minLength: 1 }, external_reference: { type: 'string' }, guest_acknowledgement: { type: 'boolean' } },
    required: ['location_id', 'date', 'time', 'party_size', 'guest_name', 'guest_email', 'guest_phone', 'idempotency_key', 'source', 'guest_acknowledgement'],
    outputSchema: { type: 'object', properties: { success: { const: true }, request_id: text, operational_reservation_id: text, status: { type: 'string' }, replayed: { type: 'boolean' }, http_status: { type: 'integer' } }, required: ['success', 'request_id', 'operational_reservation_id', 'status', 'http_status'] },
  }),
  organizationTool({ name: 'create_product_booking', outputSchema: { type: 'object', properties: { success: { const: true }, operational_booking_id: text, request_id: text, status: { type: 'string', enum: [...BOOKING_STATUSES] }, replayed: { type: 'boolean' }, http_status: { type: 'integer', minimum: 200, maximum: 299 } }, required: ['success', 'operational_booking_id', 'request_id', 'status', 'http_status'] }, domain: 'bookings', minimumRole: 'admin', description: `Create a product booking or consultation for the named guest at a session from list_product_booking_sessions. Review offerings arrive pending; instant offerings arrive confirmed. Positive prices are allowed only when online collection is disabled; an explicit zero price uses the free flow. Required positive online collection returns financial_action_required and a dashboard URL before creating a booking, hold, Checkout or payment record. Owner notifications and an inbox record are created; guest_acknowledgement chooses whether to email the guest. Reuse the same idempotency_key only for an identical retry; completed deliveries are not sent again. ${description}`,
    inputSchema: {
      product_slug: { type: 'string' }, session_id: { type: 'string' }, variant_id: { type: 'string' },
      party_size: { type: 'integer', minimum: 1, maximum: 99 }, guest_name: { type: 'string', minLength: 1 },
      guest_email: { type: 'string' }, guest_phone: { type: 'string', description: 'Optional guest phone in international format.' }, notes: { type: 'string', maxLength: 1000 },
      idempotency_key: key, source: { type: 'string', minLength: 1, maxLength: 100, description: 'Explicit provenance, such as operator or external scheduler.' },
      external_reference: { type: 'string', maxLength: 200 },
      guest_acknowledgement: { type: 'boolean', description: 'Explicit choice to send the guest creation email. Owner alerts, inbox, and audit always remain.' },
    }, required: ['product_slug', 'session_id', 'party_size', 'guest_name', 'guest_email', 'idempotency_key', 'source', 'guest_acknowledgement'],
  }),
  organizationTool({ name: 'get_product_booking', outputSchema: { type: 'object', properties: { operational_booking_id: text, request_id: text, updated_at: text, operational_updated_at: text, guest_user_id: nullableText, guest, provenance: booking.properties.provenance, record }, required: ['operational_booking_id', 'request_id', 'updated_at', 'operational_updated_at', 'guest', 'record'] }, domain: 'bookings', minimumRole: 'member', description: 'Read one product booking or consultation when the user wants its guest details, status or current session. Use its updated_at when proposing a change.', inputSchema: { operational_booking_id: bookingId }, required: ['operational_booking_id'],
  }),
  ...([
    ['confirm', 'Confirm a pending product booking or consultation after staff review. Keeps its existing session and capacity allocation, changes its status to confirmed and emails the guest. Does not collect payment.'],
    ['reject', 'Decline a pending product booking or consultation after staff review. Cancels the booking, releases its places and emails the guest the decision. If a refund is required, returns financial_action_required and a dashboard URL before changing status or preparing a refund; the rejection is incomplete. Use cancel_product_booking for a confirmed booking.'],
    ['cancel', 'Cancel a pending or confirmed product booking or consultation when the user requests cancellation. Releases its places and emails the guest. If a refund is required, returns financial_action_required and a dashboard URL before changing status or preparing a refund; the cancellation is incomplete.'],
  ] as const).map(([action, purpose]) => organizationTool({
    name: `${action}_product_booking`, outputSchema: operationResult, domain: 'bookings', minimumRole: 'member', description: `${purpose} Reuse the same idempotency_key only for an identical retry; a completed operation does not repeat its capacity change or delivered guest email. ${description}`,
    inputSchema: { operational_booking_id: bookingId, idempotency_key: key }, required: ['operational_booking_id', 'idempotency_key'],
  })),
  organizationTool({ name: 'request_product_booking_change', outputSchema: changeResult, domain: 'bookings', minimumRole: 'member', description: `Request a different session or party size for an existing product booking or consultation. Emails the guest a proposal; the current booking and its places remain unchanged until the guest accepts. Acceptance preserves its review status and requires available capacity. ${description}`,
    inputSchema: { operational_booking_id: bookingId, session_id: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_booking_id', 'session_id', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
  organizationTool({ name: 'cancel_table_reservation', outputSchema: operationResult, domain: 'bookings', minimumRole: 'admin', description: `Cancel an existing restaurant table reservation when the user requests cancellation. Releases its capacity and emails the guest. A paid reservation requires its full refund to be approved in the dashboard before cancellation. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, idempotency_key: key }, required: ['operational_reservation_id', 'idempotency_key'],
  }),
  organizationTool({ name: 'request_table_reservation_change', outputSchema: changeResult, domain: 'bookings', minimumRole: 'admin', description: `Request a change to a restaurant table reservation’s location, date, time or party size. Emails the guest a proposal; the current reservation remains unchanged until the guest accepts. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, override_policy: { type: 'boolean', description: 'True only when the business approves an exception to its change policy.' }, location_id: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_reservation_id', 'location_id', 'date', 'time', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
]

export async function handleBookingsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { organization, args, toolName, event } = ctx
  const { db, env, organizationId } = organization
  const principal = memberAccessPrincipal(organization.membership, { env })
  const managesBookings = await roleAllows({ ...principal, permissions: { operations: ['update'] } })
  if (toolName === 'create_product_session' || toolName === 'update_product_session') {
    const productId = requiredString(args, 'product_id')
    await assertProductAccess(db, { ...principal, productId })
    const current = toolName === 'update_product_session' ? await getSessionAvailability(db, organizationId, productId, requiredString(args, 'session_id')) : null
    const locationId = current ? current.location_id : args.location_id === null ? null : requiredString(args, 'location_id')
    if (managesBookings) await assertResourceAccess(db, { ...principal, resourceLocationId: locationId })
    if (current) {
      return { session: await updateSession(db, { organizationId, productId, sessionId: current.id, actorId: organization.userId, expectedUpdatedAt: requiredString(args, 'expected_updated_at'), startsAt: optionalString(args, 'starts_at') ?? undefined, endsAt: optionalString(args, 'ends_at') ?? undefined, capacity: args.capacity as number | null | undefined, status: args.status as 'scheduled' | 'cancelled' | undefined }) }
    }
    return { sessions: await createSession(db, { organizationId, productId, locationId, actorId: organization.userId, startsAt: requiredString(args, 'starts_at'), endsAt: requiredString(args, 'ends_at'), capacity: args.capacity as number | null | undefined, idempotencyKey: requiredString(args, 'idempotency_key') }) }
  }

  if (toolName === 'list_product_booking_sessions') {
    const from = requiredString(args, 'from')
    const to = requiredString(args, 'to')
    const start = Date.parse(from), end = Date.parse(to)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * 86400000) throw new HTTPError({ statusCode: 400, message: 'A valid date range of at most 93 days is required' })
    const productId = requiredString(args, 'product_id')
    await assertProductAccess(db, { ...principal, productId })
    const product = await queryFirst(db, 'SELECT id FROM products WHERE id = ? AND organization_id = ?', [productId, organizationId])
    if (!product) throw new HTTPError({ statusCode: 404, message: 'Product not found in this organization' })
    await refreshProductBusy(db,env,organizationId,productId)
    const sessions = await listSessions(db, { organizationId, productId, fromInstant: new Date(start).toISOString(), toInstant: new Date(end).toISOString() })
    const page = paginateMcpCollection(sessions, args, { resource: `booking-sessions:${organizationId}:${productId}:${from}:${to}` })
    return { sessions: page.items, page_info: page.page_info }
  }
  if(toolName==='reassign_product_booking')return reassignBookingProvider({env,organizationId,userId:organization.userId},{booking_id:requiredString(args,'operational_booking_id'),member_id:requiredString(args,'member_id'),expected_updated_at:requiredString(args,'expected_updated_at'),idempotency_key:requiredString(args,'idempotency_key')})
  if (toolName === 'list_product_bookings') {
    const filters: string[] = ['b.organization_id = ?']
    const params: Array<string | number | null> = [organizationId]
    if (!managesBookings) { filters.push(assignedBookingSql('b')); params.push(organization.userId) }
    for (const [argument, column] of [['assigned_member_id', 'b.assigned_member_id'], ['product_id', 'b.product_id']] as const) {
      if (typeof args[argument] === 'string') { filters.push(`${column} = ?`); params.push(args[argument] as string) }
    }
    if (args.status === 'completed') filters.push("b.status = 'confirmed' AND s.ends_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    else if (typeof args.status === 'string') {
      filters.push('b.status = ?'); params.push(args.status)
      if (args.status === 'confirmed') filters.push("s.ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    }
    if (Object.hasOwn(args, 'location_id')) { filters.push('s.location_id IS ?'); params.push(args.location_id as string | null) }
    for (const [argument, operator] of [['from', '>='], ['to', '<']] as const) {
      if (args[argument] !== undefined) {
        const instant = new Date(requiredString(args, argument))
        if (!Number.isFinite(instant.getTime())) throw new HTTPError({ statusCode: 400, message: `${argument} must be an ISO instant` })
        filters.push(`s.starts_at ${operator} ?`); params.push(instant.toISOString())
      }
    }
    const resource = { resource: `product-bookings:${JSON.stringify({ filters, params })}` }
    const window = mcpPageWindow(args, resource)
    const rows = await queryAll<Record<string, unknown> & { status: BookingStatus; ends_at: string; guest_json: string | null; provenance_json: string | null }>(db, `SELECT b.id AS operational_booking_id, b.request_id, b.product_id, b.product_variant_id, b.product_session_id, b.status, b.party_size, b.user_id, b.updated_at, b.assigned_member_id, s.location_id, s.starts_at, s.ends_at, s.timezone, json_extract(r.payload_json, '$.guest') AS guest_json, json_extract(r.payload_json, '$.provenance') AS provenance_json FROM bookings b JOIN product_sessions s ON s.id = b.product_session_id AND s.organization_id = b.organization_id LEFT JOIN requests r ON r.id = b.request_id AND r.organization_id = b.organization_id WHERE ${filters.join(' AND ')} ORDER BY s.starts_at DESC, b.id LIMIT ? OFFSET ?`, [...params, window.limit + 1, window.offset])
    const now = new Date().toISOString()
    const bookings = rows.slice(0, window.limit).map(({ guest_json, provenance_json, ...booking }) => ({ ...booking, is_complete: isBookingComplete(booking, now), guest: guest_json === null ? null : JSON.parse(guest_json), provenance: provenance_json === null ? null : JSON.parse(provenance_json) }))
    return { bookings, page_info: mcpPageInfo(window, bookings.length, rows.length > window.limit, resource) }
  }
  if (toolName === 'create_table_reservation') {
    if (!event) throw new HTTPError({ statusCode: 500, message: 'Reservation creation requires the request context' })
    const locationId = requiredString(args, 'location_id')
    await assertResourceAccess(db, { ...memberAccessPrincipal(organization.membership, { env }), resourceLocationId: locationId })
    const result = await createTableReservation(event, { financialWritesAllowed: false, organizationId,
      body: { name: args.guest_name, email: args.guest_email, phone: args.guest_phone, date: args.date, time: args.time, guests: String(args.party_size), requests: args.notes, location_id: locationId },
      operator: { userId: organization.userId, idempotencyKey: requiredString(args, 'idempotency_key'), source: requiredString(args, 'source'), externalReference: optionalString(args, 'external_reference') ?? null, guestAcknowledgement: args.guest_acknowledgement === true },
    })
    return renderStructuredResponse({ success: result.status < 400, ...result.body, http_status: result.status }, undefined, undefined, result.status >= 400)
  }
  if (toolName === 'create_product_booking') {
    if (!event) throw new HTTPError({ statusCode: 500, message: 'Booking creation requires the request context' })
    const result = await createProductBooking(event, {
      organizationId, slug: requiredString(args, 'product_slug'), body: args, financialWritesAllowed: false,
      operator: { userId: organization.userId, idempotencyKey: requiredString(args, 'idempotency_key'), source: requiredString(args, 'source'), externalReference: optionalString(args, 'external_reference') ?? null, guestAcknowledgement: args.guest_acknowledgement === true },
    })
    return renderStructuredResponse({ success: result.status < 400, ...result.body, http_status: result.status }, undefined, undefined, result.status >= 400)
  }
  if (!['get_product_booking', 'confirm_product_booking', 'reject_product_booking', 'cancel_product_booking', 'request_product_booking_change', 'cancel_table_reservation', 'request_table_reservation_change'].includes(toolName)) return NOT_HANDLED
  const reservation = toolName.includes('table_reservation')
  const id = requiredString(args, reservation ? 'operational_reservation_id' : 'operational_booking_id')
  if (!reservation) await assertAssignedBookingAccess(db, { ...principal, bookingId: id })
  const row = await queryFirst<{ request_id: string | null; updated_at: string }>(db, `SELECT request_id, updated_at FROM ${reservation ? 'reservations' : 'bookings'} WHERE id = ? AND organization_id = ?`, [id, organizationId])
  if (!row?.request_id) throw new HTTPError({ statusCode: 404, message: 'Operational booking with an inbox thread not found in this organization' })
  const thread = await getGuestRequest(db, row.request_id, organizationId, reservation ? 'reservation' : 'booking')
  if (!thread) throw new HTTPError({ statusCode: 404, message: 'Booking thread not found' })
  let operationalRecord = await getThreadOperationalRecord(db, thread.id)
  if (!operationalRecord || operationalRecord.id !== id || operationalRecord.kind !== thread.kind || operationalRecord.organization_id !== organizationId) throw new HTTPError({ statusCode: 404, message: 'Operational booking record not found in this organization' })
  if (toolName === 'get_product_booking') return { operational_booking_id: id, request_id: thread.id, updated_at: thread.updated_at, operational_updated_at: row.updated_at, guest_user_id: thread.user_id, guest: thread.payload.guest, provenance: thread.kind === 'booking' ? thread.payload.provenance ?? null : null, record: operationalRecord }
  const key = requiredString(args, 'idempotency_key')
  if (toolName.startsWith('request_')) {
    if (!reservation) await assertAssignedBookingAccess(db, { ...principal, bookingId: id, sessionId: requiredString(args, 'session_id') })
    const fields = reservation ? { kind: 'reservation', overridePolicy: args.override_policy, locationId: requiredString(args, 'location_id'), bookingDate: requiredString(args, 'date'), bookingTime: requiredString(args, 'time'), partySize: args.party_size } : { kind: 'booking', sessionId: requiredString(args, 'session_id'), partySize: args.party_size }
    await requestBookingChange(db, env, thread, organization.userId, { ...fields, expectedUpdatedAt: requiredString(args, 'expected_updated_at') }, key)
    await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
    operationalRecord = await getThreadOperationalRecord(db, thread.id)
    if (!operationalRecord || operationalRecord.id !== id || operationalRecord.kind !== thread.kind || operationalRecord.organization_id !== organizationId) throw new HTTPError({ statusCode: 404, message: 'Operational booking record not found in this organization' })
    return { success: true, request_id: thread.id, change_status: 'awaiting_guest_acceptance', record: operationalRecord }
  }
  const outcome = await executeGuestThreadOperation(db, { threadId: thread.id, organizationId, action: toolName.split('_')[0]!, actorUserId: organization.userId, idempotencyKey: key, env, financialWritesAllowed: false })
  if (outcome.ok || outcome.reason === 'delivery_failed') await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
  if (!outcome.ok) return renderStructuredResponse(outcome, undefined, undefined, true)
  operationalRecord = await getThreadOperationalRecord(db, thread.id)
  if (!operationalRecord || operationalRecord.id !== id || operationalRecord.kind !== thread.kind || operationalRecord.organization_id !== organizationId) throw new HTTPError({ statusCode: 404, message: 'Operational booking record not found in this organization' })
  return renderStructuredResponse({ ...outcome, record: operationalRecord })
}
