import { paginationInputSchema, organizationTool, type McpToolDefinition } from './shared'

const key = { type: 'string', minLength: 1, maxLength: 200, description: 'Caller-supplied durable idempotency key. Reuse only for the identical operation.' }
const bookingId = { type: 'string', description: 'Booking ID returned by list_product_bookings or create_product_booking. Distinct from request_id, which identifies the inbox conversation.' }
const reservationId = { type: 'string', description: 'Reservation ID from list_reservation_inquiries. Distinct from the inbox conversation ID.' }
const description = 'Call after the user approves the exact change. Records the action in the inbox history and may send email to the guest.'

export const BOOKINGS_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'list_product_booking_sessions', domain: 'bookings', minimumRole: 'admin', confirmRequired: false,
    description: 'List scheduled sessions and remaining places for a product when the user wants to find a time for a booking or consultation. Includes conflicts with other appointments in its shared calendar. Use the returned session IDs to create or change a booking. This tool does not create sessions.',
    inputSchema: { product_id: { type: 'string' }, from: { type: 'string', description: 'Inclusive ISO UTC instant.' }, to: { type: 'string', description: 'Exclusive ISO UTC instant, at most 93 days after from.' }, ...paginationInputSchema }, required: ['product_id', 'from', 'to'],
  }),
  organizationTool({ name: 'list_product_bookings', domain: 'bookings', minimumRole: 'admin', confirmRequired: false,
    description: 'List product bookings and consultations for the selected site when the user wants to review appointments, guests or booking status. Returns booking IDs and their inbox conversation IDs. Table reservations use list_reservation_inquiries.',
    inputSchema: { ...paginationInputSchema },
  }),
  organizationTool({ name: 'create_product_booking', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Create a guest booking or consultation for a published product and an existing session. Requires an available numeric price; specify variant_id when the product has multiple active variants. Staff-review bookings remain pending; instant bookings are confirmed. Paid offerings may allow payment later. If online payment is required, returns payment_required without creating a booking. Does not collect payment. Sends owner alerts and sends the guest an acknowledgement only when guest_acknowledgement is true. ${description}`,
    inputSchema: {
      product_slug: { type: 'string' }, session_id: { type: 'string' }, variant_id: { type: 'string' },
      party_size: { type: 'integer', minimum: 1, maximum: 99 }, guest_name: { type: 'string', minLength: 1 },
      guest_email: { type: 'string' }, guest_phone: { type: 'string', description: 'Optional guest phone in international format.' }, notes: { type: 'string', maxLength: 1000 },
      idempotency_key: key, source: { type: 'string', minLength: 1, maxLength: 100, description: 'Explicit provenance, such as operator or external scheduler.' },
      external_reference: { type: 'string', maxLength: 200 },
      guest_acknowledgement: { type: 'boolean', description: 'Explicit choice to send the guest creation email. Owner alerts, inbox, and audit always remain.' },
    }, required: ['product_slug', 'session_id', 'party_size', 'guest_name', 'guest_email', 'idempotency_key', 'source', 'guest_acknowledgement'],
  }),
  organizationTool({ name: 'get_product_booking', domain: 'bookings', minimumRole: 'admin', confirmRequired: false,
    description: 'Read one product booking or consultation when the user wants its guest details, status or current session. Use its updated_at when proposing a change.', inputSchema: { operational_booking_id: bookingId }, required: ['operational_booking_id'],
  }),
  ...([
    ['confirm', 'Confirm a pending product booking or consultation after staff review. Keeps its existing capacity allocation and emails the guest confirmation.'],
    ['reject', 'Decline a pending product booking or consultation after staff review. Cancels the booking, releases its places and emails the guest the decision.'],
    ['cancel', 'Cancel a pending or confirmed product booking or consultation when the user requests cancellation. Releases its places and emails the guest the cancellation.'],
  ] as const).map(([action, purpose]) => organizationTool({
    name: `${action}_product_booking`, domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `${purpose} ${description}`,
    inputSchema: { operational_booking_id: bookingId, idempotency_key: key }, required: ['operational_booking_id', 'idempotency_key'],
  })),
  organizationTool({ name: 'request_product_booking_change', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Request a different session or party size for an existing product booking or consultation. Emails the guest a proposal; the current booking and its places remain unchanged until the guest accepts. Acceptance preserves its review status and requires available capacity. ${description}`,
    inputSchema: { operational_booking_id: bookingId, session_id: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_booking_id', 'session_id', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
  organizationTool({ name: 'cancel_table_reservation', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Cancel an existing restaurant table reservation when the user requests cancellation. Releases its capacity and emails the guest the cancellation. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, idempotency_key: key }, required: ['operational_reservation_id', 'idempotency_key'],
  }),
  organizationTool({ name: 'request_table_reservation_change', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Request a change to a restaurant table reservation’s location, date, time or party size. Emails the guest a proposal; the current reservation remains unchanged until the guest accepts. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, location_id: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_reservation_id', 'location_id', 'date', 'time', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
]
