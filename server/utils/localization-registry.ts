import { localizationError } from '~/server/utils/localization-errors'
import { isBlawbyBlogTemplate } from '~/utils/tenant-blog-route'

export const LOCALIZED_RESOURCE_TYPES = [
  'site',
  'business_location',
  'product',
  'product_category',
  'experience',
  'offering',
  'site_post',
  'tenant_blog_post',
  'location_qa',
  'media_asset',
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
  fields: Readonly<Record<string, ValueShape>>
  route: 'none' | 'location' | 'product' | 'experience' | 'offering' | 'site_post' | 'tenant_blog_post' | 'site_link_page'
}

export const RESOURCE_LOCALIZATION_REGISTRY: Readonly<Record<LocalizedResourceType, ResourceLocalizationDefinition>> = Object.freeze({
  site: {
    table: 'sites',
    fields: {
      brand_name: 'text',
      brand_description: 'text',
      seo_title: 'text',
      seo_description: 'text',
    },
    route: 'none',
  },
  business_location: {
    table: 'business_locations',
    fields: {
      title: 'text',
      address: 'text',
      city: 'text',
      neighborhood: 'text',
      description: 'text',
      short_description: 'text',
      opening_hours: 'string_array',
      seo_title: 'text',
      seo_description: 'text',
    },
    route: 'location',
  },
  product: {
    table: 'products',
    fields: {
      name: 'text',
      description: 'text',
      tags_json: 'string_array',
      details_json: 'details',
      seo_title: 'text',
      seo_description: 'text',
    },
    route: 'product',
  },
  // The category name lives on the category row, so it is translated once per
  // category instead of once per Product that happens to sit in it.
  product_category: {
    table: 'product_categories',
    fields: {
      name: 'text',
    },
    route: 'none',
  },
  experience: {
    table: 'experiences',
    fields: {
      title: 'text',
      tagline: 'text',
      body: 'text',
      pricing_note: 'text',
      included_items_json: 'string_array',
      what_to_bring: 'string_array',
      meeting_point: 'text',
      cancellation_policy: 'text',
      seo_title: 'text',
      seo_description: 'text',
    },
    route: 'experience',
  },
  offering: {
    table: 'offerings',
    fields: {
      name: 'text',
      label: 'text',
      summary: 'text',
      short_description: 'text',
      body: 'text',
      features_json: 'features',
      faqs_json: 'faqs',
      cta_label: 'text',
      seo_title: 'text',
      seo_description: 'text',
    },
    route: 'offering',
  },
  site_post: {
    table: 'posts',
    fields: {
      title: 'text',
      body: 'text',
      seo_title: 'text',
      seo_description: 'text',
      event_title: 'text',
      offer_terms: 'text',
    },
    route: 'site_post',
  },
  tenant_blog_post: {
    table: 'blog_posts',
    fields: {
      title: 'text',
      excerpt: 'text',
      category: 'text',
      tags_json: 'string_array',
      nav_title: 'text',
      seo_title: 'text',
      seo_description: 'text',
      seo_keywords: 'text',
    },
    route: 'tenant_blog_post',
  },
  location_qa: { table: 'location_qa', fields: { question: 'text', answer: 'text' }, route: 'none' },
  media_asset: { table: 'media_assets', fields: { alt_text: 'text' }, route: 'none' },
  site_link_page: { table: 'site_link_pages', fields: { title: 'text', seo_title: 'text', seo_description: 'text' }, route: 'site_link_page' },
  site_link_item: { table: 'site_link_items', fields: { label: 'text' }, route: 'none' },
  tenant_compliance: { table: 'tenant_compliance', fields: { service_area: 'text', disclaimer: 'text', footer_disclaimer: 'text' }, route: 'none' },
  site_consultation_settings: { table: 'site_consultation_settings', fields: { cta_label: 'text' }, route: 'none' },
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
  const unknown = Object.keys(input).filter(key => !Object.hasOwn(definition.fields, key)).sort()
  if (unknown.length) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `Unknown localized field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`, { fields: unknown })
  }
  for (const [field, shape] of Object.entries(definition.fields)) {
    if (!Object.hasOwn(input, field)) continue
    const value = input[field]
    if (value === undefined || value === null) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be omitted instead of null`, { field })
    }
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
    pattern = new RegExp(`^/${escapedLocale}/${isBlawbyBlogTemplate({ vertical }) ? 'article' : 'blog'}/${SEGMENT}$`)
  } else pattern = new RegExp(`^/${escapedLocale}/${SEGMENT}$`)
  if (!pattern.test(path) || path.includes('//')) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `route_path is invalid for ${resourceType}`, { route_path: path })
  }
  return path
}
