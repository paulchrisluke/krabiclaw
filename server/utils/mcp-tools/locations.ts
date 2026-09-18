import type { McpToolDefinition } from './shared'
import { locationListItemObject, locationMutationSummaryObject, locationObject, openingHoursInputSchema, pageInfoObject, paginationInputSchema, postalAddressSchema, seoOverrideFieldsSchema, siteTool, specialHoursInputSchema } from './shared'

export const LOCATIONS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_locations',
      description: 'List site locations in a compact format with ids, slugs, titles, and active-state markers so you can target location-scoped tools reliably.',
      domain: 'locations',
      minimumRole: 'editor',
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
  siteTool({
      name: 'get_location',
      description: 'Get one location.',
      domain: 'locations',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { location_id: { type: 'string', description: 'Location id or slug.' } },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: { location: locationObject },
        required: ['location'],
      },
    }),
  siteTool({
      name: 'update_location',
      description: 'Update a location\'s own details: regular opening hours, temporary closures/special hours, contact info, and social/delivery links. To change its hero media, call set_media with { owner_type: "business_location", owner_id: <location.id>, slot: "hero" }. Only provided fields are changed.',
      domain: 'locations',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Location id or slug.' },
        address: postalAddressSchema,
        phone: { type: 'string', description: 'Public phone number shown to guests on the website and in booking/reservation confirmation emails.' },
        email: { type: ['string', 'null'], description: 'Public email shown to guests on the website and in booking/reservation confirmation emails. Pass null to clear it.' },
        notification_phone: locationObject.properties.notification_phone,
        timezone: { type: 'string', description: 'IANA time zone identifier for this location, e.g. Asia/Bangkok. Used to interpret opening hours and booking slots.' },
        max_capacity: { type: ['number', 'null'], description: 'Maximum total guests this location can seat per reservation time slot. Reservation slots are still generated and bookable when this is left unset (no cap enforced) — set it to actually limit how many guests can book the same time slot. Pass null to clear it.' },
        facebook_url: { type: 'string', description: 'Full Facebook page URL for this location, e.g. https://facebook.com/yourpage. Include the https:// scheme.' },
        instagram_url: { type: 'string', description: 'Full Instagram profile URL for this location, e.g. https://instagram.com/yourhandle. Include the https:// scheme.' },
        tiktok_url: { type: 'string', description: 'Full TikTok profile URL for this location, e.g. https://tiktok.com/@yourhandle. Include the https:// scheme.' },
        grab_url: { type: 'string', description: 'Grab delivery/booking URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
        uber_eats_url: { type: 'string', description: 'Uber Eats URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
        foodpanda_url: { type: 'string', description: 'Foodpanda URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
        opening_hours: openingHoursInputSchema,
        special_hours: specialHoursInputSchema,
        ...seoOverrideFieldsSchema(),
      },
      required: ['location_id'],
      outputSchema: locationMutationSummaryObject,
    }),
]
