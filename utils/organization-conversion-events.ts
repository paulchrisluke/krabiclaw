// The one event catalog. Every conversion the platform records — native row,
// GA4 projection, report grouping — takes its meaning from this table. The DB
// CHECK constraint only validates shape, so a new event is added here and in
// the unique-index predicate in server/db/schema.ts when it has an entity.
//
// Themes render UI and call shared behavior; they never define conversion
// semantics.

export const CONVERSION_STAGES = ['schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff', 'completed'] as const
export type ConversionStage = typeof CONVERSION_STAGES[number]

export const CONVERSION_ENTITY_TYPES = ['request', 'product', 'content_block', 'content_document', 'user', 'organization', 'invoice', 'refund'] as const
export type ConversionEntityType = typeof CONVERSION_ENTITY_TYPES[number]

// quoted: the price the guest was shown when the booking was created — not revenue.
// purchase / refund: verified provider payment evidence.
export const CONVERSION_VALUE_BASES = ['quoted', 'purchase', 'refund'] as const
export type ConversionValueBasis = typeof CONVERSION_VALUE_BASES[number]

// Distinguishes the business domain of a submission or payment. A documented
// custom dimension, not a Google-defined revenue switch.
export const CONVERSION_TYPES = ['contact', 'reservation', 'booking', 'subscription'] as const
export type ConversionType = typeof CONVERSION_TYPES[number]

export interface ConversionEventDefinition {
  /** Who may produce the event. 'browser' events are the only ones the public click endpoint accepts. */
  producer: 'browser' | 'server'
  stages: readonly ConversionStage[]
  /** The business subject the event counts; null when the event has no entity. */
  entityType: ConversionEntityType | null
  /** The value semantics the event may carry; null means it never carries a value. */
  valueBasis: ConversionValueBasis | null
  conversionType: ConversionType | null
  /** The GA4 event this fact projects to, or null when it is a handoff with no GA4 meaning. */
  ga4: { name: string } | null
  /** Which sender owns the GA4 event: the visitor's browser or Measurement Protocol. Exactly one. */
  ga4Sender: 'browser' | 'measurement_protocol'
  /** Session conversion rate numerators: handoffs and refunds are not outcomes. */
  outcome: boolean
}

export const CONVERSION_EVENT_CATALOG = {
  consultation_cta_click: { producer: 'browser', stages: ['schedule_navigation', 'external_booking_handoff'], entityType: null, valueBasis: null, conversionType: null, ga4: { name: 'consultation_cta_click' }, ga4Sender: 'browser', outcome: false },
  contact_submit: { producer: 'server', stages: ['submitted'], entityType: 'request', valueBasis: null, conversionType: 'contact', ga4: { name: 'generate_lead' }, ga4Sender: 'browser', outcome: true },
  reservation_submit: { producer: 'server', stages: ['submitted'], entityType: 'request', valueBasis: null, conversionType: 'reservation', ga4: { name: 'reservation_submit' }, ga4Sender: 'browser', outcome: true },
  booking_submit: { producer: 'server', stages: ['submitted'], entityType: 'request', valueBasis: 'quoted', conversionType: 'booking', ga4: { name: 'booking_submit' }, ga4Sender: 'browser', outcome: true },
  product_order_external_click: { producer: 'browser', stages: ['external_handoff'], entityType: 'product', valueBasis: null, conversionType: null, ga4: { name: 'product_order_external_click' }, ga4Sender: 'browser', outcome: false },
  link_click: { producer: 'browser', stages: ['external_handoff'], entityType: 'content_block', valueBasis: null, conversionType: null, ga4: { name: 'link_click' }, ga4Sender: 'browser', outcome: false },
  donation_click: { producer: 'browser', stages: ['external_handoff'], entityType: 'content_document', valueBasis: null, conversionType: null, ga4: { name: 'donation_click' }, ga4Sender: 'browser', outcome: false },
  sign_up: { producer: 'server', stages: ['completed'], entityType: 'user', valueBasis: null, conversionType: null, ga4: { name: 'sign_up' }, ga4Sender: 'measurement_protocol', outcome: true },
  onboarding_complete: { producer: 'server', stages: ['completed'], entityType: 'organization', valueBasis: null, conversionType: null, ga4: { name: 'tutorial_complete' }, ga4Sender: 'measurement_protocol', outcome: true },
  purchase: { producer: 'server', stages: ['completed'], entityType: 'invoice', valueBasis: 'purchase', conversionType: 'subscription', ga4: { name: 'purchase' }, ga4Sender: 'measurement_protocol', outcome: true },
  refund: { producer: 'server', stages: ['completed'], entityType: 'refund', valueBasis: 'refund', conversionType: 'subscription', ga4: { name: 'refund' }, ga4Sender: 'measurement_protocol', outcome: false },
} as const satisfies Record<string, ConversionEventDefinition>

export type OrganizationConversionEventName = keyof typeof CONVERSION_EVENT_CATALOG

export const ORGANIZATION_CONVERSION_EVENT_NAMES = Object.keys(CONVERSION_EVENT_CATALOG) as OrganizationConversionEventName[]

/** Events whose row is unique per (organization, event, entity). Mirrors the unique index predicate. */
export const ENTITY_UNIQUE_CONVERSION_EVENT_NAMES = ORGANIZATION_CONVERSION_EVENT_NAMES.filter(
  name => CONVERSION_EVENT_CATALOG[name].producer === 'server',
)

export interface ConversionItem {
  item_id: string
  item_name: string
  item_variant?: string
  item_category?: string
  item_category2?: string
  item_category3?: string
  quantity: number
  /**
   * The line's total in minor units (an integer): net of the line's discounts and of any tax
   * included in its price. The unit price is derived from it at projection, so a line of 1,000
   * across three seats keeps its exact total instead of a rounded unit amount.
   */
  amount_minor: number
}

/** The immutable event-time value snapshot. Amounts stay in minor units; providers convert once. */
export interface ConversionValue {
  basis: ConversionValueBasis
  /** The event's value: what a quote showed, what a purchase earned excluding tax and shipping, or what a refund returned. */
  amount_minor: number
  /** Purchases and refunds: the cash actually moved (collected or returned), tax included. Reported separately from the tax-exclusive `amount_minor`. */
  collected_minor?: number
  currency: string
  transaction_id?: string
  items?: ConversionItem[]
}
