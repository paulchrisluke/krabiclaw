// AUTO-SPLIT from the former monolithic mcp-tools.ts. Shared schema fragments,
// annotation helpers, and tool-builder functions used across MCP_TOOLS domain files.
import type { McpToolRole } from '~/server/utils/mcp-auth'
import { EXPERIENCE_STATUSES } from '~/server/utils/experiences'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'
import { PUBLICATION_CONTENT_BLOCK_TYPES } from '~/shared/content-registries'

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
  openWorldHint: boolean
  destructiveHint: boolean
  idempotentHint?: boolean
}

export interface McpToolSecurityScheme {
  type: 'oauth2'
  scopes: string[]
}

export const MCP_TOOL_SECURITY_SCHEMES: McpToolSecurityScheme[] = [
  { type: 'oauth2', scopes: ['tenant'] },
]

export const paginationInputSchema = {
  limit: { type: 'number', minimum: 1, maximum: 100, description: 'Page size. Defaults to 50; maximum 100.' },
  cursor: { type: 'string', description: 'Opaque next_cursor from the previous page.' },
}

export const pageInfoObject = {
  type: 'object',
  properties: {
    has_more: { type: 'boolean' },
    next_cursor: { type: ['string', 'null'] },
  },
  required: ['has_more', 'next_cursor'],
}

// --- reusable schema fragments ---

export const ROBOTS_DIRECTIVE_ENUM = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']

// Tenant blog shares the nav vocabulary with platform docs/blog (server/utils/platform-mcp-tools.ts
// NAV_FIELDS_SCHEMA), but blog posts never get nav_group subgrouping — only docs do.
export const BLOG_NAV_FIELDS_SCHEMA = {
  nav_section: { type: ['string', 'null'], description: 'Top-level sidebar section label for this site\'s blog. Falls back to category if unset. Does not affect the public URL.' },
  nav_title: { type: ['string', 'null'], description: 'Sidebar label override. Falls back to the post title if unset. Does not affect the public URL.' },
  nav_order: { type: ['number', 'null'], description: 'Sort position within its section. Lower sorts first.' },
  nav_section_order: { type: ['number', 'null'], description: 'Sort position of the section itself among all sections.' },
  hide_from_nav: { type: ['boolean', 'null'], description: 'Excludes this post from nav rendering only. Does NOT deindex it or remove it from the sitemap — use robots="noindex,..." for that.' },
  featured_order: { type: ['number', 'null'], description: 'Sort position in featured/homepage placements, independent of nav ordering.' },
}

/** SEO override fields shared across location/Product/experience/site tools. */
export function seoOverrideFieldsSchema() {
  return {
    seo_title: { type: ['string', 'null'], description: 'Optional SEO title override. Falls back to the computed default if unset.' },
    seo_description: { type: ['string', 'null'], description: 'Optional SEO meta description override. Falls back to the computed default if unset.' },
    canonical_url: { type: ['string', 'null'], description: 'Optional canonical URL override. Leave unset for the default self-referencing canonical.' },
    robots: { type: ['string', 'null'], enum: [...ROBOTS_DIRECTIVE_ENUM, null], description: 'Search engine indexing directive. Leave unset for the default index,follow.' },
  }
}

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
    notification_phone: { type: ['string', 'null'], description: 'WhatsApp number for internal booking/reservation alerts to this location\'s manager. Not shown to guests. Falls back to the site-level whatsapp_phone if null.' },
    timezone: { type: ['string', 'null'], description: 'IANA time zone identifier for this location, e.g. Asia/Bangkok. Used to interpret opening hours and booking slots.' },
    max_capacity: { type: ['number', 'null'], description: 'Maximum total guests this location can seat per reservation time slot. Null means no cap is enforced (slots remain bookable).' },
    facebook_url: { type: ['string', 'null'] },
    instagram_url: { type: ['string', 'null'] },
    tiktok_url: { type: ['string', 'null'] },
    grab_url: { type: ['string', 'null'] },
    uber_eats_url: { type: ['string', 'null'] },
    foodpanda_url: { type: ['string', 'null'] },
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    robots: { type: ['string', 'null'] },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
          public_url: { type: 'string' },
          thumbnail_url: { type: ['string', 'null'] },
          alt_text: { type: ['string', 'null'] },
          sort_order: { type: 'number' },
        },
        required: ['asset_id', 'kind', 'public_url', 'sort_order'],
      },
    },
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

const faqItemSchema = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    answer: { type: 'string' },
    position: { type: 'number' },
  },
  required: ['question', 'answer'],
}

const howToStepSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    text: { type: 'string' },
    url: { type: ['string', 'null'] },
    position: { type: 'number' },
  },
  required: ['name', 'text'],
}

// `data`'s shape depends on the sibling `type` field (faq vs how_to), so it's spelled out
// per-type via if/then here instead of left as a bare object — that's what gives the model
// the actual field names (how_to steps need `name`+`text`) instead of an opaque object it
// has to guess the shape of. Tenant blog posts share the same validator (and therefore the
// same field names) as platform blog posts/docs — see server/utils/platform-content.ts.
export const blogComponentInputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['faq', 'how_to', 'ai_assistance'] },
    label: { type: ['string', 'null'] },
    status: { type: ['string', 'null'], enum: ['active', 'inactive', null] },
    render_enabled: { type: ['boolean', 'null'] },
    schema_enabled: { type: ['boolean', 'null'] },
    position: { type: ['number', 'null'] },
    data: { type: 'object' },
  },
  required: ['type', 'data'],
  allOf: [
    {
      if: { properties: { type: { const: 'faq' } } },
      then: {
        properties: {
          data: {
            type: 'object',
            properties: { items: { type: 'array', items: faqItemSchema } },
            required: ['items'],
          },
        },
      },
    },
    {
      if: { properties: { type: { const: 'how_to' } } },
      then: {
        properties: {
          data: {
            type: 'object',
            properties: {
              steps: { type: 'array', items: howToStepSchema },
              estimated_time: { type: ['string', 'null'] },
              tool_items: { type: 'array', items: { type: 'string' } },
              supply_items: { type: 'array', items: { type: 'string' } },
            },
            required: ['steps'],
          },
        },
      },
    },
  ],
}

const mediaPlacementObject = {
  type: 'object',
  properties: {
    asset_id: { type: 'string' },
    slot: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    kind: { type: ['string', 'null'] },
    width: { type: ['number', 'null'] },
    height: { type: ['number', 'null'] },
  },
  additionalProperties: false,
}

const blogContentBlockObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    parent_block_id: { type: ['string', 'null'] },
    type: { type: 'string', enum: [...PUBLICATION_CONTENT_BLOCK_TYPES] },
    position: { type: 'number' },
    level: { type: ['number', 'null'] },
    data: { type: 'object' },
    media: { type: 'array', items: mediaPlacementObject },
  },
  required: ['id', 'parent_block_id', 'type', 'position', 'level', 'data', 'media'],
  additionalProperties: false,
}

export const blogPostObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    ...BLOG_NAV_FIELDS_SCHEMA,
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    seo_keywords: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    robots: { type: ['string', 'null'] },
    published: { type: 'boolean' },
    published_at: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['published', 'scheduled'] },
    visibility: { type: 'string', enum: ['public', 'unlisted'] },
    scheduled_for: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    media: { type: 'array', items: mediaPlacementObject },
    admin_edit_url: { type: ['string', 'null'] },
    edit_url: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    preview_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
    content_blocks: { type: 'array', items: blogContentBlockObject },
    document_updated_at: { type: 'string', description: 'Concurrency token required when replacing content_blocks or changing publication state.' },
  },
  required: [
    'id', 'title', 'slug', 'excerpt', 'category', 'tags',
    'nav_section', 'nav_title', 'nav_order', 'nav_section_order', 'hide_from_nav', 'featured_order',
    'seo_title', 'seo_description', 'seo_keywords', 'canonical_url', 'robots',
    'published', 'published_at', 'status', 'visibility', 'scheduled_for',
    'created_at', 'updated_at', 'media', 'admin_edit_url', 'edit_url',
    'public_path', 'public_url', 'preview_url', 'view_url',
    'content_blocks', 'document_updated_at',
  ],
  additionalProperties: false,
}

export const blogPostSummaryObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    ...BLOG_NAV_FIELDS_SCHEMA,
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    seo_keywords: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    robots: { type: ['string', 'null'] },
    published: { type: 'boolean' },
    published_at: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['published', 'scheduled'] },
    visibility: { type: 'string', enum: ['public', 'unlisted'] },
    scheduled_for: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    media: { type: 'array', items: mediaPlacementObject },
    admin_edit_url: { type: ['string', 'null'] },
    edit_url: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    preview_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
  },
  required: [
    'id', 'title', 'slug', 'excerpt', 'category', 'tags',
    'nav_section', 'nav_title', 'nav_order', 'nav_section_order', 'hide_from_nav', 'featured_order',
    'seo_title', 'seo_description', 'seo_keywords', 'canonical_url', 'robots',
    'published', 'published_at', 'status', 'visibility', 'scheduled_for',
    'created_at', 'updated_at', 'media', 'admin_edit_url', 'edit_url',
    'public_path', 'public_url', 'preview_url', 'view_url',
  ],
  additionalProperties: false,
}

export const blogPostMutationResultObject = {
  type: 'object',
  properties: {
    post: blogPostObject,
  },
  required: ['post'],
  additionalProperties: false,
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
    channel_outcomes: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['published', 'skipped', 'failed'] },
          reason: { type: ['string', 'null'] },
        },
        required: ['status'],
      },
    },
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
    status: { type: 'string', enum: ['published', 'scheduled'] },
    scheduled_for: { type: ['string', 'null'] },
    published_at: { type: ['string', 'null'] },
    public_path: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
    canonical_url: { type: ['string', 'null'] },
    view_url: { type: ['string', 'null'] },
    seo_title: { type: ['string', 'null'] },
    seo_description: { type: ['string', 'null'] },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
          public_url: { type: 'string' },
          thumbnail_url: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['image', 'video'] },
          slot: { type: 'string', enum: ['cover', 'gallery'] },
          sort_order: { type: 'number' },
          alt_text: { type: ['string', 'null'] },
          width: { type: ['number', 'null'] },
          height: { type: ['number', 'null'] },
        },
        required: ['asset_id', 'public_url', 'kind', 'slot', 'sort_order'],
        additionalProperties: false,
      },
    },
    channels: {
      type: 'array',
      description: 'Per-channel publish job status. Check this for facebook/instagram publish failures — publish_post can succeed overall while an individual channel is skipped or failed.',
      items: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['site', 'instagram', 'facebook'] },
          status: { type: 'string', enum: ['pending', 'published', 'failed', 'skipped'] },
          error: { type: ['string', 'null'] },
          published_at: { type: ['string', 'null'] },
        },
        required: ['channel', 'status'],
      },
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

export const mediaAssetObject = {
  type: 'object',
  properties: {
    asset_id: { type: 'string' },
    kind: { type: 'string', enum: ['image', 'video', 'file'] },
    provider: { type: 'string' },
    source: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    alt_text: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'active', 'deleted', 'failed'] },
    file_name: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
  required: ['asset_id', 'kind', 'provider', 'source', 'status'],
}

export const currentUserObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
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

export const resolvedMediaAssetObject = {
  type: 'object',
  properties: {
    asset_id: { type: 'string' },
    kind: { type: 'string', enum: ['image', 'video', 'file'] },
    public_url: { type: 'string' },
    thumbnail_url: { type: ['string', 'null'] },
    mime_type: { type: ['string', 'null'] },
    width: { type: ['number', 'null'] },
    height: { type: ['number', 'null'] },
    duration: { type: ['number', 'null'] },
    alt_text: { type: ['string', 'null'] },
    provider: { type: 'string' },
    status: { type: 'string', enum: ['active'] },
  },
  required: ['asset_id', 'kind', 'public_url', 'status'],
}

export const priceObject = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'string' }, amount_minor: { type: 'integer' }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] }, valid_from: { type: 'string' },
    valid_until: { type: ['string', 'null'] }, provenance: { type: 'string' },
  },
  required: ['id', 'amount_minor', 'currency', 'unit', 'tax_behavior', 'compare_at_amount_minor', 'valid_from', 'valid_until', 'provenance'],
}

export const priceWriteObject = {
  type: ['object', 'null'],
  properties: {
    amount_minor: { type: 'integer', minimum: 0 }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] }, valid_from: { type: 'string' },
    valid_until: { type: ['string', 'null'] }, provenance: { type: 'string' },
  },
  required: ['amount_minor'],
  additionalProperties: false,
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
    price: priceObject,
    scheduled_prices: { type: 'array', items: priceObject },
    pricing_note: { type: ['string', 'null'] },
    max_capacity: { type: ['number', 'null'] },
    status: { type: 'string', enum: [...EXPERIENCE_STATUSES] },
    location_id: { type: ['string', 'null'] },
    media: {
      type: 'array',
      items: resolvedMediaAssetObject,
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
    canonical_url: { type: ['string', 'null'] },
    robots: { type: ['string', 'null'] },
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
  media: {
    type: 'array',
    description: 'Ordered image/video media asset references. Position 0 is the cover everywhere. Videos in cover position must already have thumbnail_url/poster metadata.',
    items: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'Active image or video asset id from get_site_media_assets.' },
      },
      required: ['asset_id'],
    },
  },
  price: { ...priceWriteObject, description: 'Canonical immutable Price. Use null for inquiry-only experiences.' },
  pricing_note: { type: ['string', 'null'], description: 'Concise pricing context for an inquiry-only experience.' },
  duration_minutes: { type: ['number', 'null'], description: 'Expected duration in minutes.' },
  max_capacity: { type: ['number', 'null'], description: 'Maximum guest count for a single booking or session.' },
  time_slots: { type: ['array', 'null'], items: { type: 'string' }, description: 'Flat daily time slots in HH:MM format, used when the same schedule applies every day. Ignored if recurring_slots is set.' },
  recurring_slots: {
    type: ['object', 'null'],
    description: 'Per-weekday time slots in HH:MM format when the schedule differs by day. Keys must be full weekday names such as Monday or Friday. Takes priority over time_slots when set.',
    additionalProperties: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  slot_start: { type: 'string', description: 'Convenience: auto-generate slots from this "HH:MM" start time. Used with slot_end and slot_interval_minutes instead of typing time_slots by hand.' },
  slot_end: { type: 'string', description: 'Convenience: auto-generate slots up to and including this "HH:MM" end time.' },
  slot_interval_minutes: { type: 'number', description: 'Convenience: interval in minutes between generated slots, e.g. 30.' },
  slot_weekday: { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], description: 'If set alongside slot_start/slot_end/slot_interval_minutes, the generated slots are assigned to recurring_slots for this weekday instead of the flat time_slots list.' },
  available_note: { type: ['string', 'null'], description: 'Short urgency or availability note, e.g. "Last 2 spots".' },
  highlights: { type: ['array', 'null'], items: { type: 'string' }, description: 'Short bullet-point highlights for the experience. Use one concise string per highlight.' },
  included_items: { type: ['array', 'null'], items: { type: 'string' }, description: 'Explicit list of what is included. Use one concise string per included item.' },
  what_to_bring: { type: ['array', 'null'], items: { type: 'string' }, description: 'Explicit list of what guests should bring or prepare. Use one concise string per item.' },
  meeting_point: { type: ['string', 'null'], description: 'Specific arrival or check-in instruction for guests.' },
  status: experienceStatusSchema,
  sort_order: { type: 'number', description: 'Lower numbers sort earlier in lists.' },
  featured: { type: 'boolean', description: 'Whether this experience should be highlighted in featured placements.' },
  featured_sort_order: { type: 'number', description: 'Lower numbers sort earlier among featured experiences.' },
  location_id: { type: 'string', description: 'Location id. Required when creating an experience; updates may omit it to keep the stored owning location.' },
  seo_title: { type: ['string', 'null'], description: 'Optional SEO title override.' },
  seo_description: { type: ['string', 'null'], description: 'Optional SEO description override.' },
  canonical_url: { type: ['string', 'null'], description: 'Optional canonical URL override. Leave unset for the default self-referencing canonical.' },
  robots: { type: ['string', 'null'], enum: [...ROBOTS_DIRECTIVE_ENUM, null], description: 'Search engine indexing directive. Leave unset for the default index,follow.' },
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
    reschedule_allowed: { type: ['boolean', 'null'] },
    reschedule_cutoff_minutes: { type: ['number', 'null'] },
    deposit_required: { type: ['boolean', 'null'] },
    deposit_trigger_party_size: { type: ['number', 'null'] },
    special_requests_allowed: { type: ['boolean', 'null'] },
    weather_policy: { type: ['string', 'null'] },
    minimum_guest_age: { type: ['number', 'null'] },
    accessibility_contact_required: { type: ['boolean', 'null'] },
    additional_notes_html: { type: ['string', 'null'] },
    source_scope: { type: ['string', 'null'] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
  },
}

export const bookingPolicyWriteSchema = {
  policy_type: { type: 'string', enum: ['reservation', 'experience'] },
  scope_type: { type: 'string', enum: ['site', 'location', 'experience'], description: 'Reservation policies must use location scope. Experience policies may use site, location, or experience scope.' },
  location_id: { type: 'string', description: 'Required for reservation policies and location-scoped experience policies.' },
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
    location_id: { type: ['string', 'null'] },
  },
}

export const reviewObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    author_name: { type: ['string', 'null'] },
    rating: { type: 'number' },
    title: { type: ['string', 'null'] },
    content: { type: ['string', 'null'] },
    owner_reply: { type: ['string', 'null'] },
    source: { type: 'string' },
    status: { type: 'string' },
    created_at: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    collection_method: { type: ['string', 'null'] },
    original_review_date: { type: ['string', 'null'] },
    original_reference: { type: ['string', 'null'] },
    publication_authorized: { type: 'boolean' },
    verified: { type: 'boolean' },
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

export const siteListItem = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    organizationId: { type: 'string' },
    organizationName: { type: ['string', 'null'] },
    name: { type: 'string', description: 'Brand name or subdomain slug.' },
    subdomain: { type: 'string' },
    orgSlug: { type: 'string', description: 'Organization slug — combine with this site\'s subdomain and locationSlug from list_locations to build the dashboard URL: https://krabiclaw.com/dashboard/{orgSlug}/sites/{subdomain}/locations/{locationSlug}' },
    publicUrl: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
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
  site_id: { type: 'string', description: 'Internal KrabiClaw site ID from get_workspace_context, list_sites, or create_site, e.g. site-pottery-house. Do not pass a public URL, hostname, subdomain, custom domain, slug, or site name here.' },
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
          asset_id: { type: 'string' },
          public_url: { type: 'string' },
        },
        required: ['asset_id', 'public_url'],
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
      additionalProperties: false,
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
      // Re-validate even on this pre-built-definition path — a caller could
      // hand in annotations that never passed through withToolAnnotations.
      validateToolAnnotations(definition.name, definition.annotations, definition.confirmRequired)
      return { ...definition, inputSchema: { ...definition.inputSchema, additionalProperties: false } }
    }
  }

  return withToolAnnotations(definition)
}

export type RawMcpToolDefinition = Omit<McpToolDefinition, 'annotations' | 'securitySchemes'>

// The explicit catalog table below is authoritative. These defaults are only
// constructors for definitions whose reviewed table entry has the same shape.
export const READ_ONLY_DEFAULT: McpToolAnnotations = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
  destructiveHint: false,
})

export function openWorldWriteAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: false }
}

export function boundedDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: false, destructiveHint: true }
}

export function openWorldDestructiveAnnotations(): McpToolAnnotations {
  return { readOnlyHint: false, openWorldHint: true, destructiveHint: true }
}

const R = READ_ONLY_DEFAULT
const W = Object.freeze(openWorldWriteAnnotations())
const BD = Object.freeze(boundedDestructiveAnnotations())
const D = Object.freeze(openWorldDestructiveAnnotations())

/** Submission-review contract. Every real public tool is listed explicitly. */
export const EXPECTED_TOOL_ANNOTATIONS = {
  analyze_document: W,
  attach_media: W,
  batch_create_products: W,
  change_tenant_page_path: D,
  copy_location_batch: D,
  create_blog_post: W,
  create_experience: W,
  create_location: W,
  create_location_qa: W,
  create_owner_entered_site_review: W,
  create_post: W,
  create_product: W,
  create_site: W,
  create_site_qa: W,
  create_tenant_page: W,
  delete_blog_post: D,
  delete_experience: D,
  delete_location: D,
  delete_location_qa: D,
  delete_media_asset: D,
  delete_owner_entered_site_review: D,
  delete_post: D,
  delete_product: D,
  delete_product_category: D,
  delete_resource_localization: D,
  delete_site_qa: D,
  get_blog_post: R,
  get_booking_policy: R,
  get_contact_inquiries: R,
  get_experience: R,
  get_location: R,
  get_post: R,
  get_product: R,
  get_product_catalog_localization: R,
  get_professional_service_content: R,
  get_reservation_inquiries: R,
  get_resource_localization: R,
  get_site: R,
  get_site_analytics: R,
  get_site_domains: R,
  get_site_media_assets: R,
  get_site_settings: R,
  get_tenant_page: R,
  get_workspace_context: R,
  import_from_maps: W,
  import_products_from_media: W,
  list_all_experience_bookings: R,
  list_blog_posts: R,
  list_experience_bookings: R,
  list_experiences: R,
  list_location_products: R,
  list_location_qa: R,
  list_location_reviews: R,
  list_locations: R,
  list_posts: R,
  list_site_locales: R,
  list_site_qa: R,
  list_site_reviews: R,
  list_sites: R,
  list_tenant_pages: R,
  move_product_category: D,
  move_products: D,
  preview_booking_policy: R,
  publish_blog_post: D,
  publish_post: D,
  put_resource_localization: D,
  remove_media: D,
  rename_product_category: D,
  reorder_blog_posts: D,
  reorder_location_qa: D,
  reorder_media: D,
  reorder_site_qa: D,
  replace_blog_content: D,
  reply_to_review: D,
  save_generated_image: W,
  save_generated_image_file: W,
  set_brand_color: D,
  set_default_currency: D,
  set_media: D,
  set_workspace_context: BD,
  show_generated_images: R,
  sync_product_catalog_localization: D,
  sync_products: D,
  update_blog_metadata: D,
  update_blog_post: D,
  update_booking_policy: D,
  update_experience: D,
  update_experience_booking: BD,
  update_location: D,
  update_location_qa: D,
  update_media_asset: D,
  update_owner_entered_site_review: D,
  update_post: D,
  update_product: D,
  update_professional_service_content: D,
  update_site_qa: D,
  update_site_settings: D,
  update_tenant_page: D,
  upload_user_media: W,
} as const satisfies Record<string, McpToolAnnotations>

export function buildToolAnnotationsByName() {
  return new Map<string, McpToolAnnotations>(Object.entries(EXPECTED_TOOL_ANNOTATIONS))
}

export const TOOL_ANNOTATIONS_BY_NAME = buildToolAnnotationsByName()

export function validateToolAnnotations(name: string, annotations: McpToolAnnotations, confirmRequired: boolean): void {
  // ChatGPT Apps submission review requires every tool to declare all three
  // hints explicitly. A future classification that forgets openWorldHint or
  // destructiveHint must fail at module load.
  if (typeof annotations.openWorldHint !== 'boolean' || typeof annotations.destructiveHint !== 'boolean') {
    throw new Error(`Tool "${name}" must declare openWorldHint and destructiveHint explicitly.`)
  }

  if (annotations.readOnlyHint === true) {
    // openWorldHint is independent of readOnlyHint — a read-only tool (e.g. a
    // web search) can legitimately be open-world. destructiveHint is the one
    // that's genuinely incompatible with read-only: a tool that only reads
    // cannot also delete, overwrite, or otherwise mutate state.
    if (annotations.destructiveHint) {
      throw new Error(`Read-only tool "${name}" cannot declare destructiveHint as true.`)
    }
    if (confirmRequired) {
      throw new Error(`Read-only MCP tool "${name}" cannot require confirmation.`)
    }
  }
}

export function withToolAnnotations(definition: RawMcpToolDefinition): McpToolDefinition {
  const annotations = TOOL_ANNOTATIONS_BY_NAME.get(definition.name)
  if (!annotations) {
    throw new Error(`Missing MCP tool annotation classification for "${definition.name}".`)
  }

  validateToolAnnotations(definition.name, annotations, definition.confirmRequired)

  return {
    ...definition,
    inputSchema: { ...definition.inputSchema, additionalProperties: false },
    securitySchemes: MCP_TOOL_SECURITY_SCHEMES,
    annotations,
  }
}


export { SUPPORTED_CURRENCIES }
