import type { McpToolRole } from '~/server/utils/mcp-auth'
import { EXPERIENCE_STATUSES } from '~/server/utils/experiences'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'
import { DASHBOARD_DESTINATIONS } from '~/server/utils/dashboard-links'

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
  /** Widget name served at ui://widget/{widgetName} — marks this as a render tool */
  widgetName?: string
  widgetInvoking?: string
  widgetInvoked?: string
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

const openingHoursInputSchema = {
  type: ['string', 'object', 'null'],
  description: 'Opening hours for this location. Accepted shapes: (1) an object { weekdayDescriptions: string[] } with one entry per day, e.g. { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM", ...] } — this is also the shape returned by get_location; (2) a plain string with one day per line, e.g. "Monday: 9:00 AM – 5:00 PM\\nTuesday: 9:00 AM – 5:00 PM". A bare array of per-day structured objects (e.g. { openDay, openTime, closeTime }) is NOT supported — convert to weekdayDescriptions strings first. Pass null to clear.',
}

const locationObject = {
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
    rating: { type: ['number', 'null'] },
    review_count: { type: ['number', 'null'] },
    description: { type: ['string', 'null'] },
    short_description: { type: ['string', 'null'] },
    status: { type: 'string' },
    is_primary: { type: 'number' },
    hero_image_asset_id: { type: ['string', 'null'] },
    hero_video_asset_id: { type: ['string', 'null'] },
    notification_phone: { type: ['string', 'null'], description: 'WhatsApp number for internal booking/reservation alerts to this location\'s manager. Not shown to guests. Falls back to the site-level whatsapp_phone if null.' },
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

const locationMutationResultObject = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    location: locationObject,
  },
  required: ['success', 'location'],
}

const menuItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    menu_id: { type: 'string' },
    section: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: ['string', 'null'] },
    price_amount: { type: ['string', 'number', 'null'] },
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

const menuObject = {
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

const postObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
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
    channels: { type: ['string', 'null'] },
    thumbnail_asset_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const mediaAssetObject = {
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

const currentUserObject = {
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

const fileReferenceObject = {
  type: 'object',
  properties: {
    download_url: { type: 'string' },
    file_id: { type: 'string' },
    mime_type: { type: 'string' },
    file_name: { type: 'string' },
  },
  required: ['download_url', 'file_id'],
}

const chatgptFileInput = {
  ...fileReferenceObject,
  description: 'Authorized file reference supplied by ChatGPT after rewriting the declared top-level file argument, including a temporary download_url and file_id.',
}

const experienceObject = {
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
    cancellation_policy: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    featured: { type: 'boolean' },
    featured_sort_order: { type: 'number' },
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const experienceStatusSchema = { type: 'string', enum: [...EXPERIENCE_STATUSES] }

const experienceWriteSchema = {
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
  cancellation_policy: { type: ['string', 'null'], description: 'Explicit cancellation or refund policy text for this experience.' },
  status: experienceStatusSchema,
  sort_order: { type: 'number', description: 'Lower numbers sort earlier in lists.' },
  featured: { type: 'boolean', description: 'Whether this experience should be highlighted in featured placements.' },
  featured_sort_order: { type: 'number', description: 'Lower numbers sort earlier among featured experiences.' },
  location_id: { type: 'string', description: 'Optional location id. If omitted, the site primary location is used when available. If the site has no primary location yet, create a location first or pass a valid location_id.' },
  seo_title: { type: ['string', 'null'], description: 'Optional SEO title override.' },
  seo_description: { type: ['string', 'null'], description: 'Optional SEO description override.' },
} as const

const bookingObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    experience_id: { type: 'string' },
    guest_name: { type: 'string' },
    guest_email: { type: 'string' },
    guest_phone: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
    booking_date: { type: ['string', 'null'] },
    party_size: { type: 'number' },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
}

const qaItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    question: { type: 'string' },
    answer: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    location_id: { type: 'string' },
  },
}

const reviewObject = {
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

const submissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    message: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'read', 'replied', 'spam'] },
    created_at: { type: 'string' },
    location_id: { type: ['string', 'null'] },
  },
}

const reservationSubmissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    party_size: { type: ['number', 'null'] },
    requested_date: { type: ['string', 'null'] },
    requested_time: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'confirmed', 'declined', 'spam'] },
    created_at: { type: 'string' },
    location_id: { type: ['string', 'null'] },
  },
}

const workRequestObject = {
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

const translationJobObject = {
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

const siteListItem = {
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

const locationListItemObject = {
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

const workspaceContextObject = {
  type: 'object',
  properties: {
    organization_id: { type: ['string', 'null'] },
    organization_name: { type: ['string', 'null'] },
    organization_slug: { type: ['string', 'null'] },
    site_id: { type: ['string', 'null'] },
    site_name: { type: ['string', 'null'] },
    site_subdomain: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    location_slug: { type: ['string', 'null'] },
    location_title: { type: ['string', 'null'] },
  },
}

const organizationListItemObject = {
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

const siteIdSchema = {
  site_id: { type: 'string', description: 'Site id, subdomain, or custom domain.' },
}

const generatedImagePickerOutputSchema = {
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

function siteTool(definition: Omit<RawMcpToolDefinition, 'inputSchema' | 'outputSchema'> & {
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
    widgetName: definition.widgetName,
    widgetInvoking: definition.widgetInvoking,
    widgetInvoked: definition.widgetInvoked,
    fileParams: definition.fileParams,
  })
}

function globalTool(definition: RawMcpToolDefinition | McpToolDefinition): McpToolDefinition {
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

type RawMcpToolDefinition = Omit<McpToolDefinition, 'annotations' | 'securitySchemes'>

const READ_ONLY_DEFAULT: McpToolAnnotations = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
})

function boundedWriteAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: false, destructiveHint: false }
}

function openWorldWriteAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: false }
}

function boundedDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: false, destructiveHint: true }
}

function openWorldDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: true }
}

const READ_ONLY_TOOL_NAMES = [
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
  'get_site_media_assets',
  'get_facebook_connection',
  'get_dashboard_link',
  'get_page_fields',
  'list_location_qa',
  'list_location_reviews',
  'list_experiences',
  'get_experience',
  'list_experience_bookings',
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

const BOUNDED_WRITE_TOOL_NAMES = [
  'set_workspace_context',
  'save_generated_image',
  'save_generated_image_file',
  'upload_user_photo',
  'request_photo_upload',
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
  'set_experience_image',
  'set_experience_video',
  'create_site',
  'create_post',
  'update_post',
  'request_media_upload',
  'confirm_media_upload',
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

const OPEN_WORLD_WRITE_TOOL_NAMES = [
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

const BOUNDED_DESTRUCTIVE_TOOL_NAMES = [
  'delete_media_asset',
] as const

const OPEN_WORLD_DESTRUCTIVE_TOOL_NAMES = [
  'delete_location',
  'delete_menu',
  'delete_menu_item',
  'delete_menu_section',
  'delete_post',
  'delete_content_field',
  'delete_location_qa',
  'delete_experience',
  'delete_locale',
  'delete_domain',
] as const

function buildToolAnnotationsByName() {
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

const TOOL_ANNOTATIONS_BY_NAME = buildToolAnnotationsByName()

function withToolAnnotations(definition: RawMcpToolDefinition): McpToolDefinition {
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

export const MCP_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
    name: 'get_current_user',
    description: 'Get the currently authenticated KrabiClaw account identity for debugging and workflow confirmation.',
    domain: 'account',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        user: currentUserObject,
      },
      required: ['user'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'get_workspace_context',
    description: 'Get the active MCP organization, site, and location context, plus the accessible sites and locations available for this user.',
    domain: 'context',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        context: workspaceContextObject,
        organizations: { type: 'array', items: organizationListItemObject },
        sites: { type: 'array', items: siteListItem },
        locations: { type: 'array', items: locationListItemObject },
      },
      required: ['context', 'organizations', 'sites', 'locations'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'set_workspace_context',
    description: 'Persist the active MCP site and optional location so later tool calls can omit raw IDs. Pass site_id to switch sites. Pass location_id to switch locations within the active or specified site.',
    domain: 'context',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        organization_id: { type: 'string' },
        site_id: { type: 'string', description: 'Site id, subdomain, or custom domain.' },
        location_id: { type: 'string', description: 'Location id or slug.' },
      },
      anyOf: [
        { required: ['organization_id'] },
        { required: ['site_id'] },
        { required: ['location_id'] },
      ],
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        context: workspaceContextObject,
        organizations: { type: 'array', items: organizationListItemObject },
        sites: { type: 'array', items: siteListItem },
        locations: { type: 'array', items: locationListItemObject },
      },
      required: ['success', 'context', 'organizations', 'sites', 'locations'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'import_from_maps',
    description: 'Import business details from a Google Maps URL or share link. Returns business info and photos. Call this when the user provides a Maps URL during site creation.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        maps_url: { type: 'string', description: 'Google Maps URL or short share link (maps.app.goo.gl or google.com/maps/place/...).' },
        parsed_hint: {
          type: 'object',
          description: 'Optional, non-authoritative hints from LLM URL parsing. Backend always re-extracts independently and logs divergence >1 km.',
          properties: {
            name_hint: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            feature_id: { type: 'string' },
            internal_id: { type: 'string' },
            expected_country: { type: 'string' },
            expected_region: { type: 'string' },
          },
          additionalProperties: false,
        },
        matching_policy: {
          type: 'object',
          description: 'Controls how strictly the backend validates the Places API result. Defaults to strict coordinate matching.',
          properties: {
            allow_name_only_fallback: { type: 'boolean', description: 'If false (default), reject when no coordinates are available to bias the search.' },
            require_coordinate_match: { type: 'boolean', description: 'If true (default), reject any Places result more than max_distance_km from URL coordinates.' },
            max_distance_km: { type: 'number', description: 'Rejection threshold in km. Default 5.' },
            prefer_backend_extraction: { type: 'boolean', description: 'If true (default), backend URL extraction takes precedence over parsed_hint.' },
          },
          additionalProperties: false,
        },
      },
      required: ['maps_url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        business: {
          type: 'object',
          description: 'Parsed business details from Google Places.',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: ['string', 'null'] },
            hours: { type: 'array', items: { type: 'string' } },
            rating: { type: ['number', 'null'] },
            reviewCount: { type: ['number', 'null'] },
            placeId: { type: 'string' },
            mapsUrl: { type: 'string' },
          },
          required: ['name', 'address', 'placeId'],
        },
        photos: {
          type: 'array',
          description: 'Photos uploaded to Cloudflare Images. Up to 10.',
          items: {
            type: 'object',
            properties: {
              cfImageId: { type: 'string' },
              publicUrl: { type: 'string' },
            },
            required: ['cfImageId', 'publicUrl'],
          },
        },
        missingPhotos: { type: 'boolean', description: 'True if fewer than 3 photos were imported — prompt the user to upload their own.' },
      },
      required: ['business', 'photos', 'missingPhotos'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'show_generated_images',
    description: 'Show a carousel of AI-generated images for the user to pick from. First persist each image with save_generated_image or save_generated_image_file, then pass the resulting assetId and publicUrl here. Include target metadata when the selected image should be applied directly.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          description: 'Array of { assetId, publicUrl } returned by save_generated_image or save_generated_image_file.',
          items: { type: 'object', properties: { assetId: { type: 'string' }, publicUrl: { type: 'string' } } },
        },
        target: {
          type: 'string',
          enum: ['logo', 'home_hero', 'about_story_image', 'home_story_image', 'location_hero', 'post_image', 'menu_item_image', 'experience_image'],
          description: 'Optional target that the widget should update directly after the user selects an image.',
        },
        site_id: { type: 'string', description: 'Required with target. Site ID that owns the target content.' },
        location_id: { type: 'string' },
        post_id: { type: 'string' },
        menu_item_id: { type: 'string' },
        experience_id: { type: 'string' },
        title: { type: 'string', description: 'Optional widget title override.' },
        subtitle: { type: 'string', description: 'Optional widget subtitle override.' },
        use_label: { type: 'string', description: 'Optional label for the primary button.' },
        regenerate_label: { type: 'string', description: 'Optional label for the secondary button.' },
      },
      required: ['images'],
      additionalProperties: true,
    },
    outputSchema: generatedImagePickerOutputSchema,
  })),
  siteTool({
    name: 'save_generated_image',
    description: 'Upload a base64-encoded image to Cloudflare Images and persist a media_asset record. Use ONLY when you already have a raw base64 string (e.g. from an external API). For ChatGPT native image_generation output, use save_generated_image_file instead — passing image_generation_call.result base64 here will be blocked by safety checks.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      image_data_base64: { type: 'string', description: 'Base64-encoded image data from image_generation_call.result, or a base64 data URL.' },
      prompt: { type: 'string', description: 'The prompt used to generate the image (stored as alt text).' },
    },
    required: ['image_data_base64'],
    outputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        publicUrl: { type: 'string' },
        thumbnailUrl: { type: 'string' },
      },
      required: ['assetId', 'publicUrl'],
    },
  }),
  siteTool({
    name: 'save_generated_image_file',
    description: 'Primary path for saving a ChatGPT natively-generated image. After calling image_generation, pass the resulting image as attachment_id (a file reference). This avoids safety blocks that occur when raw base64 is passed to save_generated_image.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      attachment_id: { ...fileReferenceObject, description: 'Authorized file reference supplied by ChatGPT for the generated image attachment.' },
      prompt: { type: 'string', description: 'The prompt used to generate the image (stored as alt text).' },
    },
    required: ['attachment_id'],
    fileParams: ['attachment_id'],
    outputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        publicUrl: { type: 'string' },
        thumbnailUrl: { type: 'string' },
      },
      required: ['assetId', 'publicUrl'],
    },
  }),
  siteTool({
    name: 'upload_user_photo',
    description: 'Primary path for a user-provided image attachment. This tool only uploads the image into the site media library; it does not place the image on any page by itself. First inspect the attached image visually and ask the user to confirm the target site, placement, and that this exact image should be used. Pass an authorized file reference or attachment identifier that the host can resolve; do not pass raw local paths. Prefer file_id or an equivalent resolved identifier when available. After upload succeeds, immediately call the appropriate assignment tool such as set_home_hero_image, set_logo, set_about_story_image, set_home_story_image, set_location_hero_image, set_post_image, or set_experience_image. Do NOT use save_generated_image_file for user uploads; that tool is only for ChatGPT native image_generation output.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      file: chatgptFileInput,
      file_id: { type: 'string', description: 'Resolved file identifier for a user-uploaded image (e.g. file_abc123). Prefer this when the host can supply it directly.' },
      category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'other'], description: 'What this photo will be used for.' },
      description: { type: 'string', description: 'Description of the photo (stored as alt text).' },
      oneOf: [
        { required: ['file'] },
        { required: ['file_id'] },
      ],
    },
    required: [],
    fileParams: ['file'],
    outputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        publicUrl: { type: 'string' },
        thumbnailUrl: { type: 'string' },
        nextStep: { type: 'string' },
      },
      required: ['assetId', 'publicUrl'],
    },
  }),
  globalTool(withToolAnnotations({
    name: 'request_photo_upload',
    description: 'Secondary fallback only. Open an in-chat file picker when the user has not already attached an image in ChatGPT and still wants to provide their own photo. Prefer the native attachment flow plus upload_user_photo for the default path.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    widgetName: 'photo-upload',
    widgetInvoking: 'Opening upload form…',
    widgetInvoked: 'Upload your photo',
    inputSchema: {
      type: 'object',
      properties: {
        ...siteIdSchema,
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'other'], description: 'What this photo will be used for.' },
      },
      required: ['site_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['awaiting_user_upload'] },
      },
      required: ['status'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'list_sites',
    description: 'List the caller\'s accessible sites and current authenticated account identity.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        sites: {
          type: 'array',
          items: siteListItem,
        },
        currentUser: currentUserObject,
      },
      required: ['sites', 'currentUser'],
    },
  })),
  globalTool(withToolAnnotations({
    name: 'create_site',
    description: 'Create a new site in the caller\'s organization.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        subdomain: { type: 'string' },
        vertical: { type: 'string', enum: ['restaurant', 'experience'] },
      },
      required: ['name', 'subdomain', 'vertical'],
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'New site ID — pass as site_id in all subsequent calls.' },
        siteId: { type: 'string', description: 'New site ID — pass as site_id in all subsequent calls.' },
        subdomain: { type: 'string' },
        organizationId: { type: 'string' },
        status: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['id', 'siteId', 'subdomain'],
    },
  })),
  siteTool({
    name: 'show_site_preview',
    description: 'Show a preview of the site. Call after create_site + create_location succeed. Works before the site is publicly launched.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        site: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            subdomain: { type: ['string', 'null'] },
            publicUrl: { type: 'string' },
            previewUrl: { type: 'string' },
          },
          required: ['id', 'publicUrl', 'previewUrl'],
        },
        pages: {
          type: 'array',
          description: 'Navigable pages shown in the preview tabs.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              path: { type: 'string' },
            },
            required: ['label', 'path'],
          },
        },
        ogImageUrl: { type: ['string', 'null'], description: 'Hero image URL for the OG preview.' },
      },
      required: ['site', 'pages'],
    },
  }),
  siteTool({
    name: 'get_site',
    description: 'Get site details.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        site: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organization_id: { type: 'string' },
            subdomain: { type: 'string' },
            theme: { type: 'string' },
            status: { type: 'string' },
            brand_name: { type: ['string', 'null'] },
            brand_description: { type: ['string', 'null'] },
            logo_url: { type: ['string', 'null'] },
            public_url: { type: ['string', 'null'] },
            last_published_at: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
          required: ['id', 'subdomain', 'status'],
        },
      },
      required: ['site'],
    },
  }),
  siteTool({
    name: 'get_site_settings',
    description: 'Get editable site settings.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        settings: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            subdomain: { type: 'string' },
            theme: { type: 'string' },
            status: { type: 'string' },
            brand_name: { type: ['string', 'null'] },
            brand_description: { type: ['string', 'null'] },
            logo_url: { type: ['string', 'null'] },
            logo_asset_id: { type: ['string', 'null'] },
            contact_email: { type: ['string', 'null'] },
            default_currency: { type: ['string', 'null'] },
            url_structure: { type: 'string' },
          },
          required: ['id', 'subdomain'],
        },
      },
      required: ['settings'],
    },
  }),
  siteTool({
    name: 'update_site_settings',
    description: 'Update editable site settings such as brand name, description, logo, contact email, currency, social links, footer tagline, analytics IDs, and URL structure. For brand color changes, use the dedicated set_brand_color tool instead of this generic settings tool.',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      brand_name: { type: 'string' },
      brand_description: { type: 'string' },
      logo_url: { type: 'string' },
      logo_asset_id: { type: 'string' },
      contact_email: { type: 'string' },
      default_currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
      social_facebook: { type: 'string', description: 'Full Facebook page URL, e.g. https://facebook.com/yourpage. Must include the https:// scheme — bare domains or handles are rejected.' },
      social_instagram: { type: 'string', description: 'Full Instagram profile URL, e.g. https://instagram.com/yourhandle. Must include the https:// scheme — bare domains or handles are rejected.' },
      social_tiktok: { type: 'string', description: 'Full TikTok profile URL, e.g. https://tiktok.com/@yourhandle. Must include the https:// scheme — bare domains or handles are rejected.' },
      footer_tagline: { type: 'string' },
      press_email: { type: 'string' },
      partnerships_email: { type: 'string' },
      catering_email: { type: 'string' },
      careers_email: { type: 'string' },
      google_analytics_measurement_id: { type: 'string' },
      google_site_verification: { type: 'string' },
      url_structure: { type: 'string' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        updated: { type: 'boolean' },
      },
      required: ['id'],
    },
  }),
  siteTool({
    name: 'set_default_currency',
    description: 'Set the default currency for this site. Affects how prices are displayed on menus and experiences.',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES], description: 'ISO 4217 currency code.' },
    },
    required: ['currency'],
    outputSchema: {
      type: 'object',
      properties: {
        default_currency: { type: 'string' },
        updated: { type: 'boolean' },
      },
      required: ['default_currency', 'updated'],
    },
  }),
  siteTool({
    name: 'set_brand_color',
    description: 'Set the brand color theme for the site. Use this tool for any accent-color or theme-color change. Accepts natural language color descriptions like "earthy", "warm terracotta", "ocean blue", "sage green", or hex codes like #8F1D21. The brand color controls the primary accent color across the Saya template (buttons, links, highlights).',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      color: { type: 'string', description: 'Color description in natural language (e.g., "earthy", "warm terracotta", "ocean blue") or hex format (e.g., #8F1D21).' },
    },
    required: ['color'],
    outputSchema: {
      type: 'object',
      properties: {
        brand_color: { type: 'string', description: 'The resolved hex color code that was set.' },
        updated: { type: 'boolean' },
        description: { type: 'string', description: 'Human-readable description of what color was set.' },
      },
      required: ['brand_color', 'updated', 'description'],
    },
  }),
  siteTool({
    name: 'set_logo',
    description: 'Assign a saved media asset as the site logo. Call get_site_media_assets first to find an active image asset id, then pass it here as asset_id.',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        updated: { type: 'boolean' },
        logo_asset_id: { type: 'string' },
      },
      required: ['id', 'updated', 'logo_asset_id'],
    },
  }),
  siteTool({
    name: 'list_locations',
    description: 'List site locations in a compact format with ids, slugs, titles, and active-state markers so you can target location-scoped tools reliably.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        locations: { type: 'array', items: locationListItemObject },
      },
      required: ['locations'],
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
    name: 'create_location',
    description: 'Create a location. Social and delivery-app links (facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url) can be set here or later via update_location.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      title: { type: 'string' },
      facebook_url: { type: 'string', description: 'Full Facebook page URL for this location, e.g. https://facebook.com/yourpage. Include the https:// scheme.' },
      instagram_url: { type: 'string', description: 'Full Instagram profile URL for this location, e.g. https://instagram.com/yourhandle. Include the https:// scheme.' },
      tiktok_url: { type: 'string', description: 'Full TikTok profile URL for this location, e.g. https://tiktok.com/@yourhandle. Include the https:// scheme.' },
      grab_url: { type: 'string', description: 'Grab delivery/booking URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      uber_eats_url: { type: 'string', description: 'Uber Eats URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      foodpanda_url: { type: 'string', description: 'Foodpanda URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      opening_hours: openingHoursInputSchema,
    },
    required: ['title'],
    outputSchema: {
      ...locationMutationResultObject,
      properties: {
        ...locationMutationResultObject.properties,
        hydrated_seed_location: { type: 'boolean' },
        previous_slug: { type: ['string', 'null'] },
      },
    },
  }),
  siteTool({
    name: 'update_location',
    description: 'Update a location\'s details or assign a hero image/video. To assign a hero image: call get_site_media_assets first to find the asset id, then pass it as hero_image_asset_id here. Only provided fields are changed — omitting hero_image_asset_id leaves the existing one intact.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Location id or slug.' },
      phone: { type: 'string', description: 'Public phone number shown to guests on the website and in booking/reservation confirmation emails.' },
      email: { type: 'string', description: 'Public email shown to guests on the website and in booking/reservation confirmation emails.' },
      notification_phone: { type: 'string', description: 'WhatsApp number for internal booking/reservation alerts to this location\'s manager. Not shown to guests. Falls back to the site-level whatsapp_phone if null. International format: +66812345678' },
      hero_image_asset_id: { type: 'string', description: 'Asset ID from get_site_media_assets. Assigns the hero image for this location.' },
      hero_video_asset_id: { type: 'string', description: 'Asset ID from get_site_media_assets. Assigns the hero video for this location.' },
      facebook_url: { type: 'string', description: 'Full Facebook page URL for this location, e.g. https://facebook.com/yourpage. Include the https:// scheme.' },
      instagram_url: { type: 'string', description: 'Full Instagram profile URL for this location, e.g. https://instagram.com/yourhandle. Include the https:// scheme.' },
      tiktok_url: { type: 'string', description: 'Full TikTok profile URL for this location, e.g. https://tiktok.com/@yourhandle. Include the https:// scheme.' },
      grab_url: { type: 'string', description: 'Grab delivery/booking URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      uber_eats_url: { type: 'string', description: 'Uber Eats URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      foodpanda_url: { type: 'string', description: 'Foodpanda URL for this location. Must be a full http:// or https:// URL — bare domains are rejected.' },
      opening_hours: openingHoursInputSchema,
    },
    required: ['location_id'],
    outputSchema: {
      ...locationMutationResultObject,
    },
  }),
  siteTool({
    name: 'copy_location_batch',
    description: 'Copy menus, media, content, reviews, Q&A, and/or experiences from one location to another. Use this to duplicate a fully-built location as a starting point for a new one, instead of recreating content by hand. Provide target_location_id to copy into an existing location, or new_location_title to create a fresh one first. Items with external identifiers (Google review/question ids) are copied without that identifier since the copy is not the literal external record.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      source_location_id: { type: 'string', description: 'Location to copy content from. Use list_locations to find ids.' },
      target_location_id: { type: 'string', description: 'Existing location to copy content into. Omit if using new_location_title instead.' },
      new_location_title: { type: 'string', description: 'Title for a brand-new location to create and copy content into. Omit if using target_location_id instead.' },
      entities: {
        type: 'array',
        items: { type: 'string', enum: ['menus', 'menu_items', 'media_assets', 'site_content', 'reviews', 'location_qa', 'experiences'] },
        minItems: 1,
        description: 'Which kinds of content to copy. menu_items requires menus to also be listed, since copied items attach to newly copied menus.',
      },
      include_translations: { type: 'boolean', description: 'Copy existing translations for menus/menu items/site content along with the source-locale content. Defaults to true.' },
      oneOf: [
        { required: ['target_location_id'] },
        { required: ['new_location_title'] },
      ],
    },
    required: ['source_location_id', 'entities'],
    outputSchema: {
      type: 'object',
      properties: {
        manifest: {
          type: 'object',
          description: 'Per-entity counts of what was copied and the resulting location id/slug.',
        },
      },
      required: ['manifest'],
    },
  }),
  siteTool({
    name: 'set_location_hero_image',
    description: 'Assign a saved media asset as a location hero image. Call get_site_media_assets first to find an active image asset id, then pass it here with the target location_id. If this location already has a hero video, that video keeps display priority until you call clear_location_hero_video.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string' },
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['location_id', 'asset_id'],
    outputSchema: {
      ...locationMutationResultObject,
      properties: {
        ...locationMutationResultObject.properties,
        warning: { type: 'string' },
      },
    },
  }),
  siteTool({
    name: 'set_location_hero_video',
    description: 'Assign a saved video asset as a location hero video. Upload the video via the dashboard media library first, then call get_site_media_assets to find its asset id. Hero videos take display priority over any existing hero image for the same location.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string' },
      asset_id: { type: 'string', description: 'Active video asset id from get_site_media_assets.' },
    },
    required: ['location_id', 'asset_id'],
    outputSchema: {
      ...locationMutationResultObject,
      properties: {
        ...locationMutationResultObject.properties,
        warning: { type: 'string' },
      },
    },
  }),
  siteTool({
    name: 'clear_location_hero_image',
    description: 'Clear the current hero image from a location without affecting its hero video.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string' },
    },
    required: ['location_id'],
    outputSchema: {
      ...locationMutationResultObject,
    },
  }),
  siteTool({
    name: 'clear_location_hero_video',
    description: 'Clear the current hero video from a location without affecting its hero image.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string' },
    },
    required: ['location_id'],
    outputSchema: {
      ...locationMutationResultObject,
    },
  }),
  siteTool({
    name: 'delete_location',
    description: 'Delete a location.',
    domain: 'locations',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { location_id: { type: 'string', description: 'Location id or slug.' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_menus',
    description: 'List menus.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        menus: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              location_id: { type: ['string', 'null'] },
              sort_order: { type: 'number' },
            },
            required: ['id', 'name'],
          },
        },
      },
      required: ['menus'],
    },
  }),
  siteTool({
    name: 'get_menu',
    description: 'Get a menu with items.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: { menu: menuObject },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'create_menu',
    description: 'Create a menu.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { name: { type: 'string' }, location_id: { type: 'string' }, description: { type: 'string' } },
    required: ['name'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            location_id: { type: ['string', 'null'] },
          },
          required: ['id', 'name'],
        },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'update_menu',
    description: 'Update a menu.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id'],
        },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'delete_menu',
    description: 'Delete a menu.',
    domain: 'menus',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'create_menu_item',
    description: 'Create a menu item.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      menu_id: { type: 'string' },
      section: { type: 'string', description: 'Required menu section name, for example Cocktails, Mains, or Desserts.' },
      name: { type: 'string' },
      description: { type: ['string', 'null'] },
      price_amount: { type: ['string', 'number', 'null'], description: 'Canonical price field for menu items.' },
      price: { type: ['string', 'number', 'null'], description: 'Legacy alias accepted for compatibility. Prefer price_amount.' },
      image_asset_id: { type: ['string', 'null'] },
      available: { type: 'boolean' },
      featured: { type: 'boolean' },
      featured_sort_order: { type: 'number' },
      sort_order: { type: 'number' },
      allergens: { type: 'array', items: { type: 'string' } },
      ingredients: { type: 'array', items: { type: 'string' } },
      dietary_notes: { type: 'array', items: { type: 'string' } },
      preparation: { type: ['string', 'null'] },
      serving_note: { type: ['string', 'null'] },
    },
    required: ['menu_id', 'section', 'name'],
    outputSchema: {
      type: 'object',
      properties: { item: menuItemObject },
      required: ['item'],
    },
  }),
  siteTool({
    name: 'add_menu_items_batch',
    description: 'Add multiple brand-new menu items in one call. Use this when the user is adding new items, not revising existing ones.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      menu_id: { type: 'string' },
      items: {
        type: 'array',
        description: 'Up to 100 new menu items to add.',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string', description: 'Required menu section name, for example Cocktails, Mains, or Desserts.' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            price_amount: { type: ['string', 'number', 'null'], description: 'Canonical price field for menu items.' },
            price: { type: ['string', 'number', 'null'], description: 'Legacy alias accepted for compatibility. Prefer price_amount.' },
            image_asset_id: { type: ['string', 'null'] },
            available: { type: 'boolean' },
            featured: { type: 'boolean' },
            featured_sort_order: { type: 'number' },
            sort_order: { type: 'number' },
            allergens: { type: 'array', items: { type: 'string' } },
            ingredients: { type: 'array', items: { type: 'string' } },
            dietary_notes: { type: 'array', items: { type: 'string' } },
            preparation: { type: ['string', 'null'] },
            serving_note: { type: ['string', 'null'] },
          },
          required: ['section', 'name'],
          additionalProperties: true,
        },
      },
    },
    required: ['menu_id', 'items'],
    outputSchema: {
      type: 'object',
      properties: {
        added: { type: 'number' },
        created: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              section: { type: 'string' },
              price_amount: { type: ['string', 'number', 'null'] },
            },
            required: ['id', 'name', 'section'],
          },
        },
        skipped: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              reason: { type: 'string' },
              existing_item_id: { type: ['string', 'null'] },
            },
            required: ['name', 'reason'],
          },
        },
        menu_id: { type: 'string' },
      },
      required: ['added', 'created', 'skipped', 'menu_id'],
    },
  }),
  siteTool({
    name: 'update_menu_item',
    description: 'Update a menu item.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      menu_item_id: { type: 'string' },
      section: { type: 'string' },
      name: { type: 'string' },
      description: { type: ['string', 'null'] },
      price_amount: { type: ['string', 'number', 'null'], description: 'Canonical price field for menu items.' },
      price: { type: ['string', 'number', 'null'], description: 'Legacy alias accepted for compatibility. Prefer price_amount.' },
      image_asset_id: { type: ['string', 'null'] },
      available: { type: 'boolean' },
      featured: { type: 'boolean' },
      featured_sort_order: { type: 'number' },
      sort_order: { type: 'number' },
      allergens: { type: 'array', items: { type: 'string' } },
      ingredients: { type: 'array', items: { type: 'string' } },
      dietary_notes: { type: 'array', items: { type: 'string' } },
      preparation: { type: ['string', 'null'] },
      serving_note: { type: ['string', 'null'] },
    },
    required: ['menu_item_id'],
    outputSchema: {
      type: 'object',
      properties: { item: menuItemObject },
      required: ['item'],
    },
  }),
  siteTool({
    name: 'set_menu_item_image',
    description: 'Assign a saved media asset as a menu item image. Call get_site_media_assets first to find an active image asset id, then pass it here with the target menu_item_id.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      menu_item_id: { type: 'string' },
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['menu_item_id', 'asset_id'],
    outputSchema: {
      type: 'object',
      properties: { item: menuItemObject },
      required: ['item'],
    },
  }),
  siteTool({
    name: 'delete_menu_item',
    description: 'Delete a menu item.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { menu_item_id: { type: 'string' } },
    required: ['menu_item_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'rename_menu_section',
    description: 'Rename a menu section.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' }, old_name: { type: 'string' }, new_name: { type: 'string' } },
    required: ['menu_id', 'old_name', 'new_name'],
    outputSchema: {
      type: 'object',
      properties: {
        updated: { type: 'number', description: 'Number of items renamed.' },
      },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'delete_menu_section',
    description: 'Delete a menu section.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { menu_id: { type: 'string' }, section_name: { type: 'string' } },
    required: ['menu_id', 'section_name'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'number', description: 'Number of items deleted.' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'reorder_menu_items',
    description: 'Reorder menu items.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' }, updates: { type: 'array' } },
    required: ['menu_id', 'updates'],
    outputSchema: {
      type: 'object',
      properties: { updated: { type: 'boolean' } },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'list_posts',
    description: 'List posts. Pass location_id to see only posts scoped to one location; omit to see all posts site-wide (including site-wide ones with no location).',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      status: { type: 'string' },
      location_id: { type: 'string', description: 'Filter to posts restricted to this location.' },
    },
    outputSchema: {
      type: 'object',
      properties: { posts: { type: 'array', items: postObject } },
      required: ['posts'],
    },
  }),
  siteTool({
    name: 'get_post',
    description: 'Get a post.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'create_post',
    description: 'Create and publish a post. Use post_type to create a promotion or event instead of a standard update: "offer" for a discount/special (pair with offer_coupon/offer_terms), "event" for a scheduled happening (pair with event_title/event_start/event_end), or "update" for general news. Defaults to "standard".',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      body: { type: 'string' },
      title: { type: 'string' },
      post_type: { type: 'string', enum: ['standard', 'offer', 'event', 'update'], description: 'Determines how the post is presented. "offer" = promotion, "event" = scheduled happening.' },
      location_id: { type: 'string', description: 'Restrict this post to a specific location. Omit to apply site-wide.' },
      cta_type: { type: 'string', description: 'Call-to-action type shown with the post, e.g. "book", "order", "learn_more".' },
      cta_url: { type: 'string', description: 'URL the call-to-action button links to.' },
      event_title: { type: 'string', description: 'Event name. Use with post_type "event".' },
      event_start: { type: 'string', description: 'Event start datetime (ISO 8601). Use with post_type "event".' },
      event_end: { type: 'string', description: 'Event end datetime (ISO 8601). Use with post_type "event".' },
      offer_coupon: { type: 'string', description: 'Coupon code for the promotion. Use with post_type "offer".' },
      offer_terms: { type: 'string', description: 'Terms and conditions for the promotion. Use with post_type "offer".' },
      scheduled_for: { type: 'string', description: 'If set, the post is scheduled to publish at this datetime (ISO 8601) instead of immediately.' },
    },
    required: ['body'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'update_post',
    description: 'Update a post, including converting it into a promotion or event via post_type. Only provided fields are changed.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      post_id: { type: 'string' },
      body: { type: 'string' },
      title: { type: 'string' },
      post_type: { type: 'string', enum: ['standard', 'offer', 'event', 'update'], description: 'Determines how the post is presented. "offer" = promotion, "event" = scheduled happening.' },
      location_id: { type: ['string', 'null'], description: 'Restrict this post to a specific location. Pass null to clear it.' },
      cta_type: { type: 'string', description: 'Call-to-action type shown with the post, e.g. "book", "order", "learn_more".' },
      cta_url: { type: 'string', description: 'URL the call-to-action button links to.' },
      event_title: { type: 'string', description: 'Event name. Use with post_type "event".' },
      event_start: { type: 'string', description: 'Event start datetime (ISO 8601). Use with post_type "event".' },
      event_end: { type: 'string', description: 'Event end datetime (ISO 8601). Use with post_type "event".' },
      offer_coupon: { type: 'string', description: 'Coupon code for the promotion. Use with post_type "offer".' },
      offer_terms: { type: 'string', description: 'Terms and conditions for the promotion. Use with post_type "offer".' },
      scheduled_for: { type: 'string', description: 'If set, the post is scheduled to publish at this datetime (ISO 8601) instead of immediately.' },
    },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'set_post_image',
    description: 'Assign a saved media asset as a post image. Call get_site_media_assets first to find an active image asset id, then pass it here with the target post_id.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      post_id: { type: 'string' },
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['post_id', 'asset_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'publish_post',
    description: 'Publish a post to one or more channels. channels defaults to ["site"]. Pass ["site","facebook"] or ["site","instagram"] or all three to simultaneously publish to social — requires a connected Facebook Page (get_facebook_connection). Instagram additionally requires the post to have an image. targets is accepted as a deprecated alias for channels.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      post_id: { type: 'string' },
      channels: { type: 'array', items: { type: 'string', enum: ['site', 'facebook', 'instagram', 'gmb'] }, description: 'Channels to publish to. Defaults to ["site"].' },
      targets: { type: 'array', items: { type: 'string', enum: ['site', 'facebook', 'instagram', 'gmb'] }, description: 'Deprecated alias for channels. Prefer channels.' },
    },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'delete_post',
    description: 'Delete a post. Only owners and admins can delete posts.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' }, deleted: { type: 'boolean' }, error: { type: 'string' } },
    },
  }),
  siteTool({
    name: 'get_site_media_assets',
    description: 'List media assets (images and videos) for a site. Use this first to find asset IDs before assigning images through business-level tools like set_logo, set_home_hero_image, set_about_story_image, set_home_story_image, set_location_hero_image, set_menu_item_image, set_post_image, or set_experience_image. Filter by kind="image" to narrow results. For video uploads, direct the user to the dashboard media library: https://krabiclaw.com/dashboard/{orgSlug}/sites/{subdomain}/{locationSlug}/media — orgSlug and subdomain come from list_sites, locationSlug from list_locations. After the user uploads, call get_site_media_assets to get the public_url and place it on the page.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { kind: { type: 'string', description: 'Filter by asset type: "image" or "video".' }, location_id: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: { assets: { type: 'array', items: mediaAssetObject } },
      required: ['assets'],
    },
  }),
  siteTool({
    name: 'request_media_upload',
    description: 'Create a pending image upload request. Use category "logo" for brand logos.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { filename: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo'] } },
    outputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'Pass to confirm_media_upload after the browser finishes uploading.' },
        upload_url: { type: 'string', description: 'Cloudflare direct-upload URL — POST the image file here from the browser.' },
        image_id: { type: 'string', description: 'Cloudflare Images ID.' },
        site_id: { type: 'string' },
        activate_url: { type: 'string', description: 'URL to POST after upload to activate the asset.' },
        activation_token: { type: 'string', description: 'Bearer token required when calling activate_url.' },
      },
      required: ['asset_id', 'upload_url', 'image_id', 'site_id', 'activate_url', 'activation_token'],
    },
  }),
  siteTool({
    name: 'confirm_media_upload',
    description: 'Confirm a pending uploaded image.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
        public_url: { type: 'string' },
        thumbnail_url: { type: 'string' },
        status: { type: 'string', enum: ['active'] },
      },
      required: ['asset_id', 'public_url', 'status'],
    },
  }),
  siteTool({
    name: 'update_media_asset',
    description: 'Update media metadata.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' }, alt_text: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: { updated: mediaAssetObject },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'delete_media_asset',
    description: 'Delete a media asset.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { asset_id: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'get_facebook_connection',
    description: 'Check whether a Facebook Page is connected to this site. If not connected, the response includes connectUrl — a deep link to the dashboard general settings page to connect (same link get_dashboard_link returns for destination "settings.general").',
    domain: 'integrations',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean' },
        facebook_page_id: { type: ['string', 'null'] },
        facebook_page_name: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['active', 'disabled', 'error'] },
      },
      required: ['connected'],
    },
  }),
  siteTool({
    name: 'get_dashboard_link',
    description: 'Resolve a deep link into this site\'s org dashboard for a given destination, so a reply can point the user straight at the right settings page instead of just naming it.',
    domain: 'settings',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      destination: {
        type: 'string',
        enum: Object.keys(DASHBOARD_DESTINATIONS),
        description: 'Which dashboard page to link to.',
      },
    },
    required: ['destination'],
    outputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  }),
  siteTool({
    name: 'publish_to_facebook',
    description: 'Publish a post to the connected Facebook Page. Requires the Managed plan. Call get_facebook_connection first to confirm a page is connected.',
    domain: 'integrations',
    minimumRole: 'editor',
    confirmRequired: true,
    requiredEntitlement: 'managed_service',
    inputSchema: {
      message: { type: 'string', description: 'Post text content.' },
      link: { type: 'string', description: 'Optional URL to attach to the post.' },
      published: { type: 'boolean', description: 'Publish immediately (true, default). Pass false to save as draft.' },
    },
    required: ['message'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        post_id: { type: 'string', description: 'Facebook post ID.' },
        page_name: { type: ['string', 'null'] },
      },
      required: ['success', 'post_id'],
    },
  }),
  siteTool({
    name: 'sync_facebook_page',
    description: 'Pull business info (phone, hours, website, city, description, cover photo) from the connected Facebook Page and write it into the business location record, updating the tenant site. Requires the Managed plan. Optionally pass location_id to target a specific location, and page_id to switch which Facebook Page is connected.',
    domain: 'integrations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'managed_service',
    inputSchema: {
      location_id: { type: 'string', description: 'Location to sync page info into. Required to actually update the tenant site.' },
      page_id: { type: 'string', description: 'Switch to a different Facebook Page by ID. Omit to use the currently connected page.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        synced_to_location: { type: 'boolean' },
        page: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            about: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            website: { type: ['string', 'null'] },
            city: { type: ['string', 'null'] },
            fan_count: { type: ['number', 'null'] },
            cover: { type: ['string', 'null'] },
            picture: { type: ['string', 'null'] },
          },
        },
      },
      required: ['success', 'synced_to_location', 'page'],
    },
  }),
  siteTool({
    name: 'import_menu_from_media',
    description: 'Extract and add menu items from a menu photo or PDF.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' }, menu_name: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          description: 'Created menu.',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
        items_created: { type: 'number', description: 'Number of menu items extracted and created.' },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'get_page_fields',
    description: 'Get editable field definitions and current values for a page. Call this before update_page_content to see which fields exist and what they are set to.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page: { type: 'string' }, location_id: { type: 'string' } },
    required: ['page'],
    outputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string' },
        siteId: { type: 'string' },
        locationId: { type: ['string', 'null'] },
        public_path: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              value: { type: ['string', 'null'] },
              render_status: { type: 'string', enum: ['rendered', 'orphan'] },
              editable_keys: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        schema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            fields: { type: 'array', items: { type: 'string' } },
            structured: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['page', 'siteId', 'fields'],
    },
  }),
  siteTool({
    name: 'update_page_content',
    description: 'Update canonical page content directly. Validates field names against the page schema and writes live renderer-bound content immediately.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page: { type: 'string' }, changes: { type: 'object' }, location_id: { type: 'string' } },
    required: ['page', 'changes'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        location_id: { type: ['string', 'null'] },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'update_home_hero',
    description: 'Update the homepage hero (title, subtitle, hero image, or hero video). To assign an existing media asset as the hero image: call get_site_media_assets first to get its id, then pass it as image_asset_id here. Only provided fields are changed — omitting image_asset_id leaves the existing hero image intact.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      image_asset_id: { type: 'string' },
      video_asset_id: { type: 'string' },
      location_id: { type: 'string' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'set_home_hero_image',
    description: 'Assign a saved media asset as the homepage hero image. Call get_site_media_assets first to find an active image asset id, then pass it here as asset_id. Use this immediately after upload_user_photo when the user wants their uploaded image on the homepage hero. If this page already has a hero video, that video keeps display priority until you call clear_home_hero_video.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
      location_id: { type: 'string', description: 'Optional location scope when the homepage content is location-specific.' },
    },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
        asset_id: { type: 'string' },
        public_url: { type: ['string', 'null'] },
        warning: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count', 'asset_id'],
    },
  }),
  siteTool({
    name: 'set_home_hero_video',
    description: 'Assign a saved video asset as the homepage hero video. Upload the video via the dashboard media library first, then call get_site_media_assets to find its asset id. Hero videos take display priority over any existing hero image for the same page.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      asset_id: { type: 'string', description: 'Active video asset id from get_site_media_assets.' },
      location_id: { type: 'string', description: 'Optional location scope when the homepage content is location-specific.' },
    },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
        warning: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'clear_home_hero_image',
    description: 'Clear the current homepage hero image without affecting the hero video.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Optional location scope when the homepage content is location-specific.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'clear_home_hero_video',
    description: 'Clear the current homepage hero video without affecting the hero image.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      location_id: { type: 'string', description: 'Optional location scope when the homepage content is location-specific.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'set_about_story_image',
    description: 'Assign a saved media asset as the About page (/about) story image. Call get_site_media_assets first to find an active image asset id, then pass it here as asset_id. Use set_home_story_image instead if the user means the story section on the homepage — the two pages have separate story.image fields and this tool only ever writes to /about. It is common to reuse the same asset_id for both.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'set_home_story_image',
    description: 'Assign a saved media asset as the homepage (/) story image. Call get_site_media_assets first to find an active image asset id, then pass it here as asset_id. Use set_about_story_image instead if the user means the story section on the About page — the two pages have separate story.image fields and this tool only ever writes to home. It is common to reuse the same asset_id for both.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        page: { type: 'string' },
        changes_count: { type: 'number' },
        public_path: { type: 'string' },
      },
      required: ['success', 'page', 'changes_count'],
    },
  }),
  siteTool({
    name: 'delete_content_field',
    description: 'Delete a canonical content field from live page content.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { page: { type: 'string' }, field: { type: 'string' }, location_id: { type: 'string' } },
    required: ['page', 'field'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        field: { type: 'string' },
        public_path: { type: 'string' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_location_qa',
    description: 'List Q&A for a location.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { items: { type: 'array', items: qaItemObject } },
      required: ['items'],
    },
  }),
  siteTool({
    name: 'create_location_qa',
    description: 'Create a Q&A pair for a location.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, question: { type: 'string' } },
    required: ['location_id', 'question'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        answer: { type: ['string', 'null'] },
        sort_order: { type: 'number' },
        location_id: { type: 'string' },
      },
      required: ['id', 'question'],
    },
  }),
  siteTool({
    name: 'update_location_qa',
    description: 'Update a Q&A entry.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } },
    required: ['location_id', 'qa_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        answer: { type: ['string', 'null'] },
      },
      required: ['id'],
    },
  }),
  siteTool({
    name: 'delete_location_qa',
    description: 'Delete a Q&A entry.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } },
    required: ['location_id', 'qa_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'reorder_location_qa',
    description: 'Swap two Q&A sort orders.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, updates: { type: 'array' } },
    required: ['location_id', 'updates'],
    outputSchema: {
      type: 'object',
      properties: { updated: { type: 'number' } },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'list_location_reviews',
    description: 'List reviews for a location.',
    domain: 'reviews',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { reviews: { type: 'array', items: reviewObject } },
      required: ['reviews'],
    },
  }),
  siteTool({
    name: 'reply_to_review',
    description: 'Add, update, or clear the owner reply for a review. Pass reply: null to clear an existing reply.',
    domain: 'reviews',
    minimumRole: 'owner',
    confirmRequired: false,
    inputSchema: { review_id: { type: 'string' }, reply: { type: ['string', 'null'] } },
    required: ['review_id', 'reply'],
    outputSchema: {
      type: 'object',
      properties: {
        review_id: { type: 'string' },
        reply: { type: ['string', 'null'] },
        replied: { type: 'boolean' },
        cleared: { type: 'boolean' },
        updated_at: { type: 'string' },
      },
      required: ['review_id', 'replied', 'cleared', 'updated_at'],
    },
  }),
  siteTool({
    name: 'list_experiences',
    description: 'List experiences. Optionally filter by location_id. If no experiences exist yet and the site has no primary location, create a location first before calling create_experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: { experiences: { type: 'array', items: experienceObject } },
      required: ['experiences'],
    },
  }),
  siteTool({
    name: 'get_experience',
    description: 'Get an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string', description: 'Experience id, or its slug from the public URL (/experiences/<slug>).' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'create_experience',
    description: `Create an experience. Gather and store the details in the dedicated fields instead of collapsing everything into body: title for the public name, tagline for the short hook, body for the main narrative, highlights for short selling points, included_items for what is included, what_to_bring for guest prep, meeting_point for arrival instructions, cancellation_policy for refund/cancellation rules, price_amount/price for pricing, duration_minutes for length, max_capacity for guest count, time_slots or recurring_slots for schedule, available_note for urgency text, and image/video fields for primary media. status must be one of: ${EXPERIENCE_STATUSES.join(', ')}. Every experience must belong to a location. Pass location_id directly, or omit it only when the site already has a primary location. If no location exists yet, call list_locations or create_location first.`,
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: experienceWriteSchema,
    required: ['title'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'update_experience',
    description: `Update an experience using the dedicated fields instead of stuffing all details into body. Keep tagline as the short hook, body as the full description, highlights as short selling points, included_items as what is included, what_to_bring as guest prep notes, meeting_point as arrival instructions, cancellation_policy as refund/cancellation rules, duration_minutes for length, max_capacity for guest count, price_amount/price for pricing, and time_slots or recurring_slots for scheduling. status must be one of: ${EXPERIENCE_STATUSES.join(', ')}.`,
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string', description: 'Experience id or slug.' }, ...experienceWriteSchema },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'set_experience_image',
    description: 'Assign a saved media asset as an experience image. Call get_site_media_assets first to find an active image asset id, then pass it here with the target experience_id.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      experience_id: { type: 'string', description: 'Experience id or slug.' },
      asset_id: { type: 'string', description: 'Active image asset id from get_site_media_assets.' },
    },
    required: ['experience_id', 'asset_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'set_experience_video',
    description: 'Assign a saved video asset as an experience video. Upload the video via the dashboard media library first, then call get_site_media_assets to find its asset id.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      experience_id: { type: 'string', description: 'Experience id or slug.' },
      asset_id: { type: 'string', description: 'Active video asset id from get_site_media_assets.' },
    },
    required: ['experience_id', 'asset_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'reorder_experience_gallery',
    description: 'Reorder an experience\'s additional media gallery (the images array shown as a carousel, separate from the primary image/video). Pass every existing gallery item — same url and kind values — in the new desired order. This only reorders; to add or remove gallery items, call update_experience with the full images array instead.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      experience_id: { type: 'string', description: 'Experience id or slug.' },
      images: experienceWriteSchema.images,
    },
    required: ['experience_id', 'images'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'delete_experience',
    description: 'Delete an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { experience_id: { type: 'string', description: 'Experience id or slug.' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_experience_bookings',
    description: 'List experience bookings.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string', description: 'Experience id or slug.' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { bookings: { type: 'array', items: bookingObject } },
      required: ['bookings'],
    },
  }),
  siteTool({
    name: 'update_experience_booking',
    description: 'Update a booking status.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string', description: 'Experience id or slug.' }, booking_id: { type: 'string' }, status: { type: 'string' } },
    required: ['experience_id', 'booking_id', 'status'],
    outputSchema: {
      type: 'object',
      properties: { booking: bookingObject },
      required: ['booking'],
    },
  }),
  siteTool({
    name: 'list_locales',
    description: 'List enabled locales.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        locales: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              locale: { type: 'string', description: 'BCP-47 locale code, e.g. "th", "zh".' },
              is_enabled: { type: 'number' },
              created_at: { type: 'string' },
            },
            required: ['locale'],
          },
        },
      },
      required: ['locales'],
    },
  }),
  siteTool({
    name: 'upsert_locale',
    description: 'Create or update a locale.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        locale: {
          type: 'object',
          properties: {
            locale: { type: 'string' },
            is_enabled: { type: 'number' },
          },
          required: ['locale'],
        },
      },
      required: ['locale'],
    },
  }),
  siteTool({
    name: 'delete_locale',
    description: 'Delete a locale.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        locale: { type: 'string' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'get_translation_inventory',
    description: 'Estimate translation scope and cost.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        targetLocale: { type: 'string' },
        scope: { type: 'string' },
        totalItems: { type: 'number' },
        totalChars: { type: 'number' },
        estimatedInputTokens: { type: 'number' },
        estimatedOutputTokens: { type: 'number' },
        estimatedCredits: { type: 'number' },
        breakdown: { type: 'object', description: 'Item counts by content type.' },
      },
      required: ['targetLocale', 'totalItems', 'totalChars', 'estimatedCredits'],
    },
  }),
  siteTool({
    name: 'start_translation_job',
    description: 'Create a translation job and run the first batch.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, includePublished: { type: 'boolean' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        job: translationJobObject,
        first_batch: {
          type: 'object',
          description: 'Result of the first processing batch.',
          properties: {
            processed: { type: 'number' },
            failed: { type: 'number' },
            remaining: { type: 'number' },
          },
        },
      },
      required: ['job', 'first_batch'],
    },
  }),
  siteTool({
    name: 'list_translation_jobs',
    description: 'List translation jobs.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    outputSchema: {
      type: 'object',
      properties: { jobs: { type: 'array', items: translationJobObject } },
      required: ['jobs'],
    },
  }),
  siteTool({
    name: 'get_translation_job',
    description: 'Get a translation job and its items.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { job_id: { type: 'string' } },
    required: ['job_id'],
    outputSchema: {
      type: 'object',
      properties: {
        job: translationJobObject,
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entity_type: { type: 'string' },
              entity_id: { type: 'string' },
              field: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'translated', 'failed', 'skipped'] },
              error: { type: ['string', 'null'] },
            },
            required: ['id', 'entity_type', 'field', 'status'],
          },
        },
      },
      required: ['job', 'items'],
    },
  }),
  siteTool({
    name: 'run_translation_job_batch',
    description: 'Run another translation job batch.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { job_id: { type: 'string' } },
    required: ['job_id'],
    outputSchema: {
      type: 'object',
      properties: {
        processed: { type: 'number' },
        failed: { type: 'number' },
        remaining: { type: 'number' },
        status: { type: 'string', enum: ['running', 'completed', 'failed'] },
      },
      required: ['processed'],
    },
  }),
  siteTool({
    name: 'get_translation_review_items',
    description: 'List translation review items.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, status: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entity_type: { type: 'string' },
              entity_id: { type: 'string' },
              field: { type: 'string' },
              source_text: { type: 'string' },
              translated_text: { type: ['string', 'null'] },
              status: { type: 'string' },
            },
            required: ['id', 'entity_type', 'field'],
          },
        },
        total: { type: 'number' },
      },
      required: ['items'],
    },
  }),
  siteTool({
    name: 'save_translation_review_item',
    description: 'Save manual translation review edits.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, entity_type: { type: 'string' }, entity_id: { type: 'string' }, field: { type: 'string' }, fields: { type: 'object' }, scope: { type: 'string' } },
    required: ['locale', 'entity_type', 'entity_id', 'field', 'fields'],
    outputSchema: {
      type: 'object',
      properties: {
        saved: { type: 'boolean' },
        entity_id: { type: 'string' },
        field: { type: 'string' },
      },
      required: ['saved'],
    },
  }),
  siteTool({
    name: 'publish_translations',
    description: 'Publish draft translations.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        published: { type: 'number', description: 'Number of translation fields published.' },
        locale: { type: 'string' },
      },
      required: ['published'],
    },
  }),
  siteTool({
    name: 'get_contact_inquiries',
    description: 'List contact submissions.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: { submissions: { type: 'array', items: submissionObject } },
      required: ['submissions'],
    },
  }),
  siteTool({
    name: 'get_reservation_inquiries',
    description: 'List reservation submissions.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: { submissions: { type: 'array', items: reservationSubmissionObject } },
      required: ['submissions'],
    },
  }),
  siteTool({
    name: 'get_notification_settings',
    description: 'Get notification settings.',
    domain: 'notifications',
    minimumRole: 'admin',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        notifications: {
          type: 'object',
          properties: {
            whatsapp_phone: { type: ['string', 'null'] },
            notify_on_contact: { type: 'number' },
            notify_on_reservation: { type: 'number' },
            notify_on_booking: { type: 'number' },
          },
        },
      },
      required: ['notifications'],
    },
  }),
  siteTool({
    name: 'update_notification_settings',
    description: 'Update notification settings.',
    domain: 'notifications',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { whatsapp_phone: { type: 'string' } },
    required: ['whatsapp_phone'],
    outputSchema: {
      type: 'object',
      properties: {
        notifications: {
          type: 'object',
          properties: { whatsapp_phone: { type: 'string' } },
          required: ['whatsapp_phone'],
        },
      },
      required: ['notifications'],
    },
  }),
  siteTool({
    name: 'get_google_business_connection',
    description: 'Get a location Google Business connection.',
    domain: 'google_business',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            account_id: { type: ['string', 'null'] },
            gmb_location_id: { type: ['string', 'null'] },
            location_name: { type: ['string', 'null'] },
            last_synced_at: { type: ['string', 'null'] },
          },
          required: ['connected'],
        },
      },
      required: ['connection'],
    },
  }),
  siteTool({
    name: 'get_google_business_auth_url',
    description: 'Start Google Business auth for a location.',
    domain: 'google_business',
    minimumRole: 'owner',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', description: 'Google OAuth URL — direct the user to open this in a browser.' },
      },
      required: ['authUrl'],
    },
  }),
  siteTool({
    name: 'list_google_business_accounts',
    description: 'List connected Google Business accounts and locations.',
    domain: 'google_business',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    outputSchema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              locations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    address: { type: 'string' },
                  },
                  required: ['id', 'name'],
                },
              },
            },
            required: ['id', 'name'],
          },
        },
      },
      required: ['accounts'],
    },
  }),
  siteTool({
    name: 'sync_google_business_locations',
    description: 'Sync selected Google Business locations into the site.',
    domain: 'google_business',
    minimumRole: 'owner',
    confirmRequired: true,
    requiredEntitlement: 'google_business',
    inputSchema: { account_id: { type: 'string' }, location_ids: { type: 'array' } },
    required: ['account_id', 'location_ids'],
    outputSchema: {
      type: 'object',
      properties: {
        synced: { type: 'number', description: 'Number of locations synced.' },
        locations: { type: 'array', items: locationObject },
      },
      required: ['synced'],
    },
  }),
  siteTool({
    name: 'list_work_requests',
    description: 'List managed-service work requests.',
    domain: 'managed_service',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'managed_service',
    outputSchema: {
      type: 'object',
      properties: { requests: { type: 'array', items: workRequestObject } },
      required: ['requests'],
    },
  }),
  siteTool({
    name: 'create_work_request',
    description: 'Create a managed-service work request.',
    domain: 'managed_service',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'managed_service',
    inputSchema: { type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } },
    required: ['type', 'title'],
    outputSchema: {
      type: 'object',
      properties: workRequestObject.properties,
      required: ['id', 'type', 'title', 'status'],
    },
  }),
  // ─── Domain management ───────────────────────────────────────────────────────
  siteTool({
    name: 'get_site_domains',
    description: 'List all domains (subdomains and custom domains) for the site, including their status and DNS setup instructions.',
    domain: 'settings',
    minimumRole: 'owner',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              domain: { type: 'string' },
              type: { type: 'string', description: "'subdomain' or 'custom'" },
              role: { type: 'string', description: "'canonical' or 'secondary'" },
              status: { type: 'string', description: "'pending', 'active', 'failed', etc." },
              instructions: { type: 'object', description: 'DNS setup instructions for custom domains.' },
            },
            required: ['id', 'domain', 'type', 'role', 'status'],
          },
        },
      },
      required: ['domains'],
    },
  }),
  siteTool({
    name: 'create_domain',
    description: 'Add a custom domain to the site. Provisions Cloudflare for SaaS hostnames and returns DNS records the client must add at their registrar. Requires the custom_domains entitlement (Growth plan or higher).',
    domain: 'settings',
    minimumRole: 'owner',
    confirmRequired: true,
    requiredEntitlement: 'custom_domains',
    inputSchema: {
      domain: { type: 'string', description: 'Custom domain to add, e.g. "www.example.com" or "example.com".' },
      include_www: { type: 'boolean', description: 'If true (default), provision both www and the apex domain as a pair.' },
    },
    required: ['domain'],
    outputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          description: 'Newly created domain records (www + apex pair).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              domain: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              instructions: { type: 'object', description: 'DNS records to add at the registrar.' },
            },
            required: ['id', 'domain', 'role', 'status'],
          },
        },
      },
      required: ['domains'],
    },
  }),
  siteTool({
    name: 'set_canonical_domain',
    description: 'Make an active custom domain the canonical (primary) URL for the site. All other domains become secondary redirects.',
    domain: 'settings',
    minimumRole: 'owner',
    confirmRequired: true,
    inputSchema: {
      domain_id: { type: 'string', description: 'ID of the domain to promote to canonical.' },
    },
    required: ['domain_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        domain: { type: 'string' },
        role: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['id', 'domain', 'role', 'status'],
    },
  }),
  siteTool({
    name: 'delete_domain',
    description: 'Remove a custom domain from the site and deprovision it from Cloudflare. Cannot delete subdomain entries.',
    domain: 'settings',
    minimumRole: 'owner',
    confirmRequired: true,
    inputSchema: {
      domain_id: { type: 'string', description: 'ID of the custom domain to delete.' },
    },
    required: ['domain_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' }, domain_id: { type: 'string' } },
      required: ['deleted', 'domain_id'],
    },
  }),
  siteTool({
    name: 'sync_domain',
    description: 'Refresh the SSL/DNS status for a custom domain by re-querying Cloudflare. Use this after the client adds DNS records to check if the domain is now active.',
    domain: 'settings',
    minimumRole: 'owner',
    confirmRequired: false,
    inputSchema: {
      domain_id: { type: 'string', description: 'ID of the domain to sync.' },
    },
    required: ['domain_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        domain: { type: 'string' },
        status: { type: 'string' },
        ssl_status: { type: 'string' },
        dns_status: { type: 'string' },
        instructions: { type: 'object' },
      },
      required: ['id', 'domain', 'status'],
    },
  }),
  // ─── Analytics ────────────────────────────────────────────────────────────────
  siteTool({
    name: 'get_site_analytics',
    description: 'Get traffic analytics for the site: page views, sessions, top pages. Ask "how many visitors this month?" or "what pages are most popular?"',
    domain: 'analytics',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      start_date: { type: 'string', description: 'Start of period in YYYY-MM-DD format. Defaults to 30 days ago.' },
      end_date: { type: 'string', description: 'End of period in YYYY-MM-DD format. Defaults to today.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'object',
          properties: {
            pageViews: { type: 'number' },
            uniqueSessions: { type: 'number' },
            avgSessionDuration: { type: 'number', description: 'Average session duration in seconds.' },
            changePercent: { type: 'number', description: 'Percent change versus the previous equivalent period.' },
          },
          required: ['pageViews', 'uniqueSessions'],
        },
        topPages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              views: { type: 'number' },
              percentOfTotal: { type: 'number' },
            },
          },
        },
        period: {
          type: 'object',
          properties: { startDate: { type: 'string' }, endDate: { type: 'string' } },
        },
      },
      required: ['metrics', 'period'],
    },
  }),
].sort((a, b) => a.name.localeCompare(b.name))

{
  const toolNames = new Set(MCP_TOOLS.map((tool) => tool.name))
  for (const name of TOOL_ANNOTATIONS_BY_NAME.keys()) {
    if (!toolNames.has(name)) {
      console.warn(`MCP tool annotation classification exists for unknown tool "${name}".`)
    }
  }
}

export function getMcpTool(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null
}
