import type { McpToolDefinition } from './shared'
import { calendarDateSchema } from '~/utils/timezone'
import { locationListItemObject, locationMutationSummaryObject, locationObject, openingHoursInputSchema, pageInfoObject, paginationInputSchema, postalAddressSchema, seoOverrideFieldsSchema, organizationTool, specialHoursInputSchema } from './shared'

export const LOCATIONS_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'list_locations',
      description: 'List site locations in a compact format with ids, slugs, titles, and active-state markers so you can target location-scoped tools reliably.',
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
      inputSchema: { location_id: { type: 'string', description: 'Location id or slug.' } },
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
        location_id: { type: 'string', description: 'Location id or slug.' },
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
      description: 'What is on one location\'s calendar between two dates, as the dashboard calendar shows it: every reservation, experience booking and published post, plus which dates the location cannot take — its own closures, a location that is not active, and weekdays its hours never open. Dates are the location\'s local calendar days. At most 62 days per call.',
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Location id or slug.' },
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
      description: 'Close a location for every day from one date to another, inclusive, so guests cannot book those days — the same closure the calendar\'s Block writes to the location\'s special hours. Whole days only. Existing closures and dated hours are kept.',
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Location id or slug.' },
        from: { ...calendarDateSchema, description: 'First closed day, YYYY-MM-DD.' },
        to: { ...calendarDateSchema, description: 'Last closed day, YYYY-MM-DD, inclusive. Same as from for one day.' },
        note: { type: ['string', 'null'], description: 'Why, for the team; guests never see it.' },
      },
      required: ['location_id', 'from', 'to'],
      outputSchema: locationMutationSummaryObject,
    }),
  organizationTool({
      name: 'open_dates',
      description: 'Reopen a location for every day from one date to another, inclusive — the same as the calendar\'s Open. Every closure covering any of those days is cut around the range so the days outside it stay closed with their note; dated hours with no periods on those days are removed. Weekdays the regular hours never open stay closed: change opening_hours for that.',
      domain: 'locations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Location id or slug.' },
        from: { ...calendarDateSchema, description: 'First reopened day, YYYY-MM-DD.' },
        to: { ...calendarDateSchema, description: 'Last reopened day, YYYY-MM-DD, inclusive. Same as from for one day.' },
      },
      required: ['location_id', 'from', 'to'],
      outputSchema: locationMutationSummaryObject,
    }),
]
