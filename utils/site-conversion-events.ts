// Single source of truth for the site_conversion_events.event_name values a
// tenant site is allowed to record. The DB CHECK constraint only validates
// shape (lowercase snake_case, bounded length), not this specific list, so a
// future vertical can add its own event name here without a schema migration.
export const SITE_CONVERSION_EVENT_NAMES = [
  'consultation_cta_click',
  'contact_submit',
  'reservation_submit',
  'experience_booking_submit',
  'donation_click',
  'link_click',
  'product_order_external_click',
] as const

export type SiteConversionEventName = typeof SITE_CONVERSION_EVENT_NAMES[number]
