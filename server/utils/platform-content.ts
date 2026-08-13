import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import {
  createContentDocumentWithBlocks,
  deleteContentDocumentForOwner,
  publishCurrentPlatformDocRevision,
  getContentEditorSnapshot,
  getPublishedContentSnapshot,
  markdownToContentBlocks,
  prepareContentDocumentBlocksReplacement,
  prepareContentDocumentWithBlocks,
  replaceContentDocumentBlocks,
  renderContentBlocksToMarkdown,
  syncContentDocumentFromMarkdown,
  unpublishContentDocument,
  type ContentDocumentOwnerType,
  type ContentBlockInput,
} from '~/server/utils/content-documents'
import { slugifyTitle } from '~/utils/post-slugs'
import { PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'
import { BLOG_CATEGORY_LABELS, blogCategoryToSlug } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { normalizeBlogSlug, parseScheduledFor, resolveBlogPublicPath, resolveSlugMutation, structuredComponentsFromBlocks } from '~/utils/blog-editor'
import { createBlogRedirect, resolveBlogSocialImage } from '~/server/utils/blog-publishing'
import { resolvePublicTemplate } from '~/utils/template-registry'

const BLOG_TITLE_MAX = 200
const BLOG_EXCERPT_MAX = 500
const BLOG_CATEGORY_MAX = 100
const BLOG_SEO_TITLE_MAX = 200
const BLOG_SEO_DESCRIPTION_MAX = 500
const BLOG_SEO_KEYWORDS_MAX = 500
const CONTENT_NAV_LABEL_MAX = 120
const CONTENT_NAV_TITLE_MAX = 160
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
const AI_ASSISTANCE_MAX_PROMPTS = 10
const AI_ASSISTANCE_INTRO_MAX = 500
const AI_ASSISTANCE_PROMPT_MAX = 8000
const AI_ASSISTANCE_PROMPT_TITLE_MAX = 160
const AI_ASSISTANCE_PROMPT_DESCRIPTION_MAX = 500
const AI_ASSISTANCE_PROMPT_COPY_LABEL_MAX = 80
const COMPONENT_LABEL_MAX = 200
const MAX_SLUG_ATTEMPTS = 8
const BLOG_UPDATE_MUTATION_FIELDS: Array<keyof PlatformBlogUpdateInput> = [
  'title',
  'excerpt',
  'category',
  'tags',
  'nav_section',
  'nav_title',
  'nav_order',
  'nav_section_order',
  'hide_from_nav',
  'featured_order',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
  'featured_image_asset_id',
  'social_image_asset_id',
  'visibility',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
  'content_blocks',
  'site_author_id',
]

function parseStringArray(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) {
    if (value.some(item => typeof item !== 'string')) {
      throw createError({ statusCode: 500, statusMessage: 'Blog tags contain a non-string value' })
    }
    return value as string[]
  }
  if (typeof value !== 'string') {
    throw createError({ statusCode: 500, statusMessage: 'Blog tags are not valid JSON' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Blog tags are not valid JSON' })
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw createError({ statusCode: 500, statusMessage: 'Blog tags are not an array of strings' })
  }
  return parsed as string[]
}

export function parseBlogEditorThemeTokens(value: string | null | undefined): ApiRecord {
  if (value === null || value === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Blog editor theme tokens are not valid JSON' })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError({ statusCode: 500, statusMessage: 'Blog editor theme tokens must be a JSON object' })
  }
  return parsed as ApiRecord
}

export const PLATFORM_DOC_CATEGORIES = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] as const
export const PLATFORM_BLOG_CATEGORIES = BLOG_CATEGORY_LABELS
export const PLATFORM_DOC_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const

export type PlatformContentType = 'blog_post' | 'doc'
export type PlatformContentComponentType = 'faq' | 'how_to' | 'ai_assistance'
export type PlatformContentComponentStatus = 'active' | 'inactive'
export type PlatformRobotsDirective = 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow'

export const PLATFORM_CONTENT_COMPONENT_TYPES: readonly PlatformContentComponentType[] = ['faq', 'how_to', 'ai_assistance']
export const PLATFORM_COMPONENT_STATUSES: readonly PlatformContentComponentStatus[] = ['active', 'inactive']
export const PLATFORM_ROBOTS_DIRECTIVES: readonly PlatformRobotsDirective[] = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']

function blogContentOwnerType(siteId: string | null): ContentDocumentOwnerType {
  return siteId ? 'tenant_blog' : 'platform_blog'
}

async function syncDocContentDocument(
  db: D1Database,
  docId: string,
  input: { body?: string; publish?: boolean; unpublish?: boolean },
  createdBy?: string | null,
) {
  if (input.body !== undefined) {
    await syncContentDocumentFromMarkdown(db, {
      ownerType: 'platform_doc',
      ownerId: docId,
      bodyMarkdown: input.body,
      createdBy,
      label: input.publish ? 'Published markdown body' : 'Draft markdown body',
      publish: Boolean(input.publish),
    })
  } else if (input.publish) await publishCurrentPlatformDocRevision(db, docId)
  if (input.unpublish) await unpublishContentDocument(db, 'platform_doc', docId)
}

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

export interface PlatformAiAssistancePromptInput {
  title?: string | null
  prompt: string
  description?: string | null
  copy_label?: string | null
  position?: number | null
}

export interface PlatformAiAssistanceComponentData {
  intro?: string | null
  collapsed?: boolean | null
  max_visible_lines?: number | null
  prompts: Array<Required<Pick<PlatformAiAssistancePromptInput, 'prompt'>> & {
    title?: string | null
    description?: string | null
    copy_label?: string | null
    position: number
  }>
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
  data: PlatformFaqComponentData | PlatformHowToComponentData | PlatformAiAssistanceComponentData
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

export interface PlatformContentNavInput {
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
}

export interface BlogScope {
  site_id?: string | null
  organization_id?: string | null
}

export interface PlatformDocNavGroupInput {
  nav_group?: string | null
  nav_group_order?: number | null
}

export interface PlatformBlogCreateInput extends PlatformContentNavInput {
  title: string
  content_blocks: Array<ContentBlockInput & { id?: string }>
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  social_image_asset_id?: string | null
  visibility?: 'public' | 'unlisted'
  site_author_id?: string | null
}

export interface PlatformBlogUpdateInput extends PlatformContentNavInput {
  title?: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  social_image_asset_id?: string | null
  visibility?: 'public' | 'unlisted'
  slug?: string | null
  redirect_old_slug?: boolean
  reset_slug_override?: boolean
  content_blocks?: Array<ContentBlockInput & { id?: string }>
  expected_document_updated_at?: string
  expected_updated_at?: string
  site_author_id?: string | null
}

export interface PlatformBlogLifecycleInput {
  action: 'publish' | 'unpublish'
  expected_updated_at: string
  expected_document_updated_at: string
  scheduled_for?: string | null
}

export interface PlatformBlogLifecycleState {
  id: string
  status: 'draft' | 'published' | 'scheduled'
  published_at: string | null
  scheduled_for: string | null
  updated_at: string
  content_document_updated_at: string
}

export function parsePlatformBlogLifecycleInput(body: unknown, action: PlatformBlogLifecycleInput['action']): PlatformBlogLifecycleInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Request body must be a valid object')
  const record = body as Record<string, unknown>
  const allowed = action === 'publish'
    ? new Set(['expected_updated_at', 'expected_document_updated_at', 'scheduled_for'])
    : new Set(['expected_updated_at', 'expected_document_updated_at'])
  const unknownField = Object.keys(record).find(key => !allowed.has(key))
  if (unknownField) badRequest(`Unknown request field: ${unknownField}`)
  if (typeof record.expected_updated_at !== 'string' || !record.expected_updated_at.trim()) badRequest('expected_updated_at is required')
  if (typeof record.expected_document_updated_at !== 'string' || !record.expected_document_updated_at.trim()) badRequest('expected_document_updated_at is required')
  if (record.scheduled_for !== undefined && record.scheduled_for !== null && typeof record.scheduled_for !== 'string') {
    badRequest('scheduled_for must be a string or null')
  }
  return {
    action,
    expected_updated_at: record.expected_updated_at,
    expected_document_updated_at: record.expected_document_updated_at,
    ...(action === 'publish' ? { scheduled_for: record.scheduled_for as string | null | undefined } : {}),
  }
}

export interface PlatformDocCreateInput extends PlatformStructuredContentInput, PlatformContentNavInput, PlatformDocNavGroupInput {
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

export interface PlatformDocUpdateInput extends PlatformStructuredContentInput, PlatformContentNavInput, PlatformDocNavGroupInput {
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
  data: PlatformFaqComponentData | PlatformHowToComponentData | PlatformAiAssistanceComponentData
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
  const slug = slugifyTitle(title)
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function isUniqueConstraintError(err: unknown, table: 'blog_posts' | 'platform_docs') {
  const message = String((err as ApiValue)?.message || err || '')
  const normalized = message.replace(/["'`]/g, '')
  if (table === 'blog_posts') return normalized.includes('blog_posts.slug')
  return normalized.includes('platform_docs.slug')
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

function validateAiAssistanceComponent(value: unknown): PlatformAiAssistanceComponentData {
  const record = asRecord(value, 'ai_assistance component data')
  const rawPrompts = record.prompts
  if (!Array.isArray(rawPrompts)) badRequest('ai_assistance component data.prompts must be an array')
  if (rawPrompts.length === 0) badRequest('ai_assistance component must include at least one prompt')
  if (rawPrompts.length > AI_ASSISTANCE_MAX_PROMPTS) {
    badRequest(`ai_assistance component cannot exceed ${AI_ASSISTANCE_MAX_PROMPTS} prompts`)
  }

  const prompts = rawPrompts.map((prompt, index) => {
    const entry = asRecord(prompt, `ai_assistance prompt ${index}`)
    const promptText = asString(entry.prompt, `ai_assistance prompt ${index} prompt`).trim()
    if (!promptText) badRequest(`ai_assistance prompt ${index}.prompt is required`)
    assertStringLength(promptText, AI_ASSISTANCE_PROMPT_MAX, `ai_assistance prompt ${index}.prompt`)

    const title = typeof entry.title === 'string' ? entry.title.trim() || null : null
    const description = typeof entry.description === 'string' ? entry.description.trim() || null : null
    const copyLabel = typeof entry.copy_label === 'string' ? entry.copy_label.trim() || null : null
    assertStringLength(title, AI_ASSISTANCE_PROMPT_TITLE_MAX, `ai_assistance prompt ${index}.title`)
    assertStringLength(description, AI_ASSISTANCE_PROMPT_DESCRIPTION_MAX, `ai_assistance prompt ${index}.description`)
    assertStringLength(copyLabel, AI_ASSISTANCE_PROMPT_COPY_LABEL_MAX, `ai_assistance prompt ${index}.copy_label`)

    return {
      title,
      prompt: promptText,
      description,
      copy_label: copyLabel,
      position: typeof entry.position === 'number' ? entry.position : index,
    }
  })

  const intro = typeof record.intro === 'string' ? record.intro.trim() || null : null
  assertStringLength(intro, AI_ASSISTANCE_INTRO_MAX, 'ai_assistance intro')
  const maxVisibleLines = typeof record.max_visible_lines === 'number'
    ? Math.max(1, Math.min(12, Math.round(record.max_visible_lines)))
    : null

  return {
    intro,
    collapsed: typeof record.collapsed === 'boolean' ? record.collapsed : null,
    max_visible_lines: maxVisibleLines,
    prompts: sortByPosition(prompts),
  }
}

function parsePlatformComponent(row: PlatformContentComponentRow): PlatformContentComponent {
  let data: PlatformFaqComponentData | PlatformHowToComponentData | PlatformAiAssistanceComponentData
  let valid = true
  try {
    const parsed = JSON.parse(row.data_json) as unknown
    data = row.type === 'faq'
      ? validateFaqComponent(parsed)
      : row.type === 'how_to'
        ? validateHowToComponent(parsed)
        : validateAiAssistanceComponent(parsed)
  } catch (err) {
    valid = false
    console.error('Failed to parse platform content component:', { id: row.id, type: row.type, err })
    data = row.type === 'faq'
      ? { items: [] }
      : row.type === 'how_to'
        ? { steps: [] }
        : { prompts: [] }
  }
  return {
    id: row.id,
    content_type: row.content_type,
    content_id: row.content_id,
    type: row.type,
    position: row.position,
    label: row.label,
    status: valid ? row.status : 'inactive',
    render_enabled: valid ? Boolean(row.render_enabled) : false,
    schema_enabled: valid ? Boolean(row.schema_enabled) : false,
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
  const label = metadata.label !== undefined
    ? (metadata.label?.trim() || null)
    : previous?.label ?? (type === 'ai_assistance' ? 'AI Assistance' : undefined)
  assertStringLength(label, COMPONENT_LABEL_MAX, `${fieldPrefix} label`)

  return {
    label,
    status: metadata.status !== undefined
      ? assertValidComponentStatus(metadata.status, `${fieldPrefix} status`)
      : previous?.status,
    render_enabled: metadata.render_enabled !== undefined ? metadata.render_enabled : previous?.render_enabled,
    schema_enabled: metadata.schema_enabled !== undefined ? metadata.schema_enabled : previous?.schema_enabled ?? (type === 'ai_assistance' ? false : undefined),
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
    if (type !== 'ai_assistance') {
      if (seen.has(type)) badRequest(`components cannot include duplicate ${type} entries`)
      seen.add(type)
    }

    const metadata = normalizeComponentMetadata(type, component)
    const position = typeof metadata.position === 'number' ? metadata.position : index

    if (type === 'faq') {
      const data = validateFaqComponent(component.data)
      normalized.push({ type, data, ...metadata, position })
      continue
    }

    if (type === 'how_to') {
      const data = validateHowToComponent(component.data)
      for (const [stepIndex, step] of data.steps.entries()) {
        if (step.image_asset_id) await ensureMediaAssetExists(db, step.image_asset_id, `components[${index}].data.steps[${stepIndex}].image_asset_id`)
      }
      normalized.push({ type, data, ...metadata, position })
      continue
    }

    const data = validateAiAssistanceComponent(component.data)
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
  const scopedSiteId = siteId ?? PLATFORM_MEDIA_SITE_ID
  const conditions = ['id = ?', 'status = ?', 'kind = ?']
  const params: ApiValue[] = [assetId, 'active', 'image']
  conditions.push('site_id = ?')
  params.push(scopedSiteId)

  const asset = await queryFirst(db, `SELECT id FROM media_assets WHERE ${conditions.join(' AND ')} LIMIT 1`, params)
  if (!asset) {
    badRequest(siteId ? `${field} must reference an active image asset from this site` : `${field} must reference an active platform image asset`)
  }
}

async function ensureSiteAuthorExists(db: D1Database, siteAuthorId: string, siteId: string | null) {
  if (!siteId) badRequest('site_author_id can only be set on tenant blog posts')
  const author = await queryFirst(db, 'SELECT id FROM site_authors WHERE id = ? AND site_id = ? LIMIT 1', [siteAuthorId, siteId])
  if (!author) badRequest('site_author_id must reference an author belonging to this site')
}

const AUTHOR_NAME_MAX = 200
const AUTHOR_TITLE_MAX = 200
const AUTHOR_BIO_MAX = 2000

export interface SiteAuthorInput {
  name: string
  title?: string | null
  bio?: string | null
  image_asset_id?: string | null
  sort_order?: number | null
}

export interface SiteAuthorUpdateInput {
  name?: string
  title?: string | null
  bio?: string | null
  image_asset_id?: string | null
  sort_order?: number | null
}

function validateSiteAuthorInput(input: SiteAuthorInput | SiteAuthorUpdateInput) {
  if (input.name !== undefined && (!input.name?.trim() || input.name.length > AUTHOR_NAME_MAX)) {
    badRequest(`name is required and must be ${AUTHOR_NAME_MAX} characters or fewer`)
  }
  if (input.title != null && input.title.length > AUTHOR_TITLE_MAX) badRequest(`title must be ${AUTHOR_TITLE_MAX} characters or fewer`)
  if (input.bio != null && input.bio.length > AUTHOR_BIO_MAX) badRequest(`bio must be ${AUTHOR_BIO_MAX} characters or fewer`)
}

export async function listSiteAuthors(db: DbClient, siteId: string) {
  return await queryAll<{
    id: string
    name: string
    title: string | null
    bio: string | null
    image_asset_id: string | null
    image_public_url: string | null
    sort_order: number
    created_at: string
    updated_at: string
  }>(db, `
    SELECT sa.id, sa.name, sa.title, sa.bio, sa.image_asset_id, ma.public_url AS image_public_url, sa.sort_order, sa.created_at, sa.updated_at
      FROM site_authors sa
      LEFT JOIN media_assets ma ON ma.id = sa.image_asset_id AND ma.status = 'active'
     WHERE sa.site_id = ?
     ORDER BY sa.sort_order ASC, sa.created_at ASC
  `, [siteId])
}

export async function createSiteAuthor(db: D1Database, scope: { site_id: string; organization_id: string }, input: SiteAuthorInput) {
  validateSiteAuthorInput(input)
  if (input.image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.image_asset_id, 'image_asset_id', scope.site_id)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO site_authors (id, organization_id, site_id, name, title, bio, image_asset_id, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, scope.organization_id, scope.site_id, input.name, input.title ?? null, input.bio ?? null, input.image_asset_id ?? null, input.sort_order ?? 0, now, now])
  return { id }
}

export async function updateSiteAuthor(db: D1Database, siteId: string, authorId: string, input: SiteAuthorUpdateInput) {
  validateSiteAuthorInput(input)
  const existing = await queryFirst(db, 'SELECT id FROM site_authors WHERE id = ? AND site_id = ? LIMIT 1', [authorId, siteId])
  if (!existing) notFound('Author not found')
  if (input.image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.image_asset_id, 'image_asset_id', siteId)

  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [new Date().toISOString()]
  const fields: Array<keyof SiteAuthorUpdateInput> = ['name', 'title', 'bio', 'image_asset_id', 'sort_order']
  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(field === 'sort_order' ? (input.sort_order ?? 0) : (input[field] as ApiValue))
    }
  }
  if (updates.length === 1) badRequest('At least one field is required')
  params.push(authorId, siteId)
  await execute(db, `UPDATE site_authors SET ${updates.join(', ')} WHERE id = ? AND site_id = ?`, params)
  return { id: authorId }
}

export async function deleteSiteAuthor(db: D1Database, siteId: string, authorId: string) {
  const existing = await queryFirst(db, 'SELECT id FROM site_authors WHERE id = ? AND site_id = ? LIMIT 1', [authorId, siteId])
  if (!existing) notFound('Author not found')
  await execute(db, 'DELETE FROM site_authors WHERE id = ? AND site_id = ?', [authorId, siteId])
  return { success: true }
}

async function normalizeEditorContentBlocks(db: D1Database, blocks: Array<ContentBlockInput & { id?: string }>, siteId: string | null) {
  return await Promise.all(blocks.map(async (block): Promise<ContentBlockInput & { id?: string }> => {
    if (!block || typeof block !== 'object' || !block.data || typeof block.data !== 'object' || Array.isArray(block.data)) badRequest('Every content block requires an object data payload')
    if (block.type === 'heading' && (typeof block.data.text !== 'string' || !block.data.text.trim())) badRequest('Heading blocks require non-empty data.text')
    if (block.type === 'markdown') {
      if (typeof block.data.markdown !== 'string') badRequest('Markdown blocks require data.markdown')
      if (block.data.editor_mode !== 'rich' && block.data.editor_mode !== 'source') badRequest('Markdown blocks require data.editor_mode to be rich or source')
      if (block.data.editor_mode === 'rich' && (/^\s*\|.*\|\s*$/m.test(block.data.markdown) || /<\/?[a-z][^>]*>/i.test(block.data.markdown))) {
        badRequest('Markdown tables and raw HTML require editor_mode source')
      }
    }
    if (block.type !== 'image') return block
    const assetId = typeof block.data.asset_id === 'string' ? block.data.asset_id.trim() : ''
    if (!assetId) {
      return { ...block, data: { ...block.data, asset_id: '', public_url: '' } }
    }
    await ensureBlogFeaturedImageAssetExists(db, assetId, 'image block asset_id', siteId)
    const asset = await queryFirst<{ public_url: string | null; thumbnail_url: string | null; width: number | null; height: number | null } | null>(db,
      'SELECT public_url, thumbnail_url, width, height FROM media_assets WHERE id = ? LIMIT 1', [assetId])
    return {
      ...block,
      data: { ...block.data, asset_id: assetId, public_url: asset?.public_url ?? '', thumbnail_url: asset?.thumbnail_url ?? null, width: asset?.width ?? null, height: asset?.height ?? null },
    }
  }))
}

function renderCanonicalBlogBody(blocks: Array<ContentBlockInput & { id?: string }>) {
  return renderContentBlocksToMarkdown(blocks.map((block, position) => ({
    id: block.id ?? `pending-${position}`,
    type: block.type,
    position,
    level: block.level ?? null,
    data_json: JSON.stringify(block.data),
  })))
}

async function normalizeCanonicalBlogBlocks(
  db: D1Database,
  input: Pick<PlatformBlogCreateInput, 'content_blocks'>,
  siteId: string | null,
) {
  if (!Array.isArray(input.content_blocks) || !input.content_blocks.length) badRequest('content_blocks are required')
  return await normalizeEditorContentBlocks(db, input.content_blocks, siteId)
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
  const replacements = await resolveStructuredContentReplacements(db, contentType, contentId, input)
  if (replacements) await replaceContentComponents(db, contentType, contentId, replacements)
}

async function resolveStructuredContentReplacements(
  db: D1Database,
  contentType: PlatformContentType,
  contentId: string,
  input: PlatformStructuredContentInput,
): Promise<PlatformComponentReplacement[] | null> {
  const hasConvenienceFields = isStructuredConvenienceFieldDefined(input)
  if (input.components !== undefined && hasConvenienceFields) {
    badRequest('Use either components or convenience structured-content fields, not both')
  }

  if (input.components !== undefined) {
    return await normalizeFullComponents(db, input.components)
  }

  if (!hasConvenienceFields) return null

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
  const existingAiAssistance = existing.filter(component => component.type === 'ai_assistance')

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

  for (const component of existingAiAssistance) {
    replacements.push({
      type: 'ai_assistance',
      data: component.data as PlatformAiAssistanceComponentData,
      ...normalizeComponentMetadata('ai_assistance', {}, component),
    })
  }

  return replacements
}

function attachComponents<T extends Record<string, unknown>, C>(record: T, components: C[]) {
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

function normalizeNavVisibility<T extends Record<string, unknown>>(record: T) {
  const normalized = { ...record } as T & { tags?: string[]; tags_json?: unknown }
  if ('tags_json' in record) {
    normalized.tags = parseStringArray(record.tags_json)
    delete normalized.tags_json
  }
  if (!('hide_from_nav' in record)) return normalized
  return {
    ...normalized,
    hide_from_nav: Boolean(record.hide_from_nav),
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
    ...normalizeNavVisibility(rest),
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
    ...normalizeNavVisibility(rest),
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

export type ContentReviewContext =
  | { scope: 'platform' }
  | { scope: 'tenant'; orgSlug: string; siteSlug: string }

function contentReviewUrls(
  record: ApiRecord,
  kind: 'blog' | 'doc',
  siteId: string | null = null,
  tenantBlogPath: string | null = null,
  context?: ContentReviewContext,
) {
  const id = String(record.id ?? '')
  const adminEditUrl = (() => {
    if (kind === 'doc') return `/admin/docs/${id}`
    if (context?.scope === 'tenant') {
      return `/dashboard/${context.orgSlug}/sites/${context.siteSlug}/blog/${id}`
    }
    return `/admin/blog/${id}`
  })()
  const isPublished = typeof record.status === 'string' ? record.status === 'published' : Boolean(record.published_at)
  const category = typeof record.category === 'string' ? record.category : null
  const slug = typeof record.slug === 'string' ? record.slug : null
  const categorySlug = kind === 'blog' ? blogCategoryToSlug(category) : categoryToSlug(category)
  const publicPath = (() => {
    if (!slug) return null
    if (kind === 'blog') {
      if (siteId) return tenantBlogPath ?? `/blog/${slug}`
      return resolveBlogPublicPath({ scope: 'platform', slug, category })
    }
    return categorySlug ? `/docs/${categorySlug}/${slug}` : null
  })()

  return {
    ...record,
    admin_edit_url: adminEditUrl,
    edit_url: adminEditUrl,
    public_path: publicPath,
    public_url: isPublished ? publicPath : null,
    preview_url: null,
  }
}

async function resolveTenantBlogPostPath(db: DbClient, siteId: string | null, slug: string) {
  if (!siteId) return null
  const site = await queryFirst<{ theme: string | null; theme_id: string | null }>(
    db,
    'SELECT theme, theme_id FROM sites WHERE id = ? LIMIT 1',
    [siteId],
  )
  return tenantBlogPostPath(site, slug)
}

async function resolveTenantContext(db: DbClient, siteId: string | null): Promise<ContentReviewContext | undefined> {
  if (!siteId) return undefined
  const site = await queryFirst<{ slug: string; organization_slug: string }>(
    db,
    'SELECT s.slug, o.slug AS organization_slug FROM sites s JOIN organization o ON s.organization_id = o.id WHERE s.id = ? LIMIT 1',
    [siteId],
  )
  if (!site) return undefined
  return { scope: 'tenant', orgSlug: site.organization_slug, siteSlug: site.slug }
}

/**
 * Shared by the public blog API route and the blog page's SSR data fetch.
 * The page must call this directly (with its own request's `db` binding)
 * rather than doing a nested self-fetch back to the API route — Nitro's
 * internal dispatch for multi-segment dynamic routes does not reliably
 * reproduce the same route-param/binding resolution as a real external
 * request, which was causing the page to 404 on posts the API itself
 * served fine.
 */
export async function getPublishedPlatformBlogPost(db: DbClient, category: string, slug: string) {
  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.tags_json, p.seo_title, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.visibility, p.social_image_asset_id,
      p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
      p.published_at, p.created_at, p.updated_at,
      p.featured_image_asset_id,
      u.name AS author_name,
      u.image AS author_image,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN user u ON u.id = p.author_id
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.category = ? AND p.status = 'published' AND p.site_id IS NULL
  `, [slug, category])

  if (!post) return null

  const contentBlocks = await getPublishedContentSnapshot(db, 'platform_blog', String(post.id))
  if (!contentBlocks) throw createError({ statusCode: 500, statusMessage: 'Published blog content revision is missing' })
  const components = structuredComponentsFromBlocks(contentBlocks)
  const socialImage = await resolveBlogSocialImage(db, { siteId: null, explicitAssetId: post.social_image_asset_id as string | null, legacyAssetId: post.featured_image_asset_id as string | null, blocks: contentBlocks })

  return attachFeaturedImageFromBareJoin({ ...post, components, content_blocks: contentBlocks, social_image: socialImage })
}

/**
 * Shared by the public docs API route and the docs page's SSR data fetch.
 * See getPublishedPlatformBlogPost above for why the page must call this
 * directly rather than doing a nested self-fetch back to the API route.
 */
export async function getPublishedPlatformDoc(db: DbClient, category: string, slug: string) {
  const doc = await queryFirst<ApiRecord>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.difficulty_level,
       p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.nav_group, p.nav_group_order, p.hide_from_nav, p.featured_order,
       p.featured_image_asset_id, p.published_at, p.updated_at,
       ma.public_url, ma.kind, ma.width, ma.height
     FROM platform_docs p
     LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
     WHERE p.slug = ? AND p.category = ? AND p.status = 'published'`,
    [slug, category],
  )

  if (!doc) return null

  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'doc', String(doc.id), { activeOnly: true }))

  return attachFeaturedImageFromBareJoin({ ...doc, components })
}

function normalizeBlankToNull(input: { canonical_url?: string | null; robots?: string | null }) {
  if (input.canonical_url !== undefined && input.canonical_url?.trim() === '') input.canonical_url = null
  if (input.robots !== undefined && input.robots?.trim() === '') input.robots = null
}

function validateNavMetadata(input: Partial<PlatformContentNavInput>) {
  if (input.nav_section !== undefined) assertStringLength(input.nav_section ?? null, CONTENT_NAV_LABEL_MAX, 'nav_section')
  if (input.nav_title !== undefined) assertStringLength(input.nav_title ?? null, CONTENT_NAV_TITLE_MAX, 'nav_title')
  for (const field of ['nav_order', 'nav_section_order', 'featured_order'] as const) {
    if (input[field] !== undefined && input[field] !== null) {
      const value = input[field]
      if (typeof value !== 'string' && typeof value !== 'number') {
        badRequest(`${field} must be a number or numeric string`)
      }
      if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
        badRequest(`${field} must be a number or numeric string`)
      }
      if (typeof value === 'number' && !Number.isInteger(value)) {
        badRequest(`${field} must be an integer`)
      }
    }
  }
}

function validateDocNavGroupMetadata(input: Partial<PlatformDocNavGroupInput>) {
  if (input.nav_group !== undefined) assertStringLength(input.nav_group ?? null, CONTENT_NAV_LABEL_MAX, 'nav_group')
  if (input.nav_group_order !== undefined && input.nav_group_order !== null && !Number.isInteger(input.nav_group_order)) {
    badRequest('nav_group_order must be an integer')
  }
}

function normalizeHideFromNav(value: PlatformContentNavInput['hide_from_nav']) {
  if (value === undefined || value === null) return value
  return value ? 1 : 0
}

function hasOwnField<T extends object>(input: T, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

// The fixed PLATFORM_BLOG_CATEGORIES taxonomy (Marketing, SEO, ...) only makes sense
// for KrabiClaw's own marketing blog — a tenant restaurant's blog category is free text.
function validateBlogCommon(input: Partial<PlatformBlogCreateInput>, isTenant = false) {
  normalizeBlankToNull(input)
  validateNavMetadata(input)
  if (input.title !== undefined) assertStringLength(input.title, BLOG_TITLE_MAX, 'title')
  if (input.excerpt !== undefined) assertStringLength(input.excerpt ?? null, BLOG_EXCERPT_MAX, 'excerpt')
  if (input.category !== undefined) {
    assertStringLength(input.category ?? null, BLOG_CATEGORY_MAX, 'category')
    if (!isTenant) assertValidBlogCategory(input.category ?? null)
  }
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) badRequest('tags must be an array of non-empty strings up to 80 characters each')
    input.tags = [...new Set(input.tags.map(tag => tag.trim()))].slice(0, 20)
  }
  if (input.seo_title !== undefined) assertStringLength(input.seo_title ?? null, BLOG_SEO_TITLE_MAX, 'seo_title')
  if (input.seo_description !== undefined) assertStringLength(input.seo_description ?? null, BLOG_SEO_DESCRIPTION_MAX, 'seo_description')
  if (input.seo_keywords !== undefined) assertStringLength(input.seo_keywords ?? null, BLOG_SEO_KEYWORDS_MAX, 'seo_keywords')
  if (input.canonical_url !== undefined) assertValidCanonicalUrl(input.canonical_url)
  if (input.robots !== undefined) assertValidRobotsDirective(input.robots)
}

function rejectLegacyBlogContentFields(input: object) {
  const fields = ['body', 'components', 'faq_items', 'faq_label', 'faq_status', 'faq_render_enabled', 'faq_schema_enabled', 'how_to_steps', 'how_to_estimated_time', 'how_to_tool_items', 'how_to_supply_items', 'how_to_label', 'how_to_status', 'how_to_render_enabled', 'how_to_schema_enabled']
  const legacy = fields.find(field => Object.prototype.hasOwnProperty.call(input, field))
  if (legacy) badRequest(`${legacy} is not writable for blogs; use content_blocks`)
}

export function assertDraftOnlyBlogCreate(input: object) {
  const lifecycleField = ['publish', 'unpublish', 'scheduled_for']
    .find(field => Object.prototype.hasOwnProperty.call(input, field))
  if (lifecycleField) {
    badRequest(`${lifecycleField} is not writable when creating a blog post; create the draft, then use the publish operation`)
  }
}

function rejectBlogUpdateLifecycleFields(input: object) {
  const lifecycleField = ['publish', 'unpublish', 'scheduled_for']
    .find(field => Object.prototype.hasOwnProperty.call(input, field))
  if (lifecycleField) {
    badRequest(`${lifecycleField} is not writable through a blog update; use the publish or unpublish operation`)
  }
}

function validateDocCommon(input: Partial<PlatformDocCreateInput>) {
  normalizeBlankToNull(input)
  validateNavMetadata(input)
  validateDocNavGroupMetadata(input)
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
  await executeBatch(db, buildContentComponentReplacementQueries(contentType, contentId, components))
}

function buildContentComponentReplacementQueries(
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
    return queries
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
  return queries
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
      p.id, p.title, p.slug, p.excerpt, p.category, p.tags_json, p.status, p.visibility, p.scheduled_for,
      p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
      p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
      p.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
      ma.width AS featured_image_width, ma.height AS featured_image_height,
      p.published_at, p.created_at, p.updated_at
    FROM blog_posts p
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE ${siteId ? 'p.site_id = ?' : 'p.site_id IS NULL'}`
  const params: ApiValue[] = siteId ? [siteId] : []
  if (status === 'published') sql += " AND p.status = 'published'"
  else if (status === 'draft') sql += " AND p.status = 'draft'"
  else if (status === 'scheduled') sql += " AND p.status = 'scheduled'"
  sql += ' ORDER BY COALESCE(p.featured_order, 999999), COALESCE(p.nav_section_order, 999999), COALESCE(p.nav_section, p.category), COALESCE(p.nav_order, 999999), p.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql, params)
  const context = await resolveTenantContext(db, siteId)
  const site = siteId
    ? await queryFirst<{ theme: string | null; theme_id: string | null }>(db, 'SELECT theme, theme_id FROM sites WHERE id = ? LIMIT 1', [siteId])
    : null
  return (results ?? []).map((record) => {
    const slug = typeof record.slug === 'string' ? record.slug : ''
    const publicPath = siteId && slug ? tenantBlogPostPath(site, slug) : null
    return contentReviewUrls(attachFeaturedImage(attachPublished(record, Boolean(record.published_at))), 'blog', siteId, publicPath, context)
  })
}

export async function getPlatformBlogPost(db: DbClient, postIdOrSlug: string, siteId: string | null = null) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const post = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.tags_json, p.status, p.visibility, p.scheduled_for,
       p.first_published_at, p.slug_manually_overridden, p.social_image_asset_id, u.name AS author_name, u.image AS author_image,
       p.site_author_id, sa.name AS site_author_name, sa.title AS site_author_title, sa.bio AS site_author_bio,
       sma.public_url AS site_author_image_url,
       p.seo_title, p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
       p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
       p.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
       ma.width AS featured_image_width, ma.height AS featured_image_height,
       p.published_at, p.created_at, p.updated_at
     FROM blog_posts p
     LEFT JOIN user u ON u.id = p.author_id
     LEFT JOIN site_authors sa ON sa.id = p.site_author_id
     LEFT JOIN media_assets sma ON sma.id = sa.image_asset_id AND sma.status = 'active'
     LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
     WHERE p.id = ?`,
    [postId],
  )
  if (!post) notFound('Post not found')
  const contentDocument = await getContentEditorSnapshot(db, blogContentOwnerType(siteId), postId)
  if (!contentDocument) throw createError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  const components = structuredComponentsFromBlocks(contentDocument.blocks)
  const slug = typeof post.slug === 'string' ? post.slug : ''
  const publicPath = siteId && slug ? await resolveTenantBlogPostPath(db, siteId, slug) : null
  const context = await resolveTenantContext(db, siteId)
  const editorTheme = siteId ? await queryFirst<{ theme: string | null; theme_id: string | null; vertical: string | null; brand_name: string | null; brand_color: string | null } | null>(db, `
    SELECT s.theme, s.theme_id, s.vertical, s.brand_name,
           (SELECT sc.value FROM site_config sc WHERE sc.site_id = s.id AND sc.key = 'brand_color' LIMIT 1) AS brand_color
      FROM sites s
     WHERE s.id = ? LIMIT 1
  `, [siteId]) : null
  const editorTemplate = siteId ? resolvePublicTemplate({ theme: editorTheme?.theme, themeId: editorTheme?.theme_id, vertical: editorTheme?.vertical }) : null
  const editorThemeTokenRow = siteId && editorTemplate ? await queryFirst<{ tokens_json: string | null } | null>(db, `
    SELECT tokens_json FROM site_theme_tokens
     WHERE site_id = ? AND template_slug = ? AND status = 'active'
     LIMIT 1
  `, [siteId, editorTemplate.slug]) : null
  const editorThemeTokens = parseBlogEditorThemeTokens(editorThemeTokenRow?.tokens_json)
  const socialImage = await resolveBlogSocialImage(db, {
    siteId,
    explicitAssetId: typeof post.social_image_asset_id === 'string' ? post.social_image_asset_id : null,
    legacyAssetId: typeof post.featured_image_asset_id === 'string' ? post.featured_image_asset_id : null,
    blocks: contentDocument.blocks,
  })
  return {
    ...attachComponents(contentReviewUrls(attachFeaturedImage(attachPublished(post, Boolean(post.published_at))), 'blog', siteId, publicPath, context), components),
    tags: parseStringArray(post.tags_json),
    content_document: contentDocument,
    editor_template: editorTemplate?.slug ?? 'platform',
    editor_theme_tokens: editorThemeTokens,
    editor_site_name: siteId ? editorTheme?.brand_name || 'Our Site' : 'KrabiClaw',
    editor_brand_color: editorTheme?.brand_color ?? null,
    social_image: socialImage,
  }
}

export async function getPublishedSiteBlogPost(db: DbClient, siteId: string, slug: string) {
  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.tags_json, p.seo_title, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots, p.featured_order, p.visibility, p.social_image_asset_id,
      p.published_at, p.created_at, p.updated_at,
      p.featured_image_asset_id,
      COALESCE(sa.name, u.name) AS author_name,
      COALESCE(sma.public_url, u.image) AS author_image,
      sa.title AS author_title,
      sa.bio AS author_bio,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN user u ON u.id = p.author_id
    LEFT JOIN site_authors sa ON sa.id = p.site_author_id
    LEFT JOIN media_assets sma ON sma.id = sa.image_asset_id AND sma.status = 'active'
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.site_id = ? AND p.status = 'published'
      AND (p.scheduled_for IS NULL OR p.scheduled_for <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    LIMIT 1
  `, [slug, siteId])

  if (!post) return null

  const contentBlocks = await getPublishedContentSnapshot(db, 'tenant_blog', String(post.id))
  if (!contentBlocks) throw createError({ statusCode: 500, statusMessage: 'Published blog content revision is missing' })
  const components = structuredComponentsFromBlocks(contentBlocks)
  const socialImage = await resolveBlogSocialImage(db, { siteId, explicitAssetId: post.social_image_asset_id as string | null, legacyAssetId: post.featured_image_asset_id as string | null, blocks: contentBlocks })

  return attachFeaturedImageFromBareJoin({ ...post, components, content_blocks: contentBlocks, social_image: socialImage })
}

export async function createPlatformBlogPost(
  db: D1Database,
  authorId: string,
  input: PlatformBlogCreateInput,
  scope: BlogScope = {},
) {
  rejectLegacyBlogContentFields(input)
  assertDraftOnlyBlogCreate(input)
  if (!input.title?.trim()) badRequest('title is required')
  const isTenant = Boolean(scope.site_id)
  validateBlogCommon(input, isTenant)
  if (!isTenant) {
    if (!input.category?.trim()) badRequest('category is required')
    assertValidBlogCategory(input.category)
  }
  if (input.featured_image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id, 'featured_image_asset_id', scope.site_id ?? null)
  if (input.social_image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.social_image_asset_id, 'social_image_asset_id', scope.site_id ?? null)
  if (input.site_author_id) await ensureSiteAuthorExists(db, input.site_author_id, scope.site_id ?? null)

  const siteId = scope.site_id ?? null
  const organizationId = scope.organization_id ?? null
  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'post')
  const now = new Date().toISOString()
  if (input.visibility && !['public', 'unlisted'].includes(input.visibility)) badRequest('visibility must be public or unlisted')
  const canonicalBlocks = await normalizeCanonicalBlogBlocks(db, input, siteId)
  const canonicalBody = renderCanonicalBlogBody(canonicalBlocks)

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      const blogPostInsert: BatchQuery = {
        query: `
        INSERT INTO blog_posts (id, organization_id, site_id, title, slug, body, excerpt, category, tags_json, nav_section, nav_title, nav_order, nav_section_order, hide_from_nav, featured_order, status, visibility, scheduled_for, scheduled_revision_id, seo_title, seo_description, seo_keywords, canonical_url, robots, featured_image_asset_id, social_image_asset_id, author_id, site_author_id, published_at, first_published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          organizationId,
          siteId,
          input.title,
          slug,
          canonicalBody,
          input.excerpt ?? null,
          input.category ?? null,
          input.tags ? JSON.stringify(input.tags) : null,
          input.nav_section ?? null,
          input.nav_title ?? null,
          input.nav_order != null ? Number(input.nav_order) : null,
          input.nav_section_order != null ? Number(input.nav_section_order) : null,
          normalizeHideFromNav(input.hide_from_nav) ?? 0,
          input.featured_order != null ? Number(input.featured_order) : null,
          'draft',
          input.visibility ?? 'public',
          null,
          null,
          input.seo_title ?? null,
          input.seo_description ?? null,
          input.seo_keywords ?? null,
          input.canonical_url ?? null,
          input.robots ?? null,
          input.featured_image_asset_id ?? null,
          input.social_image_asset_id ?? null,
          authorId,
          input.site_author_id ?? null,
          null,
          null,
          now,
          now,
        ],
      }

      const ownerType = blogContentOwnerType(siteId)
      await createContentDocumentWithBlocks(db, ownerType, id, canonicalBlocks, {
        bodyMarkdown: canonicalBody,
        createdBy: authorId,
        label: 'Draft canonical blocks',
        publish: false,
        additionalQueriesBefore: [blogPostInsert],
      })
      const post = await getPlatformBlogPost(db, id, siteId)
      return {
        success: true,
        id,
        slug,
        published_at: null,
        admin_edit_url: post.admin_edit_url,
        edit_url: post.edit_url,
        public_path: post.public_path,
        public_url: post.public_url,
        preview_url: post.preview_url,
        post,
      }
    } catch (err) {
      if (isUniqueConstraintError(err, 'blog_posts') && attempt < MAX_SLUG_ATTEMPTS - 1) continue
      throw err
    }
  }

  throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
}

export async function updatePlatformBlogLifecycle(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogLifecycleInput,
  siteId: string | null = null,
): Promise<PlatformBlogLifecycleState> {
  if (!input.expected_updated_at?.trim()) badRequest('expected_updated_at is required')
  if (!input.expected_document_updated_at?.trim()) badRequest('expected_document_updated_at is required')
  if (input.action === 'unpublish' && input.scheduled_for !== undefined) {
    badRequest('scheduled_for is only valid when publishing')
  }

  let scheduledFor: string | null = null
  if (input.action === 'publish') {
    try { scheduledFor = parseScheduledFor(input.scheduled_for) } catch (error) { badRequest((error as Error).message) }
    if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) badRequest('scheduled_for must be in the future')
  }

  type LifecycleSource = {
    id: string
    updated_at: string
    document_id: string | null
    draft_revision_id: string | null
    document_updated_at: string | null
  }
  const rows = await queryAll<LifecycleSource>(db, `
    SELECT p.id, p.updated_at,
           d.id AS document_id,
           d.draft_revision_id,
           d.updated_at AS document_updated_at
      FROM blog_posts p
      LEFT JOIN content_documents d
        ON d.owner_type = ? AND d.owner_id = p.id
     WHERE (p.id = ? OR p.slug = ?)
       AND ${siteId ? 'p.site_id = ?' : 'p.site_id IS NULL'}
     LIMIT 2
  `, siteId
    ? [blogContentOwnerType(siteId), postIdOrSlug, postIdOrSlug, siteId]
    : [blogContentOwnerType(siteId), postIdOrSlug, postIdOrSlug])
  if (rows.length === 0) notFound('Post not found')
  if (rows.length > 1) badRequest('Ambiguous platform content identifier; use the row id.')
  const source = rows[0]!
  if (source.updated_at !== input.expected_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
  }
  if (!source.document_id || !source.draft_revision_id || !source.document_updated_at) {
    throw createError({ statusCode: 500, statusMessage: 'Blog content document is missing its draft revision' })
  }
  if (source.document_updated_at !== input.expected_document_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
  }

  const sourceTimestamp = Date.parse(source.updated_at)
  const documentTimestamp = Date.parse(source.document_updated_at)
  const committedAt = new Date(Math.max(
    Date.now(),
    Number.isFinite(sourceTimestamp) ? sourceTimestamp + 1 : 0,
    Number.isFinite(documentTimestamp) ? documentTimestamp + 1 : 0,
  )).toISOString()
  const rowParams: ApiValue[] = []
  let rowAssignments: string
  if (input.action === 'publish' && scheduledFor) {
    rowAssignments = `scheduled_for = ?,
      scheduled_revision_id = (SELECT draft_revision_id FROM content_documents WHERE id = ?),
      published_at = NULL,
      status = 'scheduled',
      updated_at = ?`
    rowParams.push(scheduledFor, source.document_id, committedAt)
  } else {
    rowAssignments = `body = (
        SELECT r.body_markdown
          FROM content_documents d
          JOIN content_revisions r ON r.id = d.draft_revision_id AND r.document_id = d.id
         WHERE d.id = ?
      ),
      scheduled_for = NULL,
      scheduled_revision_id = NULL,
      published_at = ${input.action === 'publish' ? '?' : 'NULL'},
      ${input.action === 'publish' ? 'first_published_at = COALESCE(first_published_at, ?),' : ''}
      status = '${input.action === 'publish' ? 'published' : 'draft'}',
      updated_at = ?`
    rowParams.push(source.document_id)
    if (input.action === 'publish') rowParams.push(committedAt, committedAt)
    rowParams.push(committedAt)
  }

  const queries: BatchQuery[] = [
    {
      query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
        SELECT ?, ?, NULL, '__blog_lifecycle_concurrency_guard__', 0, NULL, '{}', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM blog_posts WHERE id = ? AND updated_at = ?)
            OR NOT EXISTS (
              SELECT 1 FROM content_documents
               WHERE id = ? AND updated_at = ? AND draft_revision_id = ?
            )`,
      params: [
        crypto.randomUUID(),
        source.document_id,
        committedAt,
        committedAt,
        source.id,
        input.expected_updated_at,
        source.document_id,
        input.expected_document_updated_at,
        source.draft_revision_id,
      ],
    },
    {
      query: `UPDATE blog_posts SET ${rowAssignments} WHERE id = ? AND updated_at = ?`,
      params: [...rowParams, source.id, input.expected_updated_at],
    },
  ]
  if (input.action === 'publish' && !scheduledFor) {
    queries.push(
      {
        query: `UPDATE content_revisions
          SET published_at = COALESCE(published_at, ?)
          WHERE id = (SELECT draft_revision_id FROM content_documents WHERE id = ?)
            AND document_id = ?`,
        params: [committedAt, source.document_id, source.document_id],
      },
      {
        query: 'UPDATE content_documents SET published_revision_id = draft_revision_id, updated_at = ? WHERE id = ?',
        params: [committedAt, source.document_id],
      },
    )
  } else if (input.action === 'unpublish') {
    queries.push({
      query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ?',
      params: [committedAt, source.document_id],
    })
  }

  try {
    await executeBatch(db, queries)
  } catch (error) {
    const latest = await queryFirst<{ updated_at: string; document_updated_at: string | null; draft_revision_id: string | null } | null>(db, `
      SELECT p.updated_at, d.updated_at AS document_updated_at, d.draft_revision_id
        FROM blog_posts p
        LEFT JOIN content_documents d ON d.id = ?
       WHERE p.id = ? LIMIT 1
    `, [source.document_id, source.id])
    if (!latest) notFound('Post not found')
    if (latest.updated_at !== input.expected_updated_at) {
      throw createError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
    }
    if (latest.document_updated_at !== input.expected_document_updated_at || latest.draft_revision_id !== source.draft_revision_id) {
      throw createError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
    }
    throw error
  }

  return {
    id: source.id,
    status: scheduledFor ? 'scheduled' : input.action === 'publish' ? 'published' : 'draft',
    published_at: input.action === 'publish' && !scheduledFor ? committedAt : null,
    scheduled_for: scheduledFor,
    updated_at: committedAt,
    content_document_updated_at: scheduledFor ? source.document_updated_at : committedAt,
  }
}

export async function updatePlatformBlogPost(
  db: D1Database,
  postIdOrSlug: string,
  input: PlatformBlogUpdateInput,
  siteId: string | null = null,
) {
  rejectLegacyBlogContentFields(input)
  rejectBlogUpdateLifecycleFields(input)
  if (!BLOG_UPDATE_MUTATION_FIELDS.some(field => input[field] !== undefined)) {
    badRequest('At least one blog mutation field is required')
  }
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const isTenant = Boolean(siteId)
  validateBlogCommon(input, isTenant)
  const current = await queryFirst<{ category: string | null; title: string; slug: string; status: string; published_at: string | null; first_published_at: string | null; slug_manually_overridden: number; updated_at: string }>(db, 'SELECT category, title, slug, status, published_at, first_published_at, slug_manually_overridden, updated_at FROM blog_posts WHERE id = ? LIMIT 1', [postId])
  if (!current) notFound('Post not found')
  if (input.expected_updated_at && current.updated_at !== input.expected_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
  }
  let normalizedBlocks: Array<ContentBlockInput & { id?: string }> | null = null
  let contentDocument: Awaited<ReturnType<typeof getContentEditorSnapshot>> = null
  if (input.content_blocks !== undefined) {
    if (!input.expected_document_updated_at) badRequest('expected_document_updated_at is required with content_blocks')
    contentDocument = await getContentEditorSnapshot(db, blogContentOwnerType(siteId), postId)
    if (!contentDocument || contentDocument.document.updated_at !== input.expected_document_updated_at) {
      throw createError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
    }
    normalizedBlocks = await normalizeEditorContentBlocks(db, input.content_blocks, siteId)
  }
  const effectiveCategory = input.category !== undefined ? input.category : current?.category ?? null
  if (!isTenant) {
    if (!effectiveCategory?.trim()) badRequest('category is required')
    assertValidBlogCategory(effectiveCategory)
  }
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: ApiValue[] = [now]

  if (input.visibility !== undefined && !['public', 'unlisted'].includes(input.visibility)) badRequest('visibility must be public or unlisted')
  if (input.title !== undefined) {
    if (!input.title?.trim()) badRequest('title cannot be blank')
    // Published URLs are durable identifiers. A headline edit must not silently
    // move the article and break inbound links, feeds, search, or tenant schema.
    updates.push('title = ?')
    params.push(input.title)
    if (!current?.first_published_at && !current?.slug_manually_overridden && input.slug === undefined) {
      updates.push('slug = ?')
      params.push(normalizeBlogSlug(input.title))
    }
  }

  if (input.reset_slug_override && input.slug !== undefined && input.slug !== null) badRequest('reset_slug_override cannot be combined with a manual slug')
  const slugMutation = resolveSlugMutation({
    requestedSlug: input.reset_slug_override ? null : input.slug,
    title: input.title ?? current?.title ?? '',
    currentSlug: current?.slug ?? '',
    manuallyOverridden: Boolean(current?.slug_manually_overridden),
  })
  const requestedSlug = input.slug !== undefined || input.reset_slug_override ? slugMutation.slug : null
  if (requestedSlug && requestedSlug !== current?.slug) {
    const postCollision = await queryFirst<{ id: string } | null>(db, `
      SELECT id FROM blog_posts
       WHERE slug = ? AND id != ? AND ${siteId ? 'site_id = ?' : 'site_id IS NULL'} LIMIT 1
    `, siteId ? [requestedSlug, postId, siteId] : [requestedSlug, postId])
    if (postCollision) badRequest('Slug already in use')
    const redirectCollision = await queryFirst<{ id: string } | null>(db, `
      SELECT id FROM blog_post_redirects
       WHERE old_slug = ? AND ${siteId ? 'site_id = ?' : 'site_id IS NULL'} LIMIT 1
    `, siteId ? [requestedSlug, siteId] : [requestedSlug])
    if (redirectCollision) badRequest('Slug collides with redirect history')
    updates.push('slug = ?', 'slug_manually_overridden = ?')
    params.push(requestedSlug, slugMutation.manuallyOverridden ? 1 : 0)
  } else if (input.reset_slug_override) {
    updates.push('slug_manually_overridden = 0')
  }

  if (input.featured_image_asset_id !== undefined && input.featured_image_asset_id) {
    await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id, 'featured_image_asset_id', siteId)
  }
  if (input.site_author_id !== undefined && input.site_author_id) {
    await ensureSiteAuthorExists(db, input.site_author_id, siteId)
  }

  const fields: Array<keyof Omit<PlatformBlogUpdateInput,
    | 'title'
    | 'hide_from_nav'
    | 'slug'
    | 'redirect_old_slug'
    | 'reset_slug_override'
    | 'content_blocks'
    | 'expected_document_updated_at'
    | 'expected_updated_at'
  >> = [
    'excerpt',
    'category',
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'featured_order',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'featured_image_asset_id',
    'social_image_asset_id',
    'visibility',
    'site_author_id',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`)
      params.push(input[field] as ApiValue)
    }
  }
  if (input.tags !== undefined) {
    updates.push('tags_json = ?')
    params.push(input.tags ? JSON.stringify(input.tags) : null)
  }
  if (input.hide_from_nav !== undefined) {
    updates.push('hide_from_nav = ?')
    params.push(normalizeHideFromNav(input.hide_from_nav) ?? 0)
  }

  if (input.social_image_asset_id !== undefined && input.social_image_asset_id) {
    await ensureBlogFeaturedImageAssetExists(db, input.social_image_asset_id, 'social_image_asset_id', siteId)
  }

  if (normalizedBlocks && current.status !== 'published') {
    updates.push('body = ?')
    params.push(renderCanonicalBlogBody(normalizedBlocks))
  }

  params.push(postId)
  if (input.expected_updated_at) params.push(input.expected_updated_at)

  let blogMutationApplied = false
  try {
    const rowUpdate = {
      query: `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ?${input.expected_updated_at ? ' AND updated_at = ?' : ''}`,
      params,
    }
    if (normalizedBlocks && contentDocument) {
      const before = input.expected_updated_at ? [{
        query: 'INSERT INTO blog_posts SELECT * FROM blog_posts WHERE id = ? AND updated_at != ?',
        params: [postId, input.expected_updated_at],
      }, rowUpdate] : [rowUpdate]
      await replaceContentDocumentBlocks(db, blogContentOwnerType(siteId), postId, normalizedBlocks, {
        expected_document_updated_at: input.expected_document_updated_at ?? contentDocument.document.updated_at,
        label: 'Editor autosave',
        additionalQueriesBefore: before,
      })
    } else {
      const post = await queryFirst<ApiRecord | null>(db, `${rowUpdate.query} RETURNING id`, rowUpdate.params)
      if (!post && input.expected_updated_at) throw createError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
      if (!post) notFound('Post not found')
    }
    blogMutationApplied = true

    if (requestedSlug && requestedSlug !== current?.slug && current?.first_published_at && input.redirect_old_slug !== false) {
      await createBlogRedirect(db, postId, siteId, current.slug)
    }

    const updatedPost = await getPlatformBlogPost(db, postId, siteId)
    return {
      success: true,
      admin_edit_url: updatedPost.admin_edit_url,
      edit_url: updatedPost.edit_url,
      public_path: updatedPost.public_path,
      public_url: updatedPost.public_url,
      preview_url: updatedPost.preview_url,
      post: updatedPost,
    }
  } catch (err) {
    if (!blogMutationApplied && input.expected_updated_at) {
      const latest = await queryFirst<{ updated_at: string } | null>(db, 'SELECT updated_at FROM blog_posts WHERE id = ? LIMIT 1', [postId])
      if (latest && latest.updated_at !== input.expected_updated_at) {
        throw createError({ statusCode: 409, statusMessage: 'Blog post was updated by another writer' })
      }
    }
    if (isUniqueConstraintError(err, 'blog_posts')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformBlogPost(db: D1Database, postIdOrSlug: string, siteId: string | null = null) {
  const postId = await resolvePlatformContentId(db, 'blog_posts', postIdOrSlug, 'Post not found', siteId)
  const priorComponents = await listContentComponents(db, 'blog_post', postId)
  try {
    await replaceContentComponents(db, 'blog_post', postId, [])
    const result = await execute(db, 'DELETE FROM blog_posts WHERE id = ?', [postId])
    if (!result.meta.changes || result.meta.changes === 0) notFound('Post not found')
    await deleteContentDocumentForOwner(db, blogContentOwnerType(siteId), postId)
  } catch (err) {
    await replaceContentComponents(db, 'blog_post', postId, priorComponents.map(c => ({
      type: c.type,
      data: c.data,
      label: c.label,
      status: c.status,
      render_enabled: c.render_enabled,
      schema_enabled: c.schema_enabled,
      position: c.position,
    })))
    throw err
  }
  return { success: true }
}

export async function reorderPlatformBlogPosts(
  db: D1Database,
  items: Array<{
    post_id: string
    nav_section?: string | null
    nav_title?: string | null
    nav_order: number
    nav_section_order?: number | null
    hide_from_nav?: boolean | number | null
  }>,
  siteId: string | null = null,
) {
  if (!items.length) badRequest('items are required')
  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = []
  const scopeClause = siteId ? 'site_id = ?' : 'site_id IS NULL'

  for (const item of items) {
    const metadata: Partial<PlatformContentNavInput> = { nav_order: item.nav_order }
    if (hasOwnField(item, 'nav_section')) metadata.nav_section = item.nav_section ?? null
    if (hasOwnField(item, 'nav_title')) metadata.nav_title = item.nav_title ?? null
    if (hasOwnField(item, 'nav_section_order')) metadata.nav_section_order = item.nav_section_order ?? null
    validateNavMetadata(metadata)
    const postId = await resolvePlatformContentId(db, 'blog_posts', item.post_id, 'Post not found', siteId)
    const updates = ['nav_order = ?', 'updated_at = ?']
    const params: ApiValue[] = [Number(item.nav_order), now]
    if (hasOwnField(item, 'nav_section')) {
      updates.splice(1, 0, 'nav_section = ?')
      params.splice(1, 0, item.nav_section ?? null)
    }
    if (hasOwnField(item, 'nav_title')) {
      updates.splice(updates.length - 1, 0, 'nav_title = ?')
      params.splice(params.length - 1, 0, item.nav_title ?? null)
    }
    if (hasOwnField(item, 'nav_section_order')) {
      updates.splice(updates.length - 1, 0, 'nav_section_order = ?')
      params.splice(params.length - 1, 0, item.nav_section_order != null ? Number(item.nav_section_order) : null)
    }
    if (hasOwnField(item, 'hide_from_nav')) {
      updates.splice(updates.length - 1, 0, 'hide_from_nav = ?')
      params.splice(params.length - 1, 0, normalizeHideFromNav(item.hide_from_nav) ?? 0)
    }
    params.push(postId)
    if (siteId) params.push(siteId)
    queries.push({
      query: `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ? AND ${scopeClause}`,
      params,
    })
  }

  await executeBatch(db, queries)
  return { success: true, posts: await listPlatformBlogPosts(db, null, siteId) }
}

export async function listPlatformDocs(db: DbClient, status?: string | null) {
  let sql = `SELECT
      d.id, d.title, d.slug, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
      d.nav_section, d.nav_title, d.nav_order, d.nav_section_order, d.nav_group, d.nav_group_order, d.hide_from_nav, d.featured_order,
      d.featured_image_asset_id, ma.public_url AS featured_image_public_url, ma.kind AS featured_image_kind,
      ma.width AS featured_image_width, ma.height AS featured_image_height,
      d.difficulty_level, d.sort_order, d.parent_doc_id, d.status, d.published_at, d.created_at, d.updated_at
    FROM platform_docs d
    LEFT JOIN media_assets ma ON ma.id = d.featured_image_asset_id AND ma.status = 'active'`
  if (status === 'published') sql += " WHERE d.status = 'published'"
  else if (status === 'draft') sql += " WHERE d.status = 'draft'"
  sql += ' ORDER BY COALESCE(d.featured_order, 999999), COALESCE(d.nav_section_order, 999999), COALESCE(d.nav_section, d.category), COALESCE(d.nav_group_order, 999999), COALESCE(d.nav_group, \'\'), COALESCE(d.nav_order, d.sort_order, 999999), d.created_at DESC'
  const results = await queryAll<ApiRecord>(db, sql)
  return (results ?? []).map(record => contentReviewUrls(attachFeaturedImage(attachPublished(record, record.status === 'published')), 'doc'))
}

export async function getPlatformDoc(db: DbClient, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  const doc = await queryFirst<ApiRecord | null>(
    db,
    `SELECT
       d.id, d.title, d.slug, d.body, d.excerpt, d.category, d.seo_description, d.seo_keywords, d.canonical_url, d.robots,
       d.nav_section, d.nav_title, d.nav_order, d.nav_section_order, d.nav_group, d.nav_group_order, d.hide_from_nav, d.featured_order,
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
  return attachComponents(contentReviewUrls(attachFeaturedImage(attachPublished(doc, doc.status === 'published')), 'doc'), components)
}

export async function createPlatformDoc(
  db: D1Database,
  authorId: string,
  input: PlatformDocCreateInput,
) {
  if (!input.title || !input.body) badRequest('title and body are required')
  validateDocCommon(input)
  if (input.parent_doc_id) await ensureDocParentExists(db, input.parent_doc_id)
  if (input.featured_image_asset_id) await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id)

  const id = crypto.randomUUID()
  const slugBase = normalizeSlugFromTitle(input.title, 'doc')
  const now = new Date().toISOString()
  const status = input.publish ? 'published' : 'draft'
  const publishedAt = input.publish ? now : null

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomSlugSuffix()}`
    try {
      await execute(db, `
        INSERT INTO platform_docs (id, title, slug, body, excerpt, category, nav_section, nav_title, nav_order, nav_section_order, nav_group, nav_group_order, hide_from_nav, featured_order, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id,
        input.title,
        slug,
        input.body,
        input.excerpt ?? null,
        input.category ?? null,
        input.nav_section ?? null,
        input.nav_title ?? null,
        input.nav_order != null ? Number(input.nav_order) : null,
        input.nav_section_order != null ? Number(input.nav_section_order) : null,
        input.nav_group ?? null,
        input.nav_group_order != null ? Number(input.nav_group_order) : null,
        normalizeHideFromNav(input.hide_from_nav) ?? 0,
        input.featured_order != null ? Number(input.featured_order) : null,
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
        await syncDocContentDocument(db, id, input, authorId)
      } catch (syncErr) {
        try {
          await executeBatch(db, [
            {
              query: 'DELETE FROM content_documents WHERE owner_type = ? AND owner_id = ?',
              params: ['platform_doc', id],
            },
            { query: 'DELETE FROM platform_docs WHERE id = ?', params: [id] },
            {
              query: 'DELETE FROM platform_content_components WHERE content_type = ? AND content_id = ?',
              params: ['doc', id],
            },
          ])
        } catch (cleanupErr) {
          throw new AggregateError(
            [syncErr, cleanupErr],
            'Platform doc creation failed and rollback cleanup also failed',
            { cause: syncErr },
          )
        }
        throw syncErr
      }

      const doc = await getPlatformDoc(db, id)
      return {
        success: true,
        id,
        slug,
        status,
        published_at: publishedAt,
        admin_edit_url: doc.admin_edit_url,
        public_path: doc.public_path,
        public_url: doc.public_url,
        preview_url: doc.preview_url,
        doc,
      }
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
    await ensureBlogFeaturedImageAssetExists(db, input.featured_image_asset_id)
  }

  const fields: Array<keyof Omit<PlatformDocUpdateInput,
    | 'publish'
    | 'unpublish'
    | 'title'
    | 'hide_from_nav'
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
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'nav_group',
    'nav_group_order',
    'featured_order',
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
  if (input.hide_from_nav !== undefined) {
    updates.push('hide_from_nav = ?')
    params.push(normalizeHideFromNav(input.hide_from_nav) ?? 0)
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

  const componentReplacements = await resolveStructuredContentReplacements(db, 'doc', docId, input)
  const contentSnapshot = input.body !== undefined || input.publish || input.unpublish
    ? await getContentEditorSnapshot(db, 'platform_doc', docId)
    : null

  if (input.body === undefined && input.publish && contentSnapshot?.document.draft_revision_id) {
    updates.push(`body = (
      SELECT body_markdown
        FROM content_revisions
       WHERE id = ? AND document_id = ?
    )`)
    params.push(contentSnapshot.document.draft_revision_id, contentSnapshot.document.id)
  }

  const rowUpdate: BatchQuery = {
    query: `UPDATE platform_docs SET ${updates.join(', ')} WHERE id = ?`,
    params: [...params, docId],
  }
  const mutationQueries: BatchQuery[] = [rowUpdate]
  if (componentReplacements) {
    mutationQueries.push(...buildContentComponentReplacementQueries('doc', docId, componentReplacements))
  }

  try {
    if (input.body !== undefined) {
      const preservedStructuredBlocks = (contentSnapshot?.blocks ?? [])
        .filter(block => block.type !== 'heading' && block.type !== 'markdown')
        .map(block => ({
          id: block.id,
          parent_block_id: block.parent_block_id,
          type: block.type,
          level: block.level,
          data: block.data,
        }))
      const canonicalBlocks = [...markdownToContentBlocks(input.body), ...preservedStructuredBlocks]
        .map((block, position) => ({ ...block, position }))

      if (contentSnapshot) {
        const prepared = prepareContentDocumentBlocksReplacement(contentSnapshot.document, canonicalBlocks, {
          expected_document_updated_at: contentSnapshot.document.updated_at,
          label: input.publish ? 'Published markdown body' : 'Draft markdown body',
          publish: Boolean(input.publish),
          additionalQueriesBefore: mutationQueries,
          additionalQueriesAfter: input.unpublish
            ? [{
                query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ?',
                params: [now, contentSnapshot.document.id],
              }]
            : undefined,
        })
        await executeBatch(db, prepared.queries)
      } else {
        const prepared = prepareContentDocumentWithBlocks('platform_doc', docId, canonicalBlocks, {
          bodyMarkdown: input.body,
          label: input.publish ? 'Published markdown body' : 'Draft markdown body',
          publish: Boolean(input.publish),
          additionalQueriesBefore: mutationQueries,
        })
        await executeBatch(db, prepared.queries)
      }
    } else {
      if (input.publish && contentSnapshot?.document.draft_revision_id) {
        mutationQueries.push(
          {
            query: `UPDATE content_revisions
              SET published_at = COALESCE(published_at, ?)
              WHERE id = ? AND document_id = ?`,
            params: [now, contentSnapshot.document.draft_revision_id, contentSnapshot.document.id],
          },
          {
            query: 'UPDATE content_documents SET published_revision_id = draft_revision_id, updated_at = ? WHERE id = ?',
            params: [now, contentSnapshot.document.id],
          },
        )
      } else if (input.unpublish && contentSnapshot) {
        mutationQueries.push({
          query: 'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ?',
          params: [now, contentSnapshot.document.id],
        })
      }
      await executeBatch(db, mutationQueries)
    }

    const updatedDoc = await getPlatformDoc(db, docId)
    return {
      success: true,
      admin_edit_url: updatedDoc.admin_edit_url,
      public_path: updatedDoc.public_path,
      public_url: updatedDoc.public_url,
      preview_url: updatedDoc.preview_url,
      doc: updatedDoc,
    }
  } catch (err) {
    if (isUniqueConstraintError(err, 'platform_docs')) badRequest('Slug already in use')
    throw err
  }
}

export async function deletePlatformDoc(db: D1Database, docIdOrSlug: string) {
  const docId = await resolvePlatformContentId(db, 'platform_docs', docIdOrSlug, 'Doc not found')
  const priorComponents = await listContentComponents(db, 'doc', docId)
  try {
    await replaceContentComponents(db, 'doc', docId, [])
    const result = await execute(db, 'DELETE FROM platform_docs WHERE id = ?', [docId])
    if (!result.meta.changes || result.meta.changes === 0) notFound('Doc not found')
    await deleteContentDocumentForOwner(db, 'platform_doc', docId)
  } catch (err) {
    await replaceContentComponents(db, 'doc', docId, priorComponents.map(c => ({
      type: c.type,
      data: c.data,
      label: c.label,
      status: c.status,
      render_enabled: c.render_enabled,
      schema_enabled: c.schema_enabled,
      position: c.position,
    })))
    throw err
  }
  return { success: true }
}

export async function reorderPlatformDocs(
  db: D1Database,
  items: Array<{
    doc_id: string
    nav_section?: string | null
    nav_title?: string | null
    nav_order: number
    nav_section_order?: number | null
    nav_group?: string | null
    nav_group_order?: number | null
    hide_from_nav?: boolean | number | null
  }>,
) {
  if (!items.length) badRequest('items are required')
  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = []

  for (const item of items) {
    const metadata: Partial<PlatformContentNavInput> = { nav_order: item.nav_order }
    if (hasOwnField(item, 'nav_section')) metadata.nav_section = item.nav_section ?? null
    if (hasOwnField(item, 'nav_title')) metadata.nav_title = item.nav_title ?? null
    if (hasOwnField(item, 'nav_section_order')) metadata.nav_section_order = item.nav_section_order ?? null
    validateNavMetadata(metadata)
    validateDocNavGroupMetadata({
      nav_group: hasOwnField(item, 'nav_group') ? item.nav_group ?? null : undefined,
      nav_group_order: hasOwnField(item, 'nav_group_order') ? item.nav_group_order ?? null : undefined,
    })
    const docId = await resolvePlatformContentId(db, 'platform_docs', item.doc_id, 'Doc not found')
    const updates = ['nav_order = ?', 'updated_at = ?']
    const params: ApiValue[] = [Number(item.nav_order), now]
    if (hasOwnField(item, 'nav_section')) {
      updates.splice(1, 0, 'nav_section = ?')
      params.splice(1, 0, item.nav_section ?? null)
    }
    if (hasOwnField(item, 'nav_title')) {
      updates.splice(updates.length - 1, 0, 'nav_title = ?')
      params.splice(params.length - 1, 0, item.nav_title ?? null)
    }
    if (hasOwnField(item, 'nav_section_order')) {
      updates.splice(updates.length - 1, 0, 'nav_section_order = ?')
      params.splice(params.length - 1, 0, item.nav_section_order != null ? Number(item.nav_section_order) : null)
    }
    if (hasOwnField(item, 'nav_group')) {
      updates.splice(updates.length - 1, 0, 'nav_group = ?')
      params.splice(params.length - 1, 0, item.nav_group ?? null)
    }
    if (hasOwnField(item, 'nav_group_order')) {
      updates.splice(updates.length - 1, 0, 'nav_group_order = ?')
      params.splice(params.length - 1, 0, item.nav_group_order != null ? Number(item.nav_group_order) : null)
    }
    if (hasOwnField(item, 'hide_from_nav')) {
      updates.splice(updates.length - 1, 0, 'hide_from_nav = ?')
      params.splice(params.length - 1, 0, normalizeHideFromNav(item.hide_from_nav) ?? 0)
    }
    params.push(docId)
    queries.push({
      query: `UPDATE platform_docs SET ${updates.join(', ')} WHERE id = ?`,
      params,
    })
  }

  await executeBatch(db, queries)
  return { success: true, docs: await listPlatformDocs(db) }
}
