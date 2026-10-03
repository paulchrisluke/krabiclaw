import type { McpToolDefinition } from './shared'
import { calendarDateSchema } from '~/utils/timezone'
import { locationListItemObject, locationMutationSummaryObject, locationObject, openingHoursInputSchema, pageInfoObject, paginationInputSchema, postalAddressSchema, seoOverrideFieldsSchema, organizationTool, specialHoursInputSchema } from './shared'

export const LOCATIONS_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'list_locations',
      description: 'List the selected site’s locations with their IDs, slugs, titles and active state. Location-scoped tools take these IDs.',
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { ...paginationInputSchema },
      outputSchema: {
        type: 'object',
        properties: {
          locations: { type: 'array', items: locationListItemObject },
          page_info: pageInfoObject,
        },
        required: ['locations', 'page_info'],
      },
    }),
  organizationTool({
      name: 'get_location',
      description: "Read one selected site location, including its contact details, opening hours, timezone and media. Use its returned ID for location-specific changes.",
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { location_id: { type: 'string', description: 'Internal location ID returned by list_locations or get_workspace_context.' } },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: { location: locationObject },
        required: ['location'],
      },
    }),
  organizationTool({
      name: 'update_location',
      description: 'Update a location\'s own details: regular opening hours, temporary closures/special hours, and contact info. To change its hero media, call set_media with { owner_type: "business_location", owner_id: <location.id>, slot: "hero" }. Only provided fields are changed.',
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Internal location ID returned by list_locations or get_workspace_context.' },
        address: postalAddressSchema,
        phone: { type: 'string', description: 'Public phone number shown to guests on the website and in booking/reservation confirmation emails.' },
        email: { type: ['string', 'null'], description: 'Public email shown to guests on the website and in booking/reservation confirmation emails. Pass null to clear it.' },
        timezone: { type: 'string', description: 'IANA time zone identifier for this location, e.g. Asia/Bangkok. Used to interpret opening hours and booking slots.' },
        max_capacity: { type: ['number', 'null'], description: 'Stored location capacity metadata; does not limit reservation availability. Reservation seats per start time are controlled by update_reservation_policy.slot_capacity. Pass null to clear the metadata.' },
        opening_hours: openingHoursInputSchema,
        special_hours: specialHoursInputSchema,
        ...seoOverrideFieldsSchema(),
      },
      required: ['location_id'],
      outputSchema: locationMutationSummaryObject,
    }),
  organizationTool({
      name: 'get_calendar',
      description: "Read a location’s reservations, product session bookings, published posts and unavailable dates when the user wants to review its calendar. Dates are inclusive local calendar days, with at most 62 days per call. Use kinds to filter the agenda.",
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Internal location ID returned by list_locations or get_workspace_context.' },
        from: { ...calendarDateSchema, description: 'First day, YYYY-MM-DD.' },
        to: { ...calendarDateSchema, description: 'Last day, YYYY-MM-DD, inclusive.' },
        kinds: { type: 'array', items: { type: 'string', enum: ['reservation', 'booking', 'post'] }, description: 'Limit to these kinds. Defaults to every kind the location offers.' },
      },
      required: ['location_id', 'from', 'to'],
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          available_kinds: { type: 'array', items: { type: 'string' } },
          unavailable_dates: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, reason: { type: 'string' } }, required: ['date', 'reason'] } },
          context: { type: 'object' },
        },
        required: ['items', 'available_kinds', 'unavailable_dates'],
      },
    }),
  organizationTool({
      name: 'block_dates',
      description: "Close a location for a whole-day date range when the user wants to prevent bookings on those dates. Both endpoints are inclusive. Adds a closure to special hours while retaining existing closures and dated hours.",
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Internal location ID returned by list_locations or get_workspace_context.' },
        from: { ...calendarDateSchema, description: 'First closed day, YYYY-MM-DD.' },
        to: { ...calendarDateSchema, description: 'Last closed day, YYYY-MM-DD, inclusive. Same as from for one day.' },
        note: { type: ['string', 'null'], description: 'Why, for the team; guests never see it.' },
      },
      required: ['location_id', 'from', 'to'],
      outputSchema: locationMutationSummaryObject,
    }),
  organizationTool({
      name: 'open_dates',
      description: "Remove temporary closures for an inclusive date range when the user wants to reopen a location. Closure dates outside the range and their notes are preserved. Regularly closed weekdays stay closed; change opening_hours with update_location to open those weekdays.",
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Internal location ID returned by list_locations or get_workspace_context.' },
        from: { ...calendarDateSchema, description: 'First reopened day, YYYY-MM-DD.' },
        to: { ...calendarDateSchema, description: 'Last reopened day, YYYY-MM-DD, inclusive. Same as from for one day.' },
      },
      required: ['location_id', 'from', 'to'],
      outputSchema: locationMutationSummaryObject,
    }),
]
