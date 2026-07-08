// AUTO-SPLIT from the former monolithic mcp-tools.ts. Shared schema fragments,
// annotation helpers, and tool-builder functions used across MCP_TOOLS domain files.
import type { McpToolRole } from '~/server/utils/mcp-auth'
import { EXPERIENCE_STATUSES } from '~/server/utils/experiences'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'

export interface McpToolDefinition {
  name: string
  description: string
  domain: string
  minimumRole: McpToolRole
  confirmRequired: boolean
  annotations: McpToolAnnotations
  securitySchemes: McpToolSecurityScheme[]
  requiredEntitlement?: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  fileParams?: string[]
  uiResourceUri?: string
}

export interface McpToolAnnotations {
  readOnlyHint: boolean
  openWorldHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
}

export interface McpToolSecurityScheme {
  type: 'oauth2'
  scopes: string[]
}

export const MCP_TOOL_SECURITY_SCHEMES: McpToolSecurityScheme[] = [
  { type: 'oauth2', scopes: ['tenant'] },
]

// --- reusable schema fragments ---

export const openingHoursInputSchema = {
  type: ['string', 'object', 'null'],
  description: 'Opening hours for this location. Accepted shapes: (1) an object { weekdayDescriptions: string[] } with one entry per day, e.g. { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM", ...] } — this is also the shape returned by get_location; (2) a plain string with one day per line, e.g. "Monday: 9:00 AM – 5:00 PM\\nTuesday: 9:00 AM – 5:00 PM". A bare array of per-day structured objects (e.g. { openDay, openTime, closeTime }) is NOT supported — convert to weekdayDescriptions strings first. Pass null to clear.',
}

export const specialHoursInputSchema = {
  type: ['object', 'null'],
  description: 'A temporary closure or special-hours override for this specific location, e.g. "closed for renovations for two weeks" or "closed until July 17". Shape: { closed: boolean, starts_on?: "YYYY-MM-DD" (defaults to today if omitted), ends_on?: "YYYY-MM-DD" (omit for an indefinite closure), note?: string — a short guest-facing message, e.g. "Closed for renovations — back July 18th!" }. Convert relative durations like "2 weeks" into a concrete ends_on date yourself before calling. This only affects this location\'s own page, never the site-wide homepage. Pass null for the whole field to clear it and reopen the location.',
  properties: {
    closed: { type: 'boolean' },
    starts_on: { type: ['string', 'null'] },
    ends_on: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
  },
  required: ['closed'],
}

export const locationObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    city: { type: ['string', 'null'] },
    neighborhood: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    website_url: { type: ['string', 'null'] },
    maps_url: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] },
    opening_hours: { type: ['object', 'null'] },
    special_hours: { type: ['object', 'null'] },
    rating: { type: ['number', 'null'] },
    review_count: { type: ['number', 'null'] },
    description: { type: ['string', 'null'] },
    short_description: { type: ['string', 'null'] },
    status: { type: 'string' },
    is_primary: { type: 'number' },
    hero_image_asset_id: { type: ['string', 'null'] },
    hero_video_asset_id: { type: ['string', 'null'] },
    notification_phone: { type: ['string', 'null'], description: 'WhatsApp number for internal booking/reservation alerts to this location\'s manager. Not shown to guests. Falls back to the site-level whatsapp_phone if null.' },
    timezone: { type: ['string', 'null'], description: 'IANA time zone identifier for this location, e.g. Asia/Bangkok. Used to interpret opening hours and booking slots.' },
    facebook_url: { type: ['string', 'null'] },
    instagram_url: { type: ['string', 'null'] },
    tiktok_url: { type: ['string', 'null'] },
    grab_url: { type: ['string', 'null'] },
    uber_eats_url: { type: ['string', 'null'] },
    foodpanda_url: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

export const locationMutationResultObject = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    location: locationObject,
  },
  required: ['success', 'location'],
}

export const locationMutationSummaryObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['location'] },
    id: { type: 'string' },
    slug: { type: 'string' },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const menuItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    menu_id: { type: 'string' },
    section: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: ['string', 'null'] },
    price_amount: { type: ['string', 'number', 'null'] },
    compare_at_price_amount: { type: ['string', 'number', 'null'] },
    sale_starts_at: { type: ['string', 'null'] },
    sale_ends_at: { type: ['string', 'null'] },
    image_asset_id: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    kind: { type: ['string', 'null'] },
    available: { type: 'boolean' },
    featured: { type: 'boolean' },
    featured_sort_order: { type: 'number' },
    sort_order: { type: 'number' },
    allergens: { type: ['array', 'null'], items: { type: 'string' } },
    ingredients: { type: ['array', 'null'], items: { type: 'string' } },
    dietary_notes: { type: ['array', 'null'], items: { type: 'string' } },
    preparation: { type: ['string', 'null'] },
    serving_note: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    created_by: { type: ['string', 'null'] },
    updated_by: { type: ['string', 'null'] },
  },
  required: ['id', 'menu_id', 'section', 'name', 'slug', 'available', 'featured', 'featured_sort_order', 'sort_order', 'created_at', 'updated_at'],
}

export const menuMutationResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['menu'] },
    id: { type: 'string' },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const menuItemMutationResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['menu_item'] },
    id: { type: 'string' },
    slug: { type: 'string' },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const menuObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          items: { type: 'array', items: menuItemObject },
        },
      },
    },
  },
}

export const blogPostMutationResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['blog_post'] },
    id: { type: 'string' },
    slug: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const blogPostObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    body: { type: 'string' },
    excerpt: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['faq', 'how_to'] },
          label: { type: ['string', 'null'] },
          status: { type: ['string', 'null'], enum: ['active', 'inactive', null] },
          render_enabled: { type: ['boolean', 'null'] },
          schema_enabled: { type: ['boolean', 'null'] },
          position: { type: ['number', 'null'] },
          data: { type: 'object' },
        },
      },
    },
    seo_description: { type: ['string', 'null'] },
    seo_keywords: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    robots: { type: ['string', 'null'] },
    author_name: { type: ['string', 'null'] },
    published: { type: 'boolean' },
    published_at: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    featured_image: {
      type: ['object', 'null'],
      properties: {
        asset_id: { type: ['string', 'null'] },
        public_url: { type: ['string', 'null'] },
        kind: { type: ['string', 'null'] },
        width: { type: ['number', 'null'] },
        height: { type: ['number', 'null'] },
      },
    },
    admin_edit_url: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    preview_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
  },
}

export const postMutationResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['post'] },
    id: { type: 'string' },
    slug: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const postPublishResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['post'] },
    id: { type: 'string' },
    slug: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    channels: { type: 'array', items: { type: 'string' } },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const postObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    body: { type: 'string' },
    post_type: { type: 'string', enum: ['standard', 'offer', 'event', 'update'] },
    location_id: { type: ['string', 'null'] },
    cta_type: { type: ['string', 'null'] },
    cta_url: { type: ['string', 'null'] },
    event_title: { type: ['string', 'null'] },
    event_start: { type: ['string', 'null'] },
    event_end: { type: ['string', 'null'] },
    offer_coupon: { type: ['string', 'null'] },
    offer_terms: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['draft', 'published', 'scheduled', 'archived'] },
    scheduled_for: { type: ['string', 'null'] },
    published_at: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    og_image_asset_id: { type: ['string', 'null'] },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mediaAssetId: { type: ['string', 'null'] },
          url: { type: 'string' },
          googleUrl: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
          mediaFormat: { type: 'string', enum: ['IMAGE', 'VIDEO'] },
          role: { type: ['string', 'null'], enum: ['cover', 'gallery', null] },
          caption: { type: ['string', 'null'] },
          altText: { type: ['string', 'null'] },
        },
      },
    },
    gallery_media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mediaAssetId: { type: ['string', 'null'] },
          url: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
          role: { type: ['string', 'null'], enum: ['cover', 'gallery', null] },
          caption: { type: ['string', 'null'] },
          altText: { type: ['string', 'null'] },
        },
      },
    },
    channels: {
      type: 'array',
      description: 'Per-channel publish job status. Check this for facebook/instagram publish failures — publish_post can succeed overall while an individual channel is skipped or failed.',
      items: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['site', 'gmb', 'instagram', 'facebook'] },
          status: { type: 'string', enum: ['pending', 'published', 'failed', 'skipped'] },
          error: { type: ['string', 'null'] },
          published_at: { type: ['string', 'null'] },
        },
        required: ['channel', 'status'],
      },
    },
    thumbnail_asset_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

export const mediaAssetObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['image', 'video'] },
    provider: { type: 'string' },
    source: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    alt_text: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'active', 'deleted'] },
    file_name: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
}

export const currentUserObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    role: { type: ['string', 'null'] },
    isPlatformAdmin: { type: 'boolean' },
  },
  required: ['id', 'isPlatformAdmin'],
}

export const fileReferenceObject = {
  type: 'object',
  properties: {
    download_url: { type: 'string' },
    file_id: { type: 'string' },
    mime_type: { type: 'string' },
    file_name: { type: 'string' },
  },
  required: ['download_url', 'file_id'],
}

export const chatgptFileInput = {
  ...fileReferenceObject,
  description: 'Authorized file reference supplied by ChatGPT after rewriting the declared top-level file argument, including a temporary download_url and file_id.',
}

export const experienceObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    tagline: { type: ['string', 'null'] },
    body: { type: ['string', 'null'] },
    duration_minutes: { type: ['number', 'null'] },
    price: { type: ['string', 'null'] },
    price_amount: { type: ['number', 'null'] },
    compare_at_price_amount: { type: ['number', 'null'] },
    sale_starts_at: { type: ['string', 'null'] },
    sale_ends_at: { type: ['string', 'null'] },
    max_capacity: { type: ['number', 'null'] },
    status: { type: 'string', enum: [...EXPERIENCE_STATUSES] },
    location_id: { type: ['string', 'null'] },
    image_asset_id: { type: ['string', 'null'] },
    image_url: { type: ['string', 'null'] },
    video_asset_id: { type: ['string', 'null'] },
    video_url: { type: ['string', 'null'] },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
        },
        required: ['url', 'kind'],
      },
    },
    time_slots: { type: ['array', 'null'], items: { type: 'string' } },
    recurring_slots: {
      type: ['object', 'null'],
      additionalProperties: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    available_note: { type: ['string', 'null'] },
    highlights: { type: 'array', items: { type: 'string' } },
    included_items: { type: 'array', items: { type: 'string' } },
    what_to_bring: { type: 'array', items: { type: 'string' } },
    meeting_point: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    featured: { type: 'boolean' },
    featured_sort_order: { type: 'number' },
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

export const experienceMutationResultObject = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    entity: { type: 'string', enum: ['experience'] },
    id: { type: 'string' },
    slug: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    changed_fields: { type: 'array', items: { type: 'string' } },
    updated_at: { type: 'string' },
    context: { type: 'object' },
  },
  required: ['ok', 'entity', 'id'],
}

export const experienceStatusSchema = { type: 'string', enum: [...EXPERIENCE_STATUSES] }

export const experienceWriteSchema = {
  title: { type: 'string', description: 'Public name of the experience.' },
  tagline: { type: ['string', 'null'], description: 'Short one-line hook shown in cards and summaries. Keep this concise; do not dump the full description here.' },
  body: { type: ['string', 'null'], description: 'Main long-form description for the experience. Use this for the full narrative, inclusions, what guests can expect, and important details that do not have a dedicated field.' },
  image_asset_id: { type: ['string', 'null'], description: 'Primary image asset id from get_site_media_assets.' },
  video_asset_id: { type: ['string', 'null'], description: 'Primary video asset id from get_site_media_assets.' },
  images: {
    type: 'array',
    description: 'Optional additional media gallery for this experience. Use this for extra photos or videos beyond the primary image/video.',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        kind: { type: 'string', enum: ['image', 'video'] },
      },
      required: ['url', 'kind'],
    },
  },
  price: { type: ['string', 'null'], description: 'Optional display override for pricing text, e.g. "Ask us" or "Free".' },
  price_amount: { type: ['number', 'null'], description: 'Numeric price amount when the experience has a concrete price.' },
  compare_at_price_amount: { type: ['number', 'null'], description: 'Regular/pre-sale price. Set alongside price_amount to run a sale.' },
  sale_starts_at: { type: ['string', 'null'], description: 'ISO 8601 date/time the sale becomes active. Optional.' },
  sale_ends_at: { type: ['string', 'null'], description: 'ISO 8601 date/time the sale ends. Optional.' },
  duration_minutes: { type: ['number', 'null'], description: 'Expected duration in minutes.' },
  max_capacity: { type: ['number', 'null'], description: 'Maximum guest count for a single booking or session.' },
  time_slots: { type: ['array', 'null'], items: { type: 'string' }, description: 'Flat daily time slots in HH:MM format, used when the same schedule applies every day.' },
  recurring_slots: {
    type: ['object', 'null'],
    description: 'Per-weekday time slots in HH:MM format when the schedule differs by day. Keys must be full weekday names such as Monday or Friday.',
    additionalProperties: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  available_note: { type: ['string', 'null'], description: 'Short urgency or availability note, e.g. "Last 2 spots".' },
  highlights: { type: ['array', 'null'], items: { type: 'string' }, description: 'Short bullet-point highlights for the experience. Use one concise string per highlight.' },
  included_items: { type: ['array', 'null'], items: { type: 'string' }, description: 'Explicit list of what is included. Use one concise string per included item.' },
  what_to_bring: { type: ['array', 'null'], items: { type: 'string' }, description: 'Explicit list of what guests should bring or prepare. Use one concise string per item.' },
  meeting_point: { type: ['string', 'null'], description: 'Specific arrival or check-in instruction for guests.' },
  status: experienceStatusSchema,
  sort_order: { type: 'number', description: 'Lower numbers sort earlier in lists.' },
  featured: { type: 'boolean', description: 'Whether this experience should be highlighted in featured placements.' },
  featured_sort_order: { type: 'number', description: 'Lower numbers sort earlier among featured experiences.' },
  location_id: { type: 'string', description: 'Optional location id. If omitted, the site primary location is used when available. If the site has no primary location yet, create a location first or pass a valid location_id.' },
  seo_title: { type: ['string', 'null'], description: 'Optional SEO title override.' },
  seo_description: { type: ['string', 'null'], description: 'Optional SEO description override.' },
} as const

export const renderedBookingPolicySummaryObject = {
  type: 'object',
  properties: {
    heading: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['id', 'text'],
      },
    },
    additional_notes_html: { type: ['string', 'null'] },
  },
  required: ['heading', 'items', 'additional_notes_html'],
}

export const bookingPolicyObject = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'] },
    organization_id: { type: ['string', 'null'] },
    site_id: { type: 'string' },
    policy_type: { type: 'string', enum: ['reservation', 'experience'] },
    scope_type: { type: 'string', enum: ['site', 'location', 'experience'] },
    location_id: { type: ['string', 'null'] },
    experience_id: { type: ['string', 'null'] },
    booking_window_days: { type: ['number', 'null'] },
    advance_notice_minutes: { type: ['number', 'null'] },
    free_cancellation_until_minutes: { type: ['number', 'null'] },
    late_arrival_grace_minutes: { type: ['number', 'null'] },
    host_confirmation_sla_minutes: { type: ['number', 'null'] },
    reschedule_allowed: { type: 'boolean' },
    reschedule_cutoff_minutes: { type: ['number', 'null'] },
    deposit_required: { type: 'boolean' },
    deposit_trigger_party_size: { type: ['number', 'null'] },
    special_requests_allowed: { type: 'boolean' },
    weather_policy: { type: ['string', 'null'] },
    minimum_guest_age: { type: ['number', 'null'] },
    accessibility_contact_required: { type: 'boolean' },
    additional_notes_html: { type: ['string', 'null'] },
    source_scope: { type: ['string', 'null'] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
  },
}

export const bookingPolicyWriteSchema = {
  policy_type: { type: 'string', enum: ['reservation', 'experience'] },
  scope_type: { type: 'string', enum: ['site', 'location', 'experience'] },
  location_id: { type: 'string', description: 'Optional location id when editing a location-scoped reservation or experience default policy.' },
  experience_id: { type: 'string', description: 'Optional experience id when editing an experience-specific policy override.' },
  booking_window_days: { type: ['number', 'null'] },
  advance_notice_minutes: { type: ['number', 'null'] },
  free_cancellation_until_minutes: { type: ['number', 'null'] },
  late_arrival_grace_minutes: { type: ['number', 'null'] },
  host_confirmation_sla_minutes: { type: ['number', 'null'] },
  reschedule_allowed: { type: 'boolean' },
  reschedule_cutoff_minutes: { type: ['number', 'null'] },
  deposit_required: { type: 'boolean' },
  deposit_trigger_party_size: { type: ['number', 'null'] },
  special_requests_allowed: { type: 'boolean' },
  weather_policy: { type: ['string', 'null'] },
  minimum_guest_age: { type: ['number', 'null'] },
  accessibility_contact_required: { type: 'boolean' },
  additional_notes_html: { type: ['string', 'null'] },
  locale: { type: 'string', description: 'Optional locale code for the rendered preview copy. Defaults to en.' },
} as const

export const bookingObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    experience_id: { type: 'string' },
    experience_title: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    location_title: { type: ['string', 'null'] },
    guest_name: { type: 'string' },
    guest_email: { type: 'string' },
    guest_phone: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
    booking_date: { type: ['string', 'null'] },
    time_slot: { type: ['string', 'null'] },
    party_size: { type: 'number' },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
}

export const bookingsSummaryObject = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    by_status: { type: 'object', description: 'Count of bookings per status, e.g. { pending: 2, confirmed: 5 }.' },
    by_experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          experience_id: { type: 'string' },
          experience_title: { type: ['string', 'null'] },
          count: { type: 'number' },
        },
      },
    },
  },
  required: ['total', 'by_status'],
}

export const qaItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    question: { type: 'string' },
    answer: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    location_id: { type: 'string' },
  },
}

export const reviewObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    author: { type: 'string' },
    rating: { type: 'number' },
    text: { type: ['string', 'null'] },
    reply: { type: ['string', 'null'] },
    source: { type: 'string' },
    published_at: { type: ['string', 'null'] },
    location_id: { type: 'string' },
  },
}

export const submissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    message: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'read', 'replied', 'spam'] },
    created_at: { type: 'string' },
  },
}

export const reservationSubmissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    guests: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    time: { type: ['string', 'null'] },
    requests: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'confirmed', 'cancelled', 'completed'] },
    created_at: { type: 'string' },
    location_id: { type: ['string', 'null'] },
    location_title: { type: ['string', 'null'] },
  },
}

export const workRequestObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['open', 'in_progress', 'done', 'cancelled'] },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

export const translationJobObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source_locale: { type: 'string' },
    target_locale: { type: 'string' },
    scope: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
    total_items: { type: 'number' },
    total_chars: { type: 'number' },
    estimated_credits: { type: 'number' },
    actual_credits: { type: ['number', 'null'] },
    processed_items: { type: 'number' },
    failed_items: { type: 'number' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    started_at: { type: ['string', 'null'] },
    finished_at: { type: ['string', 'null'] },
  },
}

export const siteListItem = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    organizationId: { type: 'string' },
    organizationName: { type: ['string', 'null'] },
    name: { type: 'string', description: 'Brand name or subdomain slug.' },
    subdomain: { type: 'string' },
    orgSlug: { type: 'string', description: 'Organization slug — combine with this site\'s subdomain and locationSlug from list_locations to build the dashboard URL: https://krabiclaw.com/dashboard/{orgSlug}/sites/{subdomain}/{locationSlug}' },
    publicUrl: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['draft', 'live', 'paused'] },
    active: { type: 'boolean', description: 'True when this is the currently active MCP site context.' },
  },
  required: ['id', 'organizationId', 'name', 'subdomain', 'orgSlug', 'status', 'active'],
}

export const locationListItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    city: { type: ['string', 'null'] },
    status: { type: 'string' },
    is_primary: { type: 'boolean' },
    active: { type: 'boolean', description: 'True when this is the currently active MCP location context.' },
  },
  required: ['id', 'slug', 'title', 'status', 'is_primary', 'active'],
}

export const workspaceContextObject = {
  type: 'object',
  properties: {
    organization_id: { type: ['string', 'null'] },
    organization_name: { type: ['string', 'null'] },
    organization_slug: { type: ['string', 'null'] },
    site_id: { type: ['string', 'null'] },
    site_name: { type: ['string', 'null'] },
    site_subdomain: { type: ['string', 'null'] },
    site_public_url: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    location_slug: { type: ['string', 'null'] },
    location_title: { type: ['string', 'null'] },
  },
}

export const organizationListItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    slug: { type: ['string', 'null'] },
    active: { type: 'boolean', description: 'True when this is the currently active MCP organization context.' },
  },
  required: ['id', 'active'],
}

// ---

export const siteIdSchema = {
  site_id: { type: 'string', description: 'Site id, subdomain, or custom domain.' },
}

export const generatedImagePickerOutputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subtitle: { type: ['string', 'null'] },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          publicUrl: { type: 'string' },
        },
        required: ['assetId', 'publicUrl'],
      },
    },
    useLabel: { type: ['string', 'null'] },
    regenerateLabel: { type: ['string', 'null'] },
    assignTool: { type: ['string', 'null'] },
    assignArgs: { type: ['object', 'null'] },
    regenerateTool: { type: ['string', 'null'] },
    regenerateArgs: { type: ['object', 'null'] },
    successMessage: { type: ['string', 'null'] },
  },
  required: ['images'],
} as const

export function siteTool(definition: Omit<RawMcpToolDefinition, 'inputSchema' | 'outputSchema'> & {
  inputSchema?: Record<string, unknown>
  required?: string[]
  outputSchema?: Record<string, unknown>
}): McpToolDefinition {
  const { oneOf, anyOf, allOf, ...propertyDefs } = definition.inputSchema ?? {}
  const properties = {
    ...siteIdSchema,
    ...propertyDefs,
  }
  const required = [...(definition.required ?? [])]
  const combinators: Record<string, unknown> = {}
  if (oneOf !== undefined) combinators.oneOf = oneOf
  if (anyOf !== undefined) combinators.anyOf = anyOf
  if (allOf !== undefined) combinators.allOf = allOf
  return withToolAnnotations({
    name: definition.name,
    description: definition.description,
    domain: definition.domain,
    minimumRole: definition.minimumRole,
    confirmRequired: definition.confirmRequired,
    requiredEntitlement: definition.requiredEntitlement,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: true,
      ...combinators,
    },
    outputSchema: definition.outputSchema ?? { type: 'object' },
    fileParams: definition.fileParams,
    uiResourceUri: definition.uiResourceUri,
  })
}

export function globalTool(definition: RawMcpToolDefinition | McpToolDefinition): McpToolDefinition {
  if ('annotations' in definition && 'securitySchemes' in definition) {
    // Validate that both fields exist AND are properly structured
    const hasValidAnnotations = definition.annotations && typeof definition.annotations === 'object'
    const hasValidSecuritySchemes = definition.securitySchemes && Array.isArray(definition.securitySchemes) && definition.securitySchemes.length > 0
    if (hasValidAnnotations && hasValidSecuritySchemes) {
      return definition
    }
  }

  return withToolAnnotations(definition)
}

export type RawMcpToolDefinition = Omit<McpToolDefinition, 'annotations' | 'securitySchemes'>

export const READ_ONLY_DEFAULT: McpToolAnnotations = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
})

export function boundedWriteAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
}

export function openWorldWriteAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: false }
}

export function boundedDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: false, destructiveHint: true }
}

export function openWorldDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: true }
}

export const READ_ONLY_TOOL_NAMES = [
  'get_current_user',
  'get_workspace_context',
  'show_generated_images',
  'list_sites',
  'show_site_preview',
  'get_site',
  'get_site_settings',
  'list_locations',
  'get_location',
  'list_menus',
  'get_menu',
  'list_posts',
  'get_post',
  'list_blog_posts',
  'get_blog_post',
  'get_site_media_assets',
  'open_media_upload',
  'open_experience_media_upload',
  'open_home_hero_media_upload',
  'open_location_media_upload',
  'open_post_media_upload',
  'open_menu_item_media_upload',
  'get_facebook_connection',
  'get_dashboard_link',
  'get_page_fields',
  'get_booking_policy',
  'preview_booking_policy',
  'list_location_qa',
  'list_location_reviews',
  'list_experiences',
  'get_experience',
  'list_experience_bookings',
  'list_all_experience_bookings',
  'list_locales',
  'get_translation_inventory',
  'list_translation_jobs',
  'get_translation_job',
  'get_translation_review_items',
  'get_contact_inquiries',
  'get_reservation_inquiries',
  'get_notification_settings',
  'get_google_business_connection',
  'get_google_business_auth_url',
  'list_google_business_accounts',
  'list_work_requests',
  'get_site_domains',
  'get_site_analytics',
] as const

export const BOUNDED_WRITE_TOOL_NAMES = [
  'set_workspace_context',
  'save_generated_image',
  'save_generated_image_file',
  'upload_user_photo',
  'upload_user_media',
  'set_logo',
  'set_brand_color',
  'set_home_hero_image',
  'set_home_hero_video',
  'clear_home_hero_image',
  'clear_home_hero_video',
  'set_about_story_image',
  'set_home_story_image',
  'set_location_hero_image',
  'set_location_hero_video',
  'clear_location_hero_image',
  'clear_location_hero_video',
  'set_menu_item_image',
  'set_post_image',
  'create_blog_post',
  'update_blog_post',
  'set_blog_post_image',
  'set_experience_image',
  'set_experience_video',
  'create_site',
  'create_post',
  'update_post',
  'update_media_asset',
  'import_menu_from_media',
  'update_experience_booking',
  'upsert_locale',
  'start_translation_job',
  'run_translation_job_batch',
  'save_translation_review_item',
  'update_notification_settings',
  'create_work_request',
  'set_default_currency',
] as const

export const OPEN_WORLD_WRITE_TOOL_NAMES = [
  'import_from_maps',
  'update_site_settings',
  'create_location',
  'update_location',
  'copy_location_batch',
  'create_menu',
  'update_menu',
  'create_menu_item',
  'add_menu_items_batch',
  'update_menu_item',
  'rename_menu_section',
  'reorder_menu_items',
  'publish_post',
  'publish_to_facebook',
  'sync_facebook_page',
  'update_page_content',
  'update_booking_policy',
  'update_home_hero',
  'create_location_qa',
  'update_location_qa',
  'reorder_location_qa',
  'reply_to_review',
  'create_experience',
  'update_experience',
  'reorder_experience_gallery',
  'publish_translations',
  'sync_google_business_locations',
  'create_domain',
  'set_canonical_domain',
  'sync_domain',
] as const

export const BOUNDED_DESTRUCTIVE_TOOL_NAMES = [
  'delete_media_asset',
] as const

export const OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES = [
  'delete_location',
  'delete_menu',
  'delete_menu_item',
  'delete_menu_section',
  'delete_post',
  'delete_blog_post',
  'delete_content_field',
  'delete_location_qa',
  'delete_experience',
  'delete_locale',
  'delete_domain',
] as const

export function buildToolAnnotationsByName() {
  const groups = [
    { names: READ_ONLY_TOOL_NAMES, annotations: READ_ONLY_DEFAULT },
    { names: BOUNDED_WRITE_TOOL_NAMES, annotations: boundedWriteAnnotations() },
    { names: OPEN_WORLD_WRITE_TOOL_NAMES, annotations: openWorldWriteAnnotations() },
    { names: BOUNDED_DESTRUCTIVE_TOOL_NAMES, annotations: boundedDestructiveAnnotations() },
    { names: OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES, annotations: openWorldDestructiveAnnotations() },
  ] as const

  const map = new Map<string, McpToolAnnotations>()
  for (const group of groups) {
    for (const name of group.names) {
      if (map.has(name)) {
        throw new Error(`Duplicate MCP tool annotation classification for "${name}".`)
      }
      map.set(name, group.annotations)
    }
  }
  return map
}

export const TOOL_ANNOTATIONS_BY_NAME = buildToolAnnotationsByName()

export function withToolAnnotations(definition: RawMcpToolDefinition): McpToolDefinition {
  const annotations = TOOL_ANNOTATIONS_BY_NAME.get(definition.name)
  if (!annotations) {
    throw new Error(`Missing MCP tool annotation classification for "${definition.name}".`)
  }

  if (annotations.readOnlyHint === false) {
    if (typeof annotations.openWorldHint !== 'boolean' || typeof annotations.destructiveHint !== 'boolean') {
      throw new Error(`Write tool "${definition.name}" must declare openWorldHint and destructiveHint.`)
    }
  } else if (definition.confirmRequired) {
    throw new Error(`Read-only MCP tool "${definition.name}" cannot require confirmation.`)
  }

  return {
    ...definition,
    securitySchemes: MCP_TOOL_SECURITY_SCHEMES,
    annotations,
  }
}


export { SUPPORTED_CURRENCIES }
