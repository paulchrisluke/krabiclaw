import slugify from 'slugify'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { BLOG_CATEGORY_LABELS } from '~/utils/blog-categories'

const BLOG_TITLE_MAX = 200
const BLOG_BODY_MAX = 100000
const BLOG_EXCERPT_MAX = 500
const BLOG_CATEGORY_MAX = 100
const BLOG_SEO_DESCRIPTION_MAX = 500
const BLOG_SEO_KEYWORDS_MAX = 500
const DOC_TITLE_MAX = 200
const DOC_BODY_MAX = 100000
const DOC_EXCERPT_MAX = 500
const DOC_SEO_DESCRIPTION_MAX = 500
const DOC_SEO_KEYWORDS_MAX = 500
const FAQ_MAX_ITEMS = 20
const FAQ_ANSWER_MAX = 1000
const HOW_TO_MIN_STEPS = 2
const HOW_TO_MAX_STEPS = 30
const HOW_TO_ESTIMATED_TIME_MAX = 200
const COMPONENT_LABEL_MAX = 200
const MAX_SLUG_ATTEMPTS = 8

export const PLATFORM_DOC_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] as const
export const PLATFORM_BLOG_CATEGORIES = BLOG_CATEGORY_LABELS
export const PLATFORM_DOC_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const

export type PlatformContentType = 'blog_post' | 'doc'
export type PlatformContentComponentType = 'faq' | 'how_to'
export type PlatformContentComponentStatus = 'active' | 'inactive'
export type PlatformRobotsDirective = 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow'

export const PLATFORM_CONTENT_COMPONENT_TYPES: readonly PlatformContentComponentType[] = ['faq', 'how_to']
export const PLATFORM_COMPONENT_STATUSES: readonly PlatformContentComponentStatus[] = ['active', 'inactive']
export const PLATFORM_ROBOTS_DIRECTIVES: readonly PlatformRobotsDirective[] = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']

export interface PlatformFaqItemInput {
  question: string
  answer: string
  position?: number | null
}

export interface PlatformHowToStepInput {
  name: string
  text: string
  image_asset_id?: string | null
  url?: string | null
  position?: number | null
}

export interface PlatformComponentMetadataInput {
  label?: string | null
  status?: PlatformContentComponentStatus | null
  render_enabled?: boolean
  schema_enabled?: boolean
  position?: number | null
}

export interface PlatformFaqComponentData {
  items: Array<Required<Pick<PlatformFaqItemInput, 'question' | 'answer'>> & { position: number }>
}

export interface PlatformHowToComponentData {
  steps: Array<Required<Pick<PlatformHowToStepInput, 'name' | 'text'>> & {
    position: number
    image_asset_id?: string | null
    url?: string | null
    image_public_url?: string | null
    image_kind?: string | null
    image_width?: number | null
    image_height?: number | null
  }>
  estimated_time?: string | null
  tool_items?: string[]
  supply_items?: string[]
}

export interface PlatformContentComponent extends Required<Pick<PlatformComponentMetadataInput, 'position'>> {
  id: string
  content_type: PlatformContentType
  content_id: string
  type: PlatformContentComponentType
  label: string | null
  status: PlatformContentComponentStatus
  render_enabled: boolean
  schema_enabled: boolean
  data: PlatformFaqComponentData | PlatformHowToComponentData
  created_at: string
  updated_at: string
}

export interface PlatformContentComponentInput extends PlatformComponentMetadataInput {
  type: PlatformContentComponentType
  data: unknown
}

export interface PlatformStructuredContentInput {
  faq_items?: PlatformFaqItemInput[]
  faq_label?: string | null
  faq_status?: PlatformContentComponentStatus | null
  faq_render_enabled?: boolean
  faq_schema_enabled?: boolean
  how_to_steps?: PlatformHowToStepInput[]
  how_to_estimated_time?: string | null
  how_to_tool_items?: string[]
  how_to_supply_items?: string[]
  how_to_label?: string | null
  how_to_status?: PlatformContentComponentStatus | null
  how_to_render_enabled?: boolean
  how_to_schema_enabled?: boolean
  components?: PlatformContentComponentInput[]
}

export interface BlogScope {
  site_id?: string | null
  organization_id?: string | null
}

export interface PlatformBlogCreateInput extends PlatformStructuredContentInput {
  title: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  publish?: boolean
}

export interface PlatformBlogUpdateInput extends PlatformStructuredContentInput {
  title?: string
  body?: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  publish?: boolean
  unpublish?: boolean
}

export interface PlatformDocCreateInput extends PlatformStructuredContentInput {
  title: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  difficulty_level?: string | null
  sort_order?: number | null
  parent_doc_id?: string | null
  featured_image_asset_id?: string | null
  publish?: boolean
}

export interface PlatformDocUpdateInput extends PlatformStructuredContentInput {
  title?: string
  body?: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  difficulty_level?: string | null
  sort_order?: number | null
  parent_doc_id?: string | null
  featured_image_asset_id?: string | null
  publish?: boolean
  unpublish?: boolean
}

interface PlatformContentComponentRow {
  id: string
  content_type: PlatformContentType
  content_id: string
  type: PlatformContentComponentType
  position: number
  label: string | null
  status: PlatformContentComponentStatus
  render_enabled: number
  schema_enabled: number
  data_json: string
  created_at: string
  updated_at: string
}

interface PlatformMediaAssetRow {
  id: string
  public_url: string | null
  kind: string | null
  width: number | null
  height: number | null
}

interface PlatformComponentReplacement extends PlatformComponentMetadataInput {
  type: PlatformContentComponentType
  data: PlatformFaqComponentData | PlatformHowToComponentData
}

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw createError({ statusCode: 404, statusMessage: message })
}

// Lets every blog/doc tool accept either the row id or its public slug, so a
// model (or person) holding only a public URL doesn't need a separate
// list-then-match step before it can get/update/publish/delete a post or doc.
async function resolvePlatformContentId(
  db: DbClient,
  table: 'blog_posts' | 'platform_docs',
  identifier: string,
  notFoundMessage: string,
  siteId: string | null = null,
): Promise<string> {
  const scope = table === 'blog_posts' ? (siteId ? ' AND site_id = ?' : ' AND site_id IS NULL') : ''
  const scopeParams = table === 'blog_posts' && siteId ? [siteId] : []
  const byId = await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE id = ?${scope} LIMIT 1`, [identifier, ...scopeParams])
  const bySlug = await queryFirst<{ id: string }>(db, `SELECT id FROM ${table} WHERE slug = ?${scope} LIMIT 1`, [identifier, ...scopeParams])
  if (byId && bySlug && byId.id !== bySlug.id) {
    badRequest('Ambiguous platform content identifier; use the row id.')
  }
  const row = byId ?? bySlug
  if (!row) notFound(notFoundMessage)
  return row.id
}

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function normalizeSlugFromTitle(title: string, fallbackPrefix: 'post' | 'doc') {
  const slug = slugify(title, { lower: true, strict: true, trim: true })
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function isUniqueConstraintError(err: unknown, table: 'blog_posts' | 'platform_docs') {
  const message = String((err as ApiValue)?.message || err || '')
  return message.includes(`${table}.slug`) || message.includes('UNIQUE constraint failed')
}

function assertStringLength(value: string | null | undefined, max: number, field: string) {
  if (value != null && value.length > max) {
    badRequest(`${field} exceeds maximum length (${max})`)
  }
}

function assertValidRobotsDirective(value: string | null | undefined) {
  if (value == null) return
  if (!PLATFORM_ROBOTS_DIRECTIVES.includes(value as PlatformRobotsDirective)) {
    badRequest(`robots must be one of: ${PLATFORM_ROBOTS_DIRECTIVES.join(', ')}`)
  }
}

function assertValidBlogCategory(value: string | null | undefined) {
  if (value == null || value === '') return
  if (!PLATFORM_BLOG_CATEGORIES.includes(value)) {
    badRequest(`category must be one of: ${PLATFORM_BLOG_CATEGORIES.join(', ')}`)
  }
}

function assertPublishableBlogCategory(value: string | null | undefined) {
  if (!value) badRequest('category is required when publishing a blog post')
  assertValidBlogCategory(value)
}

function assertValidCanonicalUrl(value: string | null | undefined) {
  if (value == null || value === '') return
  try {
    void new URL(value)
  } catch {
    badRequest('canonical_url must be an absolute URL')
  }
}

function assertValidComponentType(type: string): PlatformContentComponentType {
  if (!PLATFORM_CONTENT_COMPONENT_TYPES.includes(type as PlatformContentComponentType)) {
    badRequest(`component type must be one of: ${PLATFORM_CONTENT_COMPONENT_TYPES.join(', ')}`)
  }
  return type as PlatformContentComponentType
}

function assertValidComponentStatus(value: string | null | undefined, field: string): PlatformContentComponentStatus | undefined {
  if (value == null) return undefined
  if (!PLATFORM_COMPONENT_STATUSES.includes(value as PlatformContentComponentStatus)) {
    badRequest(`${field} must be one of: ${PLATFORM_COMPONENT_STATUSES.join(', ')}`)
  }
  return value as PlatformContentComponentStatus
}

function asRecord(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest(`${field} must be an object`)
  return value as Record<string, unknown>
}

function asString(value: unknown, field: string) {
  if (typeof value !== 'string') badRequest(`${field} must be a string`)
  return value
}

function isStructuredConvenienceFieldDefined(input: PlatformStructuredContentInput) {
  return input.faq_items !== undefined
    || input.faq_label !== undefined
    || input.faq_status !== undefined
    || input.faq_render_enabled !== undefined
    || input.faq_schema_enabled !== undefined
    || input.how_to_steps !== undefined
    || input.how_to_estimated_time !== undefined
    || input.how_to_tool_items !== undefined
    || input.how_to_supply_items !== undefined
    || input.how_to_label !== undefined
    || input.how_to_status !== undefined
    || input.how_to_render_enabled !== undefined
    || input.how_to_schema_enabled !== undefined
}

function normalizeStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) badRequest(`${field} must be an array`)
  return value
    .map((item, index) => {
      if (typeof item !== 'string') badRequest(`${field}[${index}] must be a string`)
      const trimmed = item.trim()
      return trimmed || null
    })
    .filter((item): item is string => Boolean(item))
}

function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position)
}

function normalizeFaqItems(items: PlatformFaqItemInput[]) {
  if (!Array.isArray(items)) badRequest('faq_items must be an array')
  if (items.length > FAQ_MAX_ITEMS) badRequest(`faq_items cannot exceed ${FAQ_MAX_ITEMS} items`)

  const normalized = items.map((item, index) => {
    if (item === null || typeof item !== 'object') {
      badRequest(`faq_items[${index}] must be an object`)
    }
    const question = item.question?.trim()
    const answer = item.answer?.trim()
    if (!question) badRequest(`faq_items[${index}].question is required`)
    if (!answer) badRequest(`faq_items[${index}].answer is required`)
    assertStringLength(answer, FAQ_ANSWER_MAX, `faq_items[${index}].answer`)
    return {
      question,
      answer,
      position: typeof item.position === 'number' ? item.position : index,
    }
  })

  return sortByPosition(normalized)
}

async function normalizeHowToSteps(db: D1Database, steps: PlatformHowToStepInput[]) {
  if (!Array.isArray(steps)) badRequest('how_to_steps must be an array')
  if (steps.length > 0 && steps.length < HOW_TO_MIN_STEPS) {
    badRequest(`how_to_steps must include at least ${HOW_TO_MIN_STEPS} steps`)
  }
  if (steps.length > HOW_TO_MAX_STEPS) badRequest(`how_to_steps cannot exceed ${HOW_TO_MAX_STEPS} steps`)

  const normalizedSteps: PlatformHowToComponentData['steps'] = []
  for (const [index, step] of steps.entries()) {
    if (step === null || typeof step !== 'object') {
      badRequest(`how_to_steps[${index}] must be an object`)
    }
    const name = step.name?.trim()
    const text = step.text?.trim()
    if (!name) badRequest(`how_to_steps[${index}].name is required`)
    if (!text) badRequest(`how_to_steps[${index}].text is required`)
    const imageAssetId = step.image_asset_id?.trim() || null
    if (imageAssetId) await ensureMediaAssetExists(db, imageAssetId, `how_to_steps[${index}].image_asset_id`)
    const url = step.url?.trim() || null
    if (url) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          badRequest(`how_to_steps[${index}].url must use http or https scheme`)
        }
      } catch {
        badRequest(`how_to_steps[${index}].url is not a valid URL`)
      }
    }
    normalizedSteps.push({
      name,
      text,
      image_asset_id: imageAssetId,
      url,
      position: typeof step.position === 'number' ? step.position : index,
    })
  }
  return sortByPosition(normalizedSteps)
}

function normalizeHowToExtras(
  extras: {
    estimated_time?: string | null
    tool_items?: unknown
    supply_items?: unknown
  },
  existing?: PlatformHowToComponentData | null,
) {
  const estimatedTime = extras.estimated_time !== undefined
    ? (extras.estimated_time?.trim() || null)
    : (existing?.estimated_time ?? null)
  assertStringLength(estimatedTime, HOW_TO_ESTIMATED_TIME_MAX, 'how_to_estimated_time')

  const toolItems = extras.tool_items !== undefined
    ? normalizeStringArray(extras.tool_items, 'how_to_tool_items')
    : existing?.tool_items
  const supplyItems = extras.supply_items !== undefined
    ? normalizeStringArray(extras.supply_items, 'how_to_supply_items')
    : existing?.supply_items

  return {
    estimated_time: estimatedTime,
    tool_items: toolItems,
    supply_items: supplyItems,
  }
}

function validateFaqComponent(value: unknown): PlatformFaqComponentData {
  const record = asRecord(value, 'faq component data')
  const rawItems = record.items
  if (!Array.isArray(rawItems)) badRequest('faq component data.items must be an array')

  const items = rawItems.map((item, index) => {
    const entry = asRecord(item, `faq item ${index}`)
    const question = asString(entry.question, `faq item ${index} question`).trim()
    const answer = asString(entry.answer, `faq item ${index} answer`).trim()
    const position = typeof entry.position === 'number' ? entry.position : index
    if (!question || !answer) badRequest(`faq item ${index} is missing question or answer`)
    assertStringLength(answer, FAQ_ANSWER_MAX, `faq item ${index} answer`)
    return { question, answer, position }
  })

  if (items.length > FAQ_MAX_ITEMS) badRequest(`faq component cannot exceed ${FAQ_MAX_ITEMS} items`)
  return { items: sortByPosition(items) }
}

function validateHowToComponent(value: unknown): PlatformHowToComponentData {
  const record = asRecord(value, 'how_to component data')
  const rawSteps = record.steps
  if (!Array.isArray(rawSteps)) badRequest('how_to component data.steps must be an array')
  if (rawSteps.length < HOW_TO_MIN_STEPS) badRequest(`how_to component must include at least ${HOW_TO_MIN_STEPS} steps`)
  if (rawSteps.length > HOW_TO_MAX_STEPS) badRequest(`how_to component cannot exceed ${HOW_TO_MAX_STEPS} steps`)

  const steps = rawSteps.map((step, index) => {
    const entry = asRecord(step, `how_to step ${index}`)
    const name = asString(entry.name, `how_to step ${index} name`).trim()
    const text = asString(entry.text, `how_to step ${index} text`).trim()
    if (!name || !text) badRequest(`how_to step ${index} is missing name or text`)
    return {
      name,
      text,
      image_asset_id: typeof entry.image_asset_id === 'string' ? entry.image_asset_id : null,
      url: typeof entry.url === 'string' ? entry.url : null,
      position: typeof entry.position === 'number' ? entry.position : index,
    }
  })

  const estimatedTime = typeof record.estimated_time === 'string' ? record.estimated_time.trim() : null
  assertStringLength(estimatedTime, HOW_TO_ESTIMATED_TIME_MAX, 'how_to estimated_time')

  return {
    steps: sortByPosition(steps),
    estimated_time: estimatedTime || null,
    tool_items: Array.isArray(record.tool_items) ? normalizeStringArray(record.tool_items, 'how_to tool_items') : undefined,
    supply_items: Array.isArray(record.supply_items) ? normalizeStringArray(record.supply_items, 'how_to supply_items') : undefined,
  }
}

function parsePlatformComponent(row: PlatformContentComponentRow): PlatformContentComponent {
  const parsed = JSON.parse(row.data_json) as unknown
  const data = row.type === 'faq' ? validateFaqComponent(parsed) : validateHowToComponent(parsed)
  return {
    id: row.id,
    content_type: row.content_type,
    content_id: row.content_id,
    type: row.type,
    position: row.position,
    label: row.label,
    status: row.status,
    render_enabled: Boolean(row.render_enabled),
    schema_enabled: Boolean(row.schema_enabled),
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function normalizeComponentMetadata(
  type: PlatformContentComponentType,
  metadata: PlatformComponentMetadataInput,
  previous?: PlatformContentComponent | null,
): PlatformComponentMetadataInput {
  const fieldPrefix = `${type} component`
  const label = metadata.label !== undefined ? (metadata.label?.trim() || null) : previous?.label
  assertStringLength(label, COMPONENT_LABEL_MAX, `${fieldPrefix} label`)

  return {
    label,
    status: metadata.status !== undefined
      ? assertValidComponentStatus(metadata.status, `${fieldPrefix} status`)
      : previous?.status,
    render_enabled: metadata.render_enabled !== undefined ? metadata.render_enabled : previous?.render_enabled,
    schema_enabled: metadata.schema_enabled !== undefined ? metadata.schema_enabled : previous?.schema_enabled,
    position: metadata.position !== undefined ? metadata.position : previous?.position,
  }
}

async function normalizeFullComponents(
  db: D1Database,
  components: PlatformContentComponentInput[],
) {
  if (!Array.isArray(components)) badRequest('components must be an array')

  const normalized: PlatformComponentReplacement[] = []
  const seen = new Set<PlatformContentComponentType>()

  for (const [index, component] of components.entries()) {
    const type = assertValidComponentType(component.type)
    if (seen.has(type)) badRequest(`components cannot include duplicate ${type} entries`)
    seen.add(type)

    const metadata = normalizeComponentMetadata(type, component)
    const position = typeof metadata.position === 'number' ? metadata.position : index

    if (type === 'faq') {
      const data = validateFaqComponent(component.data)
      normalized.push({ type, data, ...metadata, position })
      continue
    }

    const data = validateHowToComponent(component.data)
    for (const [stepIndex, step] of data.steps.entries()) {
      if (step.image_asset_id) await ensureMediaAssetExists(db, step.image_asset_id, `components[${index}].data.steps[${stepIndex}].image_asset_id`)
    }
    normalized.push({ type, data, ...metadata, position })
  }

  return sortByPosition(normalized.map(component => ({
    ...component,
    position: typeof component.position === 'number' ? component.position : 0,
  })))
}

async function ensureMediaAssetExists(db: D1Database, assetId: string, field = 'featured_image_asset_id') {
  const asset = await queryFirst(db, 'SELECT id FROM media_assets WHERE id = ? AND status = ? LIMIT 1', [assetId, 'active'])
  if (!asset) badRequest(`${field} not found or not active`)
}

async function ensureBlogFeaturedImageAssetExists(
  db: D1Database,
  assetId: string,
  field = 'featured_image_asset_id',
  siteId: string | null = null,
) {
  const conditions = ['id = ?', 'status = ?', 'kind = ?']
  const params: ApiValue[] = [assetId, 'active', 'image']
  if (siteId) {
    conditions.push('site_id = ?')
    params.push(siteId)
  }

  const asset = await queryFirst(db, `SELECT id FROM media_assets WHERE ${conditions.join(' AND ')} LIMIT 1`, params)
  if (!asset) {
    badRequest(siteId ? `${field} must reference an active image asset from this site` : `${field} must reference an active image asset`)
  }
}

async function ensureDocParentExists(db: D1Database, docId: string) {
  const doc = await queryFirst(db, 'SELECT id FROM platform_docs WHERE id = ? LIMIT 1', [docId])
  if (!doc) badRequest('parent_doc_id not found')
}

async function syncStructuredContent(
  db: D1Database,
  contentType: PlatformContentType,
  contentId: string,
  input: PlatformStructuredContentInput,
) {
  const hasConvenienceFields = isStructuredConvenienceFieldDefined(input)
  if (input.components !== undefined && hasConvenienceFields) {
    badRequest('Use either components or convenience structured-content fields, not both')
  }

  if (input.components !== undefined) {
    const replacements = await normalizeFullComponents(db, input.components)
    await replaceContentComponents(db, contentType, contentId, replacements)
    return
  }

  if (!hasConvenienceFields) return

  const existing = await listContentComponents(db, contentType, contentId)
  const byType = new Map<PlatformContentComponentType, PlatformContentComponent>(existing.map(component => [component.type, component]))
  const replacements: PlatformComponentReplacement[] = []

  const faqTouched = input.faq_items !== undefined
    || input.faq_label !== undefined
    || input.faq_status !== undefined
    || input.faq_render_enabled !== undefined
    || input.faq_schema_enabled !== undefined
  const howToTouched = input.how_to_steps !== undefined
    || input.how_to_estimated_time !== undefined
    || input.how_to_tool_items !== undefined
    || input.how_to_supply_items !== undefined
    || input.how_to_label !== undefined
    || input.how_to_status !== undefined
    || input.how_to_render_enabled !== undefined
    || input.how_to_schema_enabled !== undefined

  const existingFaq = byType.get('faq') ?? null
  const existingHowTo = byType.get('how_to') ?? null

  if (faqTouched) {
    if (input.faq_items !== undefined && input.faq_items.length === 0) {
      // delete faq component intentionally
    } else {
      let faqData: PlatformFaqComponentData | null = null
      if (input.faq_items !== undefined) {
        faqData = { items: normalizeFaqItems(input.faq_items) }
      } else if (existingFaq) {
        faqData = existingFaq.data as PlatformFaqComponentData
      } else {
        badRequest('faq_items are required before FAQ metadata can be set')
      }

      replacements.push({
        type: 'faq',
        data: faqData,
        ...normalizeComponentMetadata('faq', {
          label: input.faq_label,
          status: input.faq_status,
          render_enabled: input.faq_render_enabled,
          schema_enabled: input.faq_schema_enabled,
        }, existingFaq),
      })
    }
  } else if (existingFaq) {
    replacements.push({
      type: 'faq',
      data: existingFaq.data as PlatformFaqComponentData,
      ...normalizeComponentMetadata('faq', {}, existingFaq),
    })
  }

  if (howToTouched) {
    if (input.how_to_steps !== undefined && input.how_to_steps.length === 0) {
      // delete how-to component intentionally
    } else {
      const existingData = existingHowTo?.data as PlatformHowToComponentData | undefined
      let steps: PlatformHowToComponentData['steps'] | null = null
      if (input.how_to_steps !== undefined) {
        steps = await normalizeHowToSteps(db, input.how_to_steps)
      } else if (existingData?.steps) {
        steps = existingData.steps
      } else {
        badRequest('how_to_steps are required before How-To metadata can be set')
      }

      const extras = normalizeHowToExtras({
        estimated_time: input.how_to_estimated_time,
        tool_items: input.how_to_tool_items,
        supply_items: input.how_to_supply_items,
      }, existingData ?? null)

      replacements.push({
        type: 'how_to',
        data: {
          steps,
          estimated_time: extras.estimated_time,
          tool_items: extras.tool_items,
          supply_items: extras.supply_items,
        },
        ...normalizeComponentMetadata('how_to', {
          label: input.how_to_label,
          status: input.how_to_status,
          render_enabled: input.how_to_render_enabled,
          schema_enabled: input.how_to_schema_enabled,
        }, existingHowTo),
      })
    }
  } else if (existingHowTo) {
    replacements.push({
      type: 'how_to',
      data: existingHowTo.data as PlatformHowToComponentData,
      ...normalizeComponentMetadata('how_to', {}, existingHowTo),
    })
  }

  await replaceContentComponents(db, contentType, contentId, replacements)
}

function attachComponents<T extends Record<string, unknown>>(record: T, components: PlatformContentComponent[]) {
  return {
    ...record,
    components,
  }
}

function attachPublished(record: ApiRecord, published: boolean) {
  return {
    ...record,
    published,
  }
}

/**
 * Collapses the flat featured_image_public_url/kind/width/height columns
 * (produced by the LEFT JOIN ... media_assets aliasing) into the canonical
 * nested `featured_image` read shape. Keeps featured_image_asset_id as the
 * top-level write-side reference field.
 */
export function attachFeaturedImage(record: ApiRecord) {
  const {
    featured_image_public_url: publicUrl,
    featured_image_kind: kind,
    featured_image_width: width,
    featured_image_height: height,
    ...rest
  } = record

  return {
    ...rest,
    featured_image: {
      asset_id: record.featured_image_asset_id ?? null,
      public_url: publicUrl ?? null,
      kind: kind ?? null,
      width: width ?? null,
      height: height ?? null,
    },
  }
}

/**
 * Same as attachFeaturedImage, but reads from a flat media_assets join that
 * uses bare `public_url`/`kind`/`width`/`height` column aliases (the shape
 * used by the public blog/docs read APIs) instead of the
 * featured_image_-prefixed aliases used by the admin/MCP service layer.
 */
export function attachFeaturedImageFromBareJoin(record: ApiRecord) {
  const { public_url: publicUrl, kind, width, height, featured_image_asset_id: assetId, ...rest } = record

  return {
    ...rest,
    featured_image_asset_id: assetId ?? null,
    featured_image: {
      asset_id: assetId ?? null,
      public_url: publicUrl ?? null,
      kind: kind ?? null,
      width: width ?? null,
      height: height ?? null,
    },
  }
}

function normalizeBlankToNull(input: { canonical_url?: string | null; robots?: string | null }) {
  if (input.canonical_url !== undefined && input.canonical_url?.trim() === '') input.canonical_url = null
  if (input.robots !== undefined && input.robots?.trim() === '') input.robots = null
}

// The fixed PLATFORM_BLOG_CATEGORIES taxonomy (Marketing, SEO, ...) only makes sense
// for KrabiClaw's own marketing blog — a tenant restaurant's blog category is free text.
function validateBlogCommon(input: Partial<PlatformBlogCreateInput>, isTenant = false) {
  normalizeBlankToNull(input)
  if (input.title !== undefined) assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
  if (input.body !== undefined) assertStringLength(input.body, BLOG_BODY_MAX, 'body')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
  if (input.category !== undefined) {
    assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')
    if (!isTenant) assertValidBlogCategory(input.category ?? null)
  }
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, BLOG_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, BLOG_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  if (input.robots !== undefined) assertValidRobotsDirective(input.robots)
}

function validateDocCommon(input: Partial<PlatformDocCreateInput>) {
  normalizeBlankToNull(input)
  if (input.title !== undefined) assertStringLength(input.title, DOC_TITLE_MAX, 'title')
  if (input.body !== undefined) assertStringLength(input.body, DOC_BODY_MAX, 'body')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, DOC_EXCERPT_MAX, 'excerpt')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, DOC_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, DOC_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  if (input.robots !== undefined) assertValidRobotsDirective(input.robots)
  if (input.category && !PLATFORM_DOC_CATEGORIES.includes(input.category as (typeof PLATFORM_DOC_CATEGORIES)[number])) {
    badRequest(`invalid category. Must be one of: ${PLATFORM_DOC_CATEGORIES.join(', ')}`)
  }
  if (input.difficulty_level && !PLATFORM_DOC_DIFFICULTIES.includes(input.difficulty_level as (typeof PLATFORM_DOC_DIFFICULTIES)[number])) {
    badRequest(`invalid difficulty_level. Must be one of: ${PLATFORM_DOC_DIFFICULTIES.join(', ')}`)
  }
}

export async function listContentComponents(
  db: DbClient,
  contentType: PlatformContentType,
  contentId: string,
  options: { activeOnly?: boolean } = {},
) {
  let sql = `SELECT id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at
     FROM platform_content_components
     WHERE content_type = ? AND content_id = ?`
  if (options.activeOnly) sql += " AND status = 'active'"
  sql += ' ORDER BY position ASC, created_at ASC'

  const results = await queryAll<PlatformContentComponentRow>(db, sql, [contentType, contentId])

  return (results ?? []).map(parsePlatformComponent)
}

export async function replaceContentComponents(
  db: D1Database,
  contentType: PlatformContentType,
  contentId: string,
  components: PlatformComponentReplacement[],
) {
  const queries: { query: string; params: unknown[] }[] = [
    {
      query: 'DELETE FROM platform_content_components WHERE content_type = ? AND content_id = ?',
      params: [contentType, contentId],
    },
  ]

  if (!components.length) {
    // Atomic even for the single-statement case — matches the original db.batch([deleteStmt]) call.
    await executeBatch(db, queries)
    return
  }

  const now = new Date().toISOString()
  const sortedComponents = sortByPosition(components.map((component, index) => ({
    ...component,
    position: typeof component.position === 'number' ? component.position : index,
  })))

  for (const [index, component] of sortedComponents.entries()) {
    assertValidComponentType(component.type)
    const status = assertValidComponentStatus(component.status ?? 'active', `${component.type} status`) ?? 'active'
    queries.push({
      query: `INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        contentType,
        contentId,
        component.type,
        typeof component.position === 'number' ? component.position : index,
        component.label ?? null,
        status,
        component.render_enabled === false ? 0 : 1,
        component.schema_enabled === false ? 0 : 1,
        JSON.stringify(component.data),
        now,
        now,
      ],
    })
  }

  // Delete-then-insert must commit atomically (executeBatch -> D1Database.batch()),
  // not sequential execute() calls — a partial failure here must not leave the
  // old components deleted with no replacement rows written.
  await executeBatch(db, queries)
}

export async function resolveContentComponentsMedia(db: DbClient, components: PlatformContentComponent[]) {
  const assetIds = Array.from(new Set(
    components.flatMap(component => component.type === 'how_to'
      ? (component.data as PlatformHowToComponentData).steps.map(step => step.image_asset_id).filter((value): value is string => Boolean(value))
      : [])
  ))

  if (!assetIds.length) return components

  const placeholders = assetIds.map(() => '?').join(', ')
  const results = await queryAll<PlatformMediaAssetRow>(
    db,
    `SELECT id, public_url, kind, width, height
     FROM media_assets
     WHERE status = 'active' AND id IN (${placeholders})`,
    assetIds,
  )

  const assetMap = new Map((results ?? []).map(asset => [asset.id, asset]))

  return components.map((component) => {
    if (component.type !== 'how_to') return component

    return {
      ...component,
      data: {
        ...(component.data as PlatformHowToComponentData),
        steps: (component.data as PlatformHowToComponentData).steps.map((step) => {
          const asset = step.image_asset_id ? assetMap.get(step.image_asset_id) : null
          return {
            ...step,
            image_public_url: asset?.public_url ?? null,
            image_kind: asset?.kind ?? null,
            image_width: asset?.width ?? null,
            image_height: asset?.height ?? null,
          }
        }),
      },
    }
  })
}

export async function listPlatformBlogPosts(db: DbClient, status?: string | null, siteId: string | null = null) {
  let sql = `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
      p.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
      ma.width AS featured_image_width, ma.height AS featured_image_height,
      p.published_at, p.created_at, p.updated_at
    FROM blog_posts p
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE ${siteId ? 'p.site_id = ?' : 'p.site_id IS NULL'}`
  const params: ApiValue[] = siteId ? [siteId] : []
  if (status === 'published') sql += " AND p.status = 'published'"
  else if (status === 'draft') sql += " AND p.status = 'draft'"
  sql += ' ORDER BY p.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql, params)
  return (results ?? []).map(record => attachFeaturedImage(attachPublished(record, Boolean(record.published_at))))
}

export async function getPlatformBlogPost(db: DbClient, postIdOrSlug: string, siteId: string | null = null) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const post = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       p.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
       ma.width AS featured_image_width, ma.height AS featured_image_height,
       p.published_at, p.created_at, p.updated_at
     FROM blog_posts p
     LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
     WHERE p.id = ?`,
    [postId],
  )
  if (!post) notFound('Post not found')
  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'blog_post', postId))
  return attachComponents(attachFeaturedImage(attachPublished(post, Boolean(post.published_at))), components)
}

export async function createPlatformBlogPost(
  db: D1Database,
  authorId: string,
  input: PlatformBlogCreateInput,
  scope: BlogScope = {},
) {
  if (!input.title?.trim() || !input.body?.trim()) badRequest('title and body are required')
  const isTenant = Boolean(scope.site_id)
  validateBlogCommon(input, isTenant)
  if (!isTenant && !input.category?.trim()) badRequest('category is required')
  if (input.publish && !isTenant) assertPublishableBlogCategory(input.category)
  if (input.featured_image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id, 'featured_image_asset_id', scope.site_id ?? null)

  const siteId = scope.site_id ?? null
  const organizationId = scope.organization_id ?? null
  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'post')
  const now = new Date().toISOString()
  const publishedAt = input.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await execute(db, `
        INSERT INTO blog_posts (id, organization_id, site_id, title, slug, body, excerpt, category, status, seo_description, seo_keywords, canonical_url, robots, featured_image_asset_id, author_id, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id,
        organizationId,
        siteId,
        input.title,
        slug,
        input.body,
        input.excerpt ?? null,
        input.category ?? null,
        input.publish ? 'published' : 'draft',
        input.seo_description ?? null,
        input.seo_keywords ?? null,
        input.canonical_url ?? null,
        input.robots ?? null,
        input.featured_image_asset_id ?? null,
        authorId,
        publishedAt,
        now,
        now,
      ])

      try {
        await syncStructuredContent(db, 'blog_post', id, input)
      } catch (err) {
        try {
          await execute(db, 'DELETE FROM blog_posts WHERE id = ?', [id])
          await replaceContentComponents(db, 'blog_post', id, [])
        } catch (cleanupErr) {
          console.error('Failed to clean up blog post after create rollback:', cleanupErr)
        }
        throw err
      }
      const post = await getPlatformBlogPost(db, id, siteId)
      return { success: true, id, slug, published_at: publishedAt, post }
    } catch (err) {
      if (isUniqueConstraintError(err, 'blog_posts') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }

  throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
}

export async function updatePlatformBlogPost(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogUpdateInput,
  siteId: string | null = null,
) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const isTenant = Boolean(siteId)
  validateBlogCommon(input, isTenant)
  const current = !isTenant
    ? await queryFirst<{ category: string | null }>(db, 'SELECT category FROM blog_posts WHERE id = ? LIMIT 1', [postId])
    : null
  const effectiveCategory = input.category !== undefined ? input.category : current?.category ?? null
  if (!isTenant && !effectiveCategory?.trim()) badRequest('category is required')
  if (input.publish && !isTenant) {
    assertPublishableBlogCategory(effectiveCategory)
  }
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    const slug = normalizeSlugFromTitle(input.title, 'post')
    const scopeClause = siteId ? 'site_id = ?' : 'site_id IS NULL'
    const scopeParams = siteId ? [siteId] : []
    const existing = await queryFirst(db, `SELECT id FROM blog_posts WHERE slug = ? AND id != ? AND ${scopeClause} LIMIT 1`, [slug, postId, ...scopeParams])
    if (existing) badRequest('Slug already in use')
    updates.push('title = ?', 'slug = ?')
    params.push(input.title, slug)
  }

  if (input.body !== undefined) {
    if (!input.body?.trim()) badRequest('body cannot be blank')
    updates.push('body = ?')
    params.push(input.body)
  }

  if (input.featured_image_asset_id !== undefined && input.featured_image_asset_id) {
    await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id, 'featured_image_asset_id', siteId)
  }

  const fields: Array<keyof Omit<PlatformBlogUpdateInput,
    | 'publish'
    | 'unpublish'
    | 'title'
    | 'faq_items'
    | 'faq_label'
    | 'faq_status'
    | 'faq_render_enabled'
    | 'faq_schema_enabled'
    | 'how_to_steps'
    | 'how_to_estimated_time'
    | 'how_to_tool_items'
    | 'how_to_supply_items'
    | 'how_to_label'
    | 'how_to_status'
    | 'how_to_render_enabled'
    | 'how_to_schema_enabled'
    | 'components'
  >> = [
    'excerpt',
    'category',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'featured_image_asset_id',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }

  if (input.publish && input.unpublish) badRequest('Cannot publish and unpublish simultaneously')
  if (input.publish) {
    updates.push('published_at = ?', "status = 'published'")
    params.push(now)
  }
  if (input.unpublish) {
    updates.push('published_at = NULL', "status = 'draft'")
  }

  params.push(postId)

  try {
    const post = await queryFirst<ApiRecord | null>(db, `
      UPDATE blog_posts
       SET ${updates.join(', ')}
       WHERE id = ?
       RETURNING id`, params)
    if (!post) notFound('Post not found')

    await syncStructuredContent(db, 'blog_post', postId, input)
    return { success: true, post: await getPlatformBlogPost(db, postId, siteId) }
  } catch (err) {
    if (isUniqueConstraintError(err, 'blog_posts')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformBlogPost(db: D1Database, postIdOrSlug: string, siteId: string | null = null) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  await replaceContentComponents(db, 'blog_post', postId, [])
  const result = await execute(db, 'DELETE FROM blog_posts WHERE id = ?', [postId])
  if (!result.meta.changes || result.meta.changes === 0) notFound('Post not found')
  return { success: true }
}

export async function listPlatformDocs(db: DbClient, status?: string | null) {
  let sql = `SELECT
      d.id, d.title, d.slug, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
      d.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
      ma.width AS featured_image_width, ma.height AS featured_image_height,
      d.difficulty_level, d.sort_order, d.parent_doc_id, d.status, d.published_at, d.created_at, d.updated_at
    FROM platform_docs d
    LEFT JOIN media_assets ma ON ma.id = d.featured_image_asset_id AND ma.status = 'active'`
  if (status === 'published') sql += " WHERE d.status = 'published'"
  else if (status === 'draft') sql += " WHERE d.status = 'draft'"
  sql += ' ORDER BY d.category, d.sort_order, d.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql)
  return (results ?? []).map(record => attachFeaturedImage(attachPublished(record, record.status === 'published')))
}

export async function getPlatformDoc(db: DbClient, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  const doc = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       d.id, d.title, d.slug, d.body, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
       d.difficulty_level, d.sort_order, d.parent_doc_id,
       d.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
       ma.width AS featured_image_width, ma.height AS featured_image_height,
       d.status, d.published_at, d.created_at, d.updated_at
     FROM platform_docs d
     LEFT JOIN media_assets ma ON ma.id = d.featured_image_asset_id AND ma.status = 'active'
     WHERE d.id = ?`,
    [docId],
  )
  if (!doc) notFound('Doc not found')
  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'doc', docId))
  return attachComponents(attachFeaturedImage(attachPublished(doc, doc.status === 'published')), components)
}

export async function createPlatformDoc(
  db: D1Database,
  authorId: string,
  input: PlatformDocCreateInput,
) {
  if (!input.title || !input.body) badRequest('title and body are required')
  validateDocCommon(input)
  if (input.parent_doc_id) await ensureDocParentExists(db, input.parent_doc_id)
  if (input.featured_image_asset_id) await ensureMediaAssetExists(db, input.featured_image_asset_id)

  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'doc')
  const now = new Date().toISOString()
  const status = input.publish ? 'published' : 'draft'
  const publishedAt = input.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await execute(db, `
        INSERT INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id,
        input.title,
        slug,
        input.body,
        input.excerpt ?? null,
        input.category ?? null,
        authorId,
        input.seo_description ?? null,
        input.seo_keywords ?? null,
        input.canonical_url ?? null,
        input.robots ?? null,
        input.difficulty_level ?? null,
        input.sort_order ?? 0,
        input.parent_doc_id ?? null,
        input.featured_image_asset_id ?? null,
        status,
        publishedAt,
        now,
        now,
      ])

      try {
        await syncStructuredContent(db, 'doc', id, input)
      } catch (syncErr) {
        await execute(db, 'DELETE FROM platform_docs WHERE id = ?', [id])
        throw syncErr
      }

      const doc = await getPlatformDoc(db, id)
      return { success: true, id, slug, status, published_at: publishedAt, doc }
    } catch (err) {
      if (isUniqueConstraintError(err, 'platform_docs') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }

  throw createError({ statusCode: 500, statusMessage: 'Failed to create doc' })
}

export async function updatePlatformDoc(
  db: D1Database,
  docIdOrSlug: string,
  input: PlatformDocUpdateInput,
) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  validateDocCommon(input)
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    const slug = normalizeSlugFromTitle(input.title, 'doc')
    const existing = await queryFirst(db, 'SELECT id FROM platform_docs WHERE slug = ? AND id != ? LIMIT 1', [slug, docId])
    if (existing) badRequest('Slug already in use')
    updates.push('title = ?', 'slug = ?')
    params.push(input.title, slug)
  }

  if (input.parent_doc_id !== undefined) {
    if (input.parent_doc_id === docId) badRequest('A document cannot be its own parent')
    if (input.parent_doc_id) await ensureDocParentExists(db, input.parent_doc_id)
  }
  if (input.featured_image_asset_id !== undefined && input.featured_image_asset_id) {
    await ensureMediaAssetExists(db, input.featured_image_asset_id)
  }

  const fields: Array<keyof Omit<PlatformDocUpdateInput,
    | 'publish'
    | 'unpublish'
    | 'title'
    | 'faq_items'
    | 'faq_label'
    | 'faq_status'
    | 'faq_render_enabled'
    | 'faq_schema_enabled'
    | 'how_to_steps'
    | 'how_to_estimated_time'
    | 'how_to_tool_items'
    | 'how_to_supply_items'
    | 'how_to_label'
    | 'how_to_status'
    | 'how_to_render_enabled'
    | 'how_to_schema_enabled'
    | 'components'
  >> = [
    'body',
    'excerpt',
    'category',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'difficulty_level',
    'sort_order',
    'parent_doc_id',
    'featured_image_asset_id',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      if (field === 'body' && !input.body?.trim()) badRequest('body cannot be blank')
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }

  if (input.publish && input.unpublish) badRequest('Cannot publish and unpublish simultaneously')
  if (input.publish) {
    updates.push('status = ?', 'published_at = ?')
    params.push('published', now)
  }
  if (input.unpublish) {
    updates.push('status = ?', 'published_at = NULL')
    params.push('draft')
  }

  params.push(docId)

  try {
    const doc = await queryFirst<ApiRecord | null>(db, `
      UPDATE platform_docs
       SET ${updates.join(', ')}
       WHERE id = ?
       RETURNING id`, params)
    if (!doc) notFound('Doc not found')

    await syncStructuredContent(db, 'doc', docId, input)
    return { success: true, doc: await getPlatformDoc(db, docId) }
  } catch (err) {
    if (isUniqueConstraintError(err, 'platform_docs')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformDoc(db: D1Database, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  await replaceContentComponents(db, 'doc', docId, [])
  const result = await execute(db, 'DELETE FROM platform_docs WHERE id = ?', [docId])
  if (!result.meta.changes || result.meta.changes === 0) notFound('Doc not found')
  return { success: true }
}
