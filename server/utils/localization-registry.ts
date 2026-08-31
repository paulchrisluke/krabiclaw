import { localizationError } from '~/server/utils/localization-errors'

export const LOCALIZED_RESOURCE_TYPES = [
  'site',
  'business_location',
  'product',
  'experience',
  'offering',
  'site_post',
  'tenant_blog_post',
  'location_qa',
  'media_asset',
  'booking_policy',
  'site_link_page',
  'site_link_item',
  'tenant_compliance',
  'site_consultation_settings',
] as const

export type LocalizedResourceType = typeof LOCALIZED_RESOURCE_TYPES[number]
export type LocalizedValues = Record<string, unknown>

type ValueShape = 'text' | 'string_array' | 'details' | 'features' | 'faqs'

interface ResourceLocalizationDefinition {
  table: string
  required: readonly string[]
  optional: readonly string[]
  shapes?: Readonly<Record<string, ValueShape>>
  route: 'none' | 'location' | 'product' | 'experience' | 'offering' | 'site_post' | 'tenant_blog_post' | 'site_link_page'
}

export const RESOURCE_LOCALIZATION_REGISTRY: Readonly<Record<LocalizedResourceType, ResourceLocalizationDefinition>> = Object.freeze({
  site: { table: 'sites', required: ['brand_name'], optional: ['brand_description', 'seo_title', 'seo_description'], route: 'none' },
  business_location: {
    table: 'business_locations',
    required: ['title'],
    optional: ['address', 'city', 'neighborhood', 'description', 'short_description', 'opening_hours', 'seo_title', 'seo_description'],
    shapes: { opening_hours: 'string_array' },
    route: 'location',
  },
  product: {
    table: 'products',
    required: ['category', 'name'],
    optional: ['description', 'tags_json', 'details_json', 'seo_title', 'seo_description'],
    shapes: { tags_json: 'string_array', details_json: 'details' },
    route: 'product',
  },
  experience: {
    table: 'experiences',
    required: ['title'],
    optional: ['tagline', 'body', 'price', 'available_note', 'highlights_json', 'included_items_json', 'what_to_bring', 'meeting_point', 'cancellation_policy', 'seo_title', 'seo_description'],
    shapes: { highlights_json: 'string_array', included_items_json: 'string_array', what_to_bring: 'string_array' },
    route: 'experience',
  },
  offering: {
    table: 'offerings',
    required: ['name'],
    optional: ['label', 'summary', 'short_description', 'body', 'features_json', 'faqs_json', 'cta_label', 'seo_title', 'seo_description'],
    shapes: { features_json: 'features', faqs_json: 'faqs' },
    route: 'offering',
  },
  site_post: {
    table: 'posts',
    required: ['title', 'body'],
    optional: ['seo_title', 'seo_description', 'event_title', 'offer_terms'],
    route: 'site_post',
  },
  tenant_blog_post: {
    table: 'blog_posts',
    required: ['title'],
    optional: ['excerpt', 'category', 'tags_json', 'nav_title', 'seo_title', 'seo_description'],
    shapes: { tags_json: 'string_array' },
    route: 'tenant_blog_post',
  },
  location_qa: { table: 'location_qa', required: ['question'], optional: ['answer'], route: 'none' },
  media_asset: { table: 'media_assets', required: [], optional: ['alt_text'], route: 'none' },
  booking_policy: { table: 'booking_policies', required: [], optional: ['weather_policy', 'additional_notes_html'], route: 'none' },
  site_link_page: { table: 'site_link_pages', required: ['title'], optional: ['seo_title', 'seo_description'], route: 'site_link_page' },
  site_link_item: { table: 'site_link_items', required: ['label'], optional: [], route: 'none' },
  tenant_compliance: { table: 'tenant_compliance', required: [], optional: ['service_area', 'disclaimer', 'footer_disclaimer'], route: 'none' },
  site_consultation_settings: { table: 'site_consultation_settings', required: [], optional: ['cta_label'], route: 'none' },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonBlankText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateShape(field: string, value: unknown, shape: ValueShape): void {
  if (shape === 'text') return
  if (shape === 'string_array') {
    if (Array.isArray(value) && value.every(isNonBlankText)) return
  } else if (shape === 'details') {
    if (Array.isArray(value) && value.every(item => isRecord(item)
      && Object.keys(item).every(key => key === 'key' || key === 'label' || key === 'values')
      && isNonBlankText(item.key) && isNonBlankText(item.label)
      && Array.isArray(item.values) && item.values.every(isNonBlankText))) return
  } else if (shape === 'features') {
    if (Array.isArray(value) && value.every(item => isRecord(item)
      && Object.keys(item).every(key => ['title', 'description', 'icon', 'sort_order'].includes(key))
      && isNonBlankText(item.title) && isNonBlankText(item.description)
      && (item.icon === undefined || item.icon === null || typeof item.icon === 'string')
      && (item.sort_order === undefined || Number.isInteger(item.sort_order)))) return
  } else if (shape === 'faqs') {
    if (Array.isArray(value) && value.every(item => isRecord(item)
      && Object.keys(item).every(key => key === 'question' || key === 'answer')
      && isNonBlankText(item.question) && isNonBlankText(item.answer))) return
  }
  localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} has an invalid localized value shape`, { field })
}

export function parseLocalizedResourceType(value: unknown): LocalizedResourceType {
  if (typeof value === 'string' && (LOCALIZED_RESOURCE_TYPES as readonly string[]).includes(value)) {
    return value as LocalizedResourceType
  }
  localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Unsupported localized resource type', { resource_type: value })
}

export function validateLocalizedValues(resourceType: LocalizedResourceType, input: unknown): LocalizedValues {
  if (!isRecord(input)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'values must be an object')
  const definition = RESOURCE_LOCALIZATION_REGISTRY[resourceType]
  const allowed = new Set([...definition.required, ...definition.optional])
  const unknown = Object.keys(input).filter(key => !allowed.has(key)).sort()
  if (unknown.length) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `Unknown localized field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`, { fields: unknown })
  }
  const missing = definition.required.filter(field => !isNonBlankText(input[field]))
  if (missing.length) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `Missing required localized field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`, { fields: missing })
  }
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be omitted instead of null`, { field })
    }
    const shape = definition.shapes?.[field] ?? 'text'
    if (shape === 'text' && typeof value !== 'string') {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be a string`, { field })
    }
    validateShape(field, value, shape)
  }
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
}

const SEGMENT = '[^/?#]+'

export function validateLocalizedRoutePath(
  resourceType: LocalizedResourceType,
  locale: string,
  routePath: unknown,
  vertical: string,
): string | null {
  const definition = RESOURCE_LOCALIZATION_REGISTRY[resourceType]
  if (definition.route === 'none') {
    if (routePath !== undefined && routePath !== null) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${resourceType} does not accept route_path`)
    }
    return null
  }
  if (typeof routePath !== 'string' || !routePath.trim()) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `route_path is required for ${resourceType}`)
  }
  const path = routePath.trim()
  const escapedLocale = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let pattern: RegExp
  if (definition.route === 'location') pattern = new RegExp(`^/${escapedLocale}/locations/${SEGMENT}$`)
  else if (definition.route === 'product') {
    const family = vertical === 'restaurant' ? 'menu' : 'products'
    pattern = new RegExp(`^/${escapedLocale}/locations/${SEGMENT}/${family}/${SEGMENT}$`)
  } else if (definition.route === 'experience') pattern = new RegExp(`^/${escapedLocale}/experiences/${SEGMENT}$`)
  else if (definition.route === 'offering') pattern = new RegExp(`^/${escapedLocale}/services/${SEGMENT}$`)
  else if (definition.route === 'site_post') pattern = new RegExp(`^/${escapedLocale}/posts/${SEGMENT}$`)
  else if (definition.route === 'tenant_blog_post') {
    pattern = new RegExp(`^/${escapedLocale}/${vertical === 'service' ? 'article' : 'blog'}/${SEGMENT}$`)
  } else pattern = new RegExp(`^/${escapedLocale}/${SEGMENT}$`)
  if (!pattern.test(path) || path.includes('//')) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `route_path is invalid for ${resourceType}`, { route_path: path })
  }
  return path
}
