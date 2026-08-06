export const TENANT_PAGE_SCHEMA_VERSION = 1 as const

export type TenantPageBlockType =
  | 'heading'
  | 'markdown'
  | 'image'
  | 'gallery'
  | 'faq'
  | 'divider'
  | 'cta'
  | 'callout'
  | 'hero'
  | 'button_group'
  | 'feature_grid'
  | 'testimonial_grid'
  | 'contact_cta'
  | 'booking_cta'
  | 'donation_choices'
  | 'offering_grid'
  | 'location_grid'

export interface TenantPageBlock {
  id: string
  type: TenantPageBlockType
  position: number
  data: Record<string, unknown>
}

export interface TenantPageSnapshotMetadata {
  locale: string
  path: string
  title: string
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrl: string | null
  robots: string | null
  pageType: string
  recipe: string | null
}

export interface TenantPageSnapshot {
  schemaVersion: typeof TENANT_PAGE_SCHEMA_VERSION
  metadata: TenantPageSnapshotMetadata
  blocks: TenantPageBlock[]
}

export interface TenantPageBlockDefinition {
  type: TenantPageBlockType
  label: string
  description: string
  schemaVersion: typeof TENANT_PAGE_SCHEMA_VERSION
  allowedRecipes: readonly string[]
  fields: readonly string[]
  editor: 'structured-json'
  renderer: { saya: 'tenant-page'; blawby: 'tenant-page' }
  accessibility: 'required' | 'inherited'
  seo: 'structured' | 'inherited' | 'none'
}

const ALL_RECIPES = [
  'custom', 'about', 'pricing', 'donate', 'legal', 'contact', 'schedule', 'home',
  'services', 'privacy', 'terms', 'third-party-notices', 'locations', 'menu', 'order',
  'experiences', 'reservations', 'qa', 'reviews', 'posts', 'photos', 'blog',
] as const

export const TENANT_PAGE_BLOCK_REGISTRY: Record<TenantPageBlockType, TenantPageBlockDefinition> = {
  heading: blockDefinitionWithMetadata('heading', 'Heading', 'A semantic heading.', ALL_RECIPES, ['text', 'level'], { accessibility: 'required', seo: 'structured' }),
  markdown: blockDefinitionWithMetadata('markdown', 'Rich text', 'Markdown-safe prose.', ALL_RECIPES, ['markdown'], { accessibility: 'required', seo: 'inherited' }),
  image: blockDefinitionWithMetadata('image', 'Image', 'A tenant media asset.', ALL_RECIPES, ['asset_id', 'alt', 'caption']),
  gallery: blockDefinitionWithMetadata('gallery', 'Gallery', 'An ordered media gallery.', ALL_RECIPES, ['asset_ids', 'caption']),
  faq: blockDefinitionWithMetadata('faq', 'FAQ', 'Structured frequently asked questions.', ALL_RECIPES, ['items'], { accessibility: 'required', seo: 'structured' }),
  divider: blockDefinitionWithMetadata('divider', 'Divider', 'A visual section divider.', ALL_RECIPES, [], { accessibility: 'inherited', seo: 'none' }),
  cta: blockDefinitionWithMetadata('cta', 'Call to action', 'A typed call-to-action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  callout: blockDefinitionWithMetadata('callout', 'Callout', 'A highlighted message.', ALL_RECIPES, ['title', 'body', 'tone']),
  hero: blockDefinitionWithMetadata('hero', 'Hero', 'A page hero section.', ALL_RECIPES, ['eyebrow', 'title', 'subtitle', 'asset_id', 'cta_label', 'cta_url'], { accessibility: 'required', seo: 'structured' }),
  button_group: blockDefinitionWithMetadata('button_group', 'Button group', 'A group of typed links.', ALL_RECIPES, ['buttons']),
  feature_grid: blockDefinitionWithMetadata('feature_grid', 'Feature grid', 'A grid of structured features or a configured source.', ALL_RECIPES, ['title', 'items', 'source', 'calculator']),
  testimonial_grid: blockDefinitionWithMetadata('testimonial_grid', 'Testimonials', 'A grid of customer testimonials.', ALL_RECIPES, ['title', 'items']),
  contact_cta: blockDefinitionWithMetadata('contact_cta', 'Contact CTA', 'A contact-focused call to action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  booking_cta: blockDefinitionWithMetadata('booking_cta', 'Booking CTA', 'A booking-focused call to action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  donation_choices: blockDefinitionWithMetadata('donation_choices', 'Donation choices', 'Structured donation options.', ['donate'], ['title', 'description', 'tiers', 'destination']),
  offering_grid: blockDefinitionWithMetadata('offering_grid', 'Offering grid', 'References canonical offerings.', ['home', 'about', 'pricing', 'custom', 'services'], ['title', 'offering_ids']),
  location_grid: blockDefinitionWithMetadata('location_grid', 'Location grid', 'References canonical locations.', ['home', 'about', 'contact', 'custom'], ['title', 'location_ids']),
}

const BLOCK_TYPES = new Set(Object.keys(TENANT_PAGE_BLOCK_REGISTRY))
const LEGACY_BLOCK_TYPE_MAP: Record<string, TenantPageBlockType> = {
  home_hero: 'hero',
  page_hero: 'hero',
  consultation_cta: 'contact_cta',
  contact_cards: 'contact_cta',
  services_intro: 'offering_grid',
  video_feature: 'feature_grid',
  reviews: 'testimonial_grid',
  qa: 'faq',
  disclaimer: 'callout',
  schedule_hero: 'hero',
  schedule_guidance: 'markdown',
  schedule_cta: 'booking_cta',
  schedule_qa: 'faq',
  team: 'feature_grid',
  impact: 'feature_grid',
  pricing_plans: 'offering_grid',
  pricing_calculator: 'feature_grid',
  donation_choices: 'donation_choices',
  donation_support: 'callout',
  legal_meta: 'callout',
  heading: 'heading',
  markdown: 'markdown',
  image: 'image',
  gallery: 'gallery',
  faq: 'faq',
  divider: 'divider',
  cta: 'cta',
  callout: 'callout',
  hero: 'hero',
  button_group: 'button_group',
  feature_grid: 'feature_grid',
  testimonial_grid: 'testimonial_grid',
  contact_cta: 'contact_cta',
  booking_cta: 'booking_cta',
  offering_grid: 'offering_grid',
  location_grid: 'location_grid',
}
const LEGACY_NON_CONTENT_COMPONENT_TYPES = new Set(['latest_articles', 'article_filters'])

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object.')
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string, required = false): string | null {
  if (value == null || value === '') {
    if (required) throw new Error(label + ' is required.')
    return null
  }
  if (typeof value !== 'string') throw new Error(label + ' must be a string.')
  return value.trim()
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function blockDefinitionWithMetadata(
  type: TenantPageBlockType,
  label: string,
  description: string,
  allowedRecipes: readonly string[],
  fields: readonly string[],
  options: Pick<TenantPageBlockDefinition, 'accessibility' | 'seo'> = { accessibility: 'required', seo: 'inherited' },
): TenantPageBlockDefinition {
  return {
    type,
    label,
    description,
    schemaVersion: TENANT_PAGE_SCHEMA_VERSION,
    allowedRecipes,
    fields,
    editor: 'structured-json',
    renderer: { saya: 'tenant-page', blawby: 'tenant-page' },
    ...options,
  }
}

const STRING_FIELDS = new Set([
  'eyebrow', 'title', 'subtitle', 'text', 'markdown', 'alt', 'caption', 'description',
  'label', 'url', 'body', 'tone', 'asset_id', 'cta_label', 'cta_url', 'source',
  'source_url', 'effective_date', 'field', 'section', 'destination', 'legacy_type',
])
const ARRAY_FIELDS = new Set(['asset_ids', 'offering_ids', 'location_ids'])

function validateBlockData(type: TenantPageBlockType, data: Record<string, unknown>): Record<string, unknown> {
  for (const key of STRING_FIELDS) {
    if (data[key] !== undefined && data[key] !== null && typeof data[key] !== 'string') {
      throw new Error(`${type}.${key} must be a string.`)
    }
  }
  for (const key of ARRAY_FIELDS) {
    if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(item => typeof item !== 'string'))) {
      throw new Error(`${type}.${key} must be an array of strings.`)
    }
  }
  if (data.level !== undefined && (!Number.isInteger(data.level) || Number(data.level) < 1 || Number(data.level) > 6)) {
    throw new Error(`${type}.level must be an integer from 1 to 6.`)
  }
  for (const key of ['items', 'buttons', 'tiers']) {
    if (data[key] === undefined) continue
    if (!Array.isArray(data[key]) || data[key].some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error(`${type}.${key} must be an array of objects.`)
    }
  }
  if (type === 'faq' && Array.isArray(data.items)) {
    for (const [index, item] of data.items.entries()) {
      const record = item as Record<string, unknown>
      if (record.question !== undefined && typeof record.question !== 'string') throw new Error(`${type}.items[${index}].question must be a string.`)
      if (record.answer !== undefined && typeof record.answer !== 'string') throw new Error(`${type}.items[${index}].answer must be a string.`)
    }
  }
  return { ...data }
}

export function createTenantPageBlock(type: TenantPageBlockType, data: Record<string, unknown> = {}, position = 0): TenantPageBlock {
  if (!BLOCK_TYPES.has(type)) throw new Error('Unsupported tenant page block type: ' + type)
  return { id: crypto.randomUUID(), type, position, data: { ...data } }
}

export function normalizeTenantPageBlocks(value: unknown): TenantPageBlock[] {
  if (!Array.isArray(value)) throw new Error('blocks must be an array.')
  if (value.length > 50) throw new Error('A page may contain at most 50 blocks.')
  return value.map((rawBlock, index) => {
    const block = asRecord(rawBlock, 'blocks[' + index + ']')
    const type = asString(block.type, 'blocks[' + index + '].type', true) as TenantPageBlockType
    if (!BLOCK_TYPES.has(type)) throw new Error('blocks[' + index + '].type "' + type + '" is not registered.')
    const id = asString(block.id, 'blocks[' + index + '].id') || crypto.randomUUID()
    const data = asRecord(block.data ?? {}, 'blocks[' + index + '].data')
    if (byteLength(data) > 32 * 1024) throw new Error('blocks[' + index + '] exceeds the 32KB payload limit.')
    const normalized = validateBlockData(type, data)
    return { id, type, position: index, data: normalized }
  })
}

export function validateTenantPageSnapshot(value: unknown): TenantPageSnapshot {
  const snapshot = asRecord(value, 'snapshot')
  if (snapshot.schemaVersion !== TENANT_PAGE_SCHEMA_VERSION) throw new Error('snapshot.schemaVersion must be ' + TENANT_PAGE_SCHEMA_VERSION + '.')
  const metadata = asRecord(snapshot.metadata, 'snapshot.metadata')
  const normalizedMetadata: TenantPageSnapshotMetadata = {
    locale: asString(metadata.locale, 'snapshot.metadata.locale', true)!,
    path: normalizeTenantPagePath(asString(metadata.path, 'snapshot.metadata.path', true)!),
    title: asString(metadata.title, 'snapshot.metadata.title', true)!,
    summary: asString(metadata.summary, 'snapshot.metadata.summary'),
    seoTitle: asString(metadata.seoTitle, 'snapshot.metadata.seoTitle'),
    seoDescription: asString(metadata.seoDescription, 'snapshot.metadata.seoDescription'),
    canonicalUrl: asString(metadata.canonicalUrl, 'snapshot.metadata.canonicalUrl'),
    robots: asString(metadata.robots, 'snapshot.metadata.robots'),
    pageType: asString(metadata.pageType, 'snapshot.metadata.pageType', true)!,
    recipe: asString(metadata.recipe, 'snapshot.metadata.recipe'),
  }
  if (normalizedMetadata.canonicalUrl) {
    const canonical = new URL(normalizedMetadata.canonicalUrl)
    if (!['http:', 'https:'].includes(canonical.protocol)) throw new Error('snapshot.metadata.canonicalUrl must use HTTP(S).')
  }
  const blocks = normalizeTenantPageBlocks(snapshot.blocks)
  if (byteLength({ schemaVersion: TENANT_PAGE_SCHEMA_VERSION, metadata: normalizedMetadata, blocks }) > 256 * 1024) {
    throw new Error('The page snapshot exceeds the 256KB payload limit.')
  }
  return { schemaVersion: TENANT_PAGE_SCHEMA_VERSION, metadata: normalizedMetadata, blocks }
}

export function normalizeTenantPagePath(value: string): string {
  const path = value.trim().replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Page paths must be rooted and normalized.')
  if (path.includes('?') || path.includes('#')) throw new Error('Page paths may not contain query strings or fragments.')
  return path
}

export function migrateLegacyComponent(type: string, data: Record<string, unknown>): TenantPageBlock {
  const mappedType = LEGACY_BLOCK_TYPE_MAP[type]
  if (!mappedType) throw new Error('Legacy component type "' + type + '" has no tenant block migration.')
  return createTenantPageBlock(mappedType, { ...data, legacy_type: type })
}

export function migrateLegacyComponents(value: unknown): TenantPageBlock[] {
  if (!Array.isArray(value)) throw new Error('Legacy components must be an array.')
  return value.map((component, index) => {
    const record = asRecord(component, 'legacy components[' + index + ']')
    const type = asString(record.type, 'legacy components[' + index + '].type', true)!
    if (LEGACY_NON_CONTENT_COMPONENT_TYPES.has(type)) return null
    const data = { ...record }
    delete data.type
    return migrateLegacyComponent(type, data)
  }).filter((block): block is TenantPageBlock => block !== null).map((block, index) => ({ ...block, position: index }))
}

export function blockDefinition(type: TenantPageBlockType): TenantPageBlockDefinition {
  return TENANT_PAGE_BLOCK_REGISTRY[type]
}

export function findTenantPageBlock(
  blocks: TenantPageBlock[],
  legacyType: string,
  canonicalType?: TenantPageBlockType,
): Record<string, unknown> | null {
  const block = blocks.find((candidate) =>
    candidate.data.legacy_type === legacyType
    || (canonicalType ? candidate.type === canonicalType : false),
  )
  return block?.data ?? null
}
