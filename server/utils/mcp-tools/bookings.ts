import { paginationInputSchema, organizationTool, type McpToolDefinition } from './shared'

const key = { type: 'string', minLength: 1, maxLength: 200, description: 'Caller-supplied durable idempotency key. Reuse only for the identical operation.' }
const bookingId = { type: 'string', description: 'Operational bookings.id, never the legacy public booking_id (requests.id).' }
const reservationId = { type: 'string', description: 'Operational reservations.id, never a request/thread ID.' }
const description = 'Obtain explicit user approval for these exact details before calling. This real-world write is audited and may email the guest. A model-generated confirm flag is not authorization.'

export const BOOKINGS_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'list_product_booking_sessions', domain: 'bookings', minimumRole: 'admin', confirmRequired: false,
    description: 'List existing tenant Product sessions and capacity with the canonical online calendar exclusion. Use returned session IDs for creation/change; this does not generate sessions or import external appointments.',
    inputSchema: { product_id: { type: 'string' }, from: { type: 'string', description: 'Inclusive ISO UTC instant.' }, to: { type: 'string', description: 'Exclusive ISO UTC instant, at most 93 days after from.' }, ...paginationInputSchema }, required: ['product_id', 'from', 'to'],
  }),
  organizationTool({ name: 'list_product_bookings', domain: 'bookings', minimumRole: 'admin', confirmRequired: false,
    description: 'List operational Product bookings in this tenant, with guest snapshots and canonical status. Returns bookings.id separately from the guest thread request_id.',
    inputSchema: { ...paginationInputSchema },
  }),
  organizationTool({ name: 'create_product_booking', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Create an ordinary Product→Variant→Session booking using the public booking service. Review offerings arrive pending; instant offerings arrive confirmed. Positive prices may be pay-later. Required online payment returns payment_required without creating an unpaid booking. No import, payment capture, paid assertion, or charge is performed. ${description}`,
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
    description: 'Read a tenant Product booking, guest snapshot, canonical operational status and latest updated_at for a change proposal.', inputSchema: { operational_booking_id: bookingId }, required: ['operational_booking_id'],
  }),
  ...(['confirm', 'reject', 'cancel'] as const).map(action => organizationTool({
    name: `${action}_product_booking`, domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `${action} a Product booking through the canonical inbox operation service. Confirm/reject apply to pending review bookings. Cancellation releases capacity exactly once. Guest status messages are delivered by the same workflow as dashboard. ${description}`,
    inputSchema: { operational_booking_id: bookingId, idempotency_key: key }, required: ['operational_booking_id', 'idempotency_key'],
  })),
  organizationTool({ name: 'request_product_booking_change', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Propose a different session or party size on the same Product. The existing booking remains until the guest accepts the emailed proposal. Accepted changes preserve review status and use canonical atomic capacity allocation. ${description}`,
    inputSchema: { operational_booking_id: bookingId, session_id: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_booking_id', 'session_id', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
  organizationTool({ name: 'cancel_table_reservation', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Cancel a real restaurant table reservation through its canonical inbox operation. Reservations do not have a Product confirmation/rejection transition. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, idempotency_key: key }, required: ['operational_reservation_id', 'idempotency_key'],
  }),
  organizationTool({ name: 'request_table_reservation_change', domain: 'bookings', minimumRole: 'admin', confirmRequired: true,
    description: `Propose a restaurant table location/date/time/party change; the guest must accept through the canonical emailed change flow. ${description}`,
    inputSchema: { operational_reservation_id: reservationId, location_id: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, party_size: { type: 'integer', minimum: 1, maximum: 99 }, expected_updated_at: { type: 'string' }, idempotency_key: key }, required: ['operational_reservation_id', 'location_id', 'date', 'time', 'party_size', 'expected_updated_at', 'idempotency_key'],
  }),
]
