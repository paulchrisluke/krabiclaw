export const PUBLICATION_CONTENT_DOCUMENT_OWNER_TYPES = [
  'platform_blog',
  'platform_doc',
  'tenant_blog',
] as const

export const CONTENT_DOCUMENT_OWNER_TYPES = [
  ...PUBLICATION_CONTENT_DOCUMENT_OWNER_TYPES,
  'tenant_page',
] as const

export type ContentDocumentOwnerType = typeof CONTENT_DOCUMENT_OWNER_TYPES[number]

export const PUBLICATION_CONTENT_BLOCK_TYPES = [
  'heading',
  'markdown',
  'image',
  'gallery',
  'faq',
  'how_to',
  'divider',
  'ai_assistance',
  'cta',
  'callout',
] as const

export const CONTENT_BLOCK_TYPES = [
  ...PUBLICATION_CONTENT_BLOCK_TYPES,
  'hero',
  'button_group',
  'feature_grid',
  'testimonial_grid',
  'contact_cta',
  'booking_cta',
  'donation_choices',
  'offering_grid',
  'location_grid',
] as const

export type ContentBlockType = typeof CONTENT_BLOCK_TYPES[number]
