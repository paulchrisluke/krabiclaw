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

export type TenantPageType = 'custom' | 'recipe' | 'legal' | 'system'

export interface TenantPageBlock {
  id: string
  type: TenantPageBlockType
  position: number
  data: Record<string, unknown>
  media: TenantPageMedia[]
}

export interface TenantPageMedia {
  asset_id: string
  slot: string
  sort_order?: number
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  alt_text?: string | null
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
  allowedPageTypes: readonly TenantPageType[]
  fields: readonly string[]
  editor: 'typed-fields'
  renderer: { saya: 'tenant-page'; blawby: 'tenant-page' }
  accessibility: 'required' | 'inherited'
  seo: 'structured' | 'inherited' | 'none'
}

const ALL_RECIPES = [
  'custom', 'about', 'pricing', 'donate', 'legal', 'contact', 'schedule', 'home',
  'services', 'privacy', 'terms', 'third-party-notices', 'locations', 'menu', 'order',
  'experiences', 'reservations', 'qa', 'reviews', 'posts', 'photos', 'blog',
] as const

export const TENANT_PAGE_RECIPE_REGISTRY = new Set<string>(ALL_RECIPES)
export const TENANT_PAGE_TYPES: readonly TenantPageType[] = ['custom', 'recipe', 'legal', 'system']

export const TENANT_PAGE_BLOCK_REGISTRY: Record<TenantPageBlockType, TenantPageBlockDefinition> = {
  heading: blockDefinitionWithMetadata('heading', 'Heading', 'A semantic heading.', ALL_RECIPES, ['text', 'level'], { accessibility: 'required', seo: 'structured' }),
  markdown: blockDefinitionWithMetadata('markdown', 'Rich text', 'Markdown-safe prose.', ALL_RECIPES, ['markdown'], { accessibility: 'required', seo: 'inherited' }),
  image: blockDefinitionWithMetadata('image', 'Image', 'A tenant media placement.', ALL_RECIPES, ['alt', 'caption']),
  gallery: blockDefinitionWithMetadata('gallery', 'Gallery', 'An ordered media placement.', ALL_RECIPES, ['caption']),
  faq: blockDefinitionWithMetadata('faq', 'FAQ', 'Structured frequently asked questions.', ALL_RECIPES, ['items'], { accessibility: 'required', seo: 'structured' }),
  divider: blockDefinitionWithMetadata('divider', 'Divider', 'A visual section divider.', ALL_RECIPES, [], { accessibility: 'inherited', seo: 'none' }),
  cta: blockDefinitionWithMetadata('cta', 'Call to action', 'A typed call-to-action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  callout: blockDefinitionWithMetadata('callout', 'Callout', 'A highlighted message.', ALL_RECIPES, ['title', 'body', 'tone']),
  hero: blockDefinitionWithMetadata('hero', 'Hero', 'A page hero section.', ALL_RECIPES, ['eyebrow', 'title', 'subtitle', 'cta_label', 'cta_url'], { accessibility: 'required', seo: 'structured' }),
  button_group: blockDefinitionWithMetadata('button_group', 'Button group', 'A group of typed links.', ALL_RECIPES, ['buttons']),
  feature_grid: blockDefinitionWithMetadata('feature_grid', 'Feature grid', 'A grid of structured features or a configured source.', ALL_RECIPES, ['title', 'items', 'source', 'calculator']),
  testimonial_grid: blockDefinitionWithMetadata('testimonial_grid', 'Testimonials', 'A grid of customer testimonials.', ALL_RECIPES, ['title', 'items']),
  contact_cta: blockDefinitionWithMetadata('contact_cta', 'Contact CTA', 'A contact-focused call to action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  booking_cta: blockDefinitionWithMetadata('booking_cta', 'Booking CTA', 'A booking-focused call to action.', ALL_RECIPES, ['title', 'description', 'label', 'url']),
  donation_choices: blockDefinitionWithMetadata('donation_choices', 'Donation choices', 'Structured donation options.', ['donate'], ['title', 'description', 'tiers', 'destination'], { allowedPageTypes: ['recipe'] }),
  offering_grid: blockDefinitionWithMetadata('offering_grid', 'Offering grid', 'References canonical offerings.', ['home', 'about', 'pricing', 'custom', 'services'], ['title', 'offering_ids'], { allowedPageTypes: ['custom', 'recipe', 'system'] }),
  location_grid: blockDefinitionWithMetadata('location_grid', 'Location grid', 'References canonical locations.', ['home', 'about', 'contact', 'custom'], ['title', 'location_ids'], { allowedPageTypes: ['custom', 'recipe', 'system'] }),
}

const BLOCK_TYPES = new Set(Object.keys(TENANT_PAGE_BLOCK_REGISTRY))
const EMBEDDED_MEDIA_FIELDS = new Set(['asset_id', 'asset_ids', 'image_url', 'public_url', 'thumbnail_url', 'media'])

export function assertNoEmbeddedMediaFields(value: unknown, path = 'data'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoEmbeddedMediaFields(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (EMBEDDED_MEDIA_FIELDS.has(key)) throw new Error(`${path}.${key} must use the block media array.`)
    assertNoEmbeddedMediaFields(item, `${path}.${key}`)
  }
}

export function isTenantPageBlockAllowed(
  definitionOrType: TenantPageBlockDefinition | TenantPageBlockType,
  recipe: string | null | undefined,
  pageType: TenantPageType,
): boolean {
  const definition = typeof definitionOrType === 'string'
    ? TENANT_PAGE_BLOCK_REGISTRY[definitionOrType]
    : definitionOrType
  const normalizedRecipe = recipe?.trim().toLowerCase() || 'custom'
  return Boolean(definition)
    && definition.allowedRecipes.includes(normalizedRecipe)
    && definition.allowedPageTypes.includes(pageType)
}

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
  options: Partial<Pick<TenantPageBlockDefinition, 'accessibility' | 'seo' | 'allowedPageTypes'>> = {},
): TenantPageBlockDefinition {
  return {
    type,
    label,
    description,
    schemaVersion: TENANT_PAGE_SCHEMA_VERSION,
    allowedRecipes,
    allowedPageTypes: options.allowedPageTypes ?? TENANT_PAGE_TYPES,
    fields,
    editor: 'typed-fields',
    renderer: { saya: 'tenant-page', blawby: 'tenant-page' },
    accessibility: options.accessibility ?? 'required',
    seo: options.seo ?? 'inherited',
  }
}

const STRING_FIELDS = new Set([
  'eyebrow', 'title', 'subtitle', 'text', 'markdown', 'alt', 'caption', 'description',
  'label', 'url', 'body', 'tone', 'cta_label', 'cta_url', 'source',
  'source_url', 'effective_date', 'field', 'section', 'destination', 'legacy_type',
])
const ARRAY_FIELDS = new Set(['offering_ids', 'location_ids'])

function validateBlockData(type: TenantPageBlockType, data: Record<string, unknown>): Record<string, unknown> {
  assertNoEmbeddedMediaFields(data, type)
  if (type === 'image' && 'url' in data) throw new Error('image.url must use the block media array.')
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
  return { id: crypto.randomUUID(), type, position, data: { ...data }, media: [] }
}

const TRANSLATABLE_DATA_FIELDS = new Set([
  'alt', 'answer', 'body', 'caption', 'copy_label', 'description', 'eyebrow', 'heading',
  'intro', 'label', 'markdown', 'name', 'note', 'prompt', 'question', 'short_description',
  'subtitle', 'summary', 'text', 'title', 'cta_label',
])

function clearTenantPageTranslationText(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return TRANSLATABLE_DATA_FIELDS.has(key) ? '' : value
  if (Array.isArray(value)) return value.map(item => clearTenantPageTranslationText(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([childKey, childValue]) => [childKey, clearTenantPageTranslationText(childValue, childKey)]))
}

export function createTenantPageTranslationBlocks(blocks: readonly TenantPageBlock[]): TenantPageBlock[] {
  const ids = new Map(blocks.map(block => [block.id, crypto.randomUUID()]))
  return blocks.map((block, position) => ({
    ...block,
    id: ids.get(block.id)!,
    position,
    data: clearTenantPageTranslationText(structuredClone(block.data)) as Record<string, unknown>,
    media: block.media.map(item => ({ ...item, alt_text: null })),
  }))
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
    const media = block.media === undefined ? [] : block.media
    if (!Array.isArray(media)) throw new Error('blocks[' + index + '].media must be an array.')
    const normalizedMedia = media.map((rawMedia, mediaIndex) => {
      const item = asRecord(rawMedia, `blocks[${index}].media[${mediaIndex}]`)
      const assetId = asString(item.asset_id, `blocks[${index}].media[${mediaIndex}].asset_id`, true)!
      const slot = asString(item.slot, `blocks[${index}].media[${mediaIndex}].slot`, true)!
      return { asset_id: assetId, slot, sort_order: mediaIndex }
    })
    const canonicalSlot = type === 'gallery' ? 'gallery' : type === 'hero' || type === 'image' ? 'media' : null
    if (canonicalSlot && normalizedMedia.some(item => item.slot !== canonicalSlot)) {
      throw new Error(`blocks[${index}].media must use the ${canonicalSlot} slot for ${type} blocks.`)
    }
    if (canonicalSlot) {
      // Pre-migration image/gallery blocks stored the asset directly on `data`.
      // Surface that as a specific, actionable error instead of the generic
      // "requires at least one asset" message, which doesn't say why one is missing.
      if (data.url !== undefined) throw new Error(`${type}.url must use the block media array.`)
      if (data.asset_id !== undefined) throw new Error(`${type}.asset_id must use the block media array.`)
    }
    if ((type === 'image' || type === 'gallery') && normalizedMedia.length === 0) {
      throw new Error(`blocks[${index}].media requires at least one asset for ${type} blocks.`)
    }
    if (byteLength(data) > 32 * 1024) throw new Error('blocks[' + index + '] exceeds the 32KB payload limit.')
    const normalized = validateBlockData(type, data)
    return { id, type, position: index, data: normalized, media: normalizedMedia }
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
  return block ? { ...block.data, media: block.media } : null
}
