import { PUBLICATION_CONTENT_BLOCK_LOCALIZED_FIELDS, type PublicationContentBlockType } from '~/shared/content-registries'

export type BlogVisibility = 'public' | 'unlisted'

export interface EditorContentBlock {
  id?: string
  type: string
  position?: number
  level?: number | null
  parent_block_id?: string | null
  data: Record<string, unknown>
  media?: Array<{ asset_id: string; slot: string; sort_order?: number; public_url?: string | null; thumbnail_url?: string | null; kind?: string | null; alt_text?: string | null; caption?: string | null }>
  updated_at?: string
}

export type BlogLocalizedFieldPath = readonly (string | number)[]

export interface BlogLocalizedTextField {
  path: BlogLocalizedFieldPath
  label: string
  value: string
  rows: number
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function localizedTextField(data: Record<string, unknown>, path: BlogLocalizedFieldPath): BlogLocalizedTextField[] {
  const value = readBlogLocalizedText(data, path)
  if (value === undefined) return []
  return [{
    path,
    label: path.map(segment => typeof segment === 'number' ? String(segment + 1) : segment.replaceAll('_', ' ')).join(' · '),
    value,
    rows: path.at(-1) === 'markdown' ? 8 : 2,
  }]
}

function expandLocalizedFieldPath(
  data: Record<string, unknown>,
  pattern: readonly (string | '*')[],
  path: BlogLocalizedFieldPath = [],
): BlogLocalizedFieldPath[] {
  const [segment, ...remaining] = pattern
  if (segment === undefined) return [path]
  if (segment !== '*') return expandLocalizedFieldPath(data, remaining, [...path, segment])
  const collection = readBlogLocalizedValue(data, path)
  if (!Array.isArray(collection)) return []
  return collection.flatMap((_, index) => expandLocalizedFieldPath(data, remaining, [...path, index]))
}

export function blogLocalizedTextFields(block: Pick<EditorContentBlock, 'type' | 'data'>): BlogLocalizedTextField[] {
  if (!(block.type in PUBLICATION_CONTENT_BLOCK_LOCALIZED_FIELDS)) return []
  const patterns = PUBLICATION_CONTENT_BLOCK_LOCALIZED_FIELDS[block.type as PublicationContentBlockType]
  return patterns.flatMap(pattern => expandLocalizedFieldPath(block.data, pattern).flatMap(path => localizedTextField(block.data, path)))
}

function readBlogLocalizedValue(data: Record<string, unknown>, path: BlogLocalizedFieldPath): unknown {
  let value: unknown = data
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(value)) return undefined
      value = value[segment]
    } else {
      if (!objectRecord(value)) return undefined
      value = value[segment]
    }
  }
  return value
}

export function readBlogLocalizedText(data: Record<string, unknown>, path: BlogLocalizedFieldPath): string | undefined {
  const value = readBlogLocalizedValue(data, path)
  return typeof value === 'string' ? value : undefined
}

export function writeBlogLocalizedText(data: Record<string, unknown>, path: BlogLocalizedFieldPath, text: string): void {
  let parent: unknown = data
  for (const segment of path.slice(0, -1)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(parent)) return
      parent = parent[segment]
    } else {
      if (!objectRecord(parent)) return
      parent = parent[segment]
    }
  }
  const finalSegment = path.at(-1)
  if (typeof finalSegment === 'number') {
    if (Array.isArray(parent)) parent[finalSegment] = text
  } else if (typeof finalSegment === 'string' && objectRecord(parent)) {
    parent[finalSegment] = text
  }
}

export function blankBlogLocalizedText<T extends EditorContentBlock>(block: T): T {
  const blank = structuredClone(block)
  for (const field of blogLocalizedTextFields(blank)) writeBlogLocalizedText(blank.data, field.path, '')
  if (blank.media) {
    blank.media = blank.media.map(item => ({ ...item, alt_text: null, caption: null }))
  }
  return blank
}

export function initialBlogEditorBlocks(): EditorContentBlock[] {
  return [{ type: 'markdown', data: { markdown: '', editor_mode: 'rich' } }]
}

export class SerializedSnapshotQueue<TSnapshot, TResult> {
  private generation = 0
  private pending: { generation: number; snapshot: TSnapshot } | null = null
  private running: Promise<void> | null = null
  private readonly persist: (_snapshot: TSnapshot) => Promise<TResult>
  private readonly applyCurrent: (_result: TResult, _snapshot: TSnapshot) => void

  constructor(
    persist: (_snapshot: TSnapshot) => Promise<TResult>,
    applyCurrent: (_result: TResult, _snapshot: TSnapshot) => void,
  ) {
    this.persist = persist
    this.applyCurrent = applyCurrent
  }

  mark(snapshot: TSnapshot) {
    this.pending = { generation: ++this.generation, snapshot }
    return this.generation
  }

  async flush() {
    if (!this.running) this.running = this.drain().finally(() => { this.running = null })
    await this.running
  }

  async runExclusive<T>(operation: () => Promise<T>) {
    const prior = this.running
    const exclusive = (async () => {
      if (prior) await prior
      await this.drain()
      const result = await operation()
      await this.drain()
      return result
    })()
    const lock = exclusive.then(() => undefined, () => undefined)
    this.running = lock
    void lock.finally(() => {
      if (this.running === lock) this.running = null
    })
    return await exclusive
  }

  private async drain() {
    while (this.pending) {
      const task = this.pending
      this.pending = null
      try {
        const result = await this.persist(task.snapshot)
        if (task.generation === this.generation) this.applyCurrent(result, task.snapshot)
      } catch (error) {
        // A failed request must remain retryable. Keep a newer snapshot when
        // one arrived while the request was in flight; otherwise restore the
        // failed task so the next explicit flush/back-navigation retries it.
        const pending = this.pending as { generation: number; snapshot: TSnapshot } | null
        if (!pending || pending.generation < task.generation) this.pending = task
        throw error
      }
    }
  }
}

const PLACEHOLDER_RE = /\{\{\s*component\b[^}]*\}\}/gi

export function plainTextFromMarkdown(markdown: string) {
  return markdown
    .replace(PLACEHOLDER_RE, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function generatedExcerpt(blocks: EditorContentBlock[], maxLength = 180) {
  const prose = blocks
    .filter(block => block.type === 'markdown' || block.type === 'heading')
    .map(block => block.type === 'heading' ? String(block.data.text || '') : String(block.data.markdown || ''))
    .map(plainTextFromMarkdown)
    .find(Boolean) || ''
  if (prose.length <= maxLength) return prose
  return `${prose.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`
}

export function normalizeBlogSlug(value: string, fallback = 'post') {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

export function resolveBlogSeo(input: {
  title: string
  seoTitle?: string | null
  excerpt?: string | null
  seoDescription?: string | null
  slug: string
  canonicalUrl?: string | null
  baseUrl: string
  pathPrefix?: string
  publicPath?: string
  siteName?: string | null
  descriptionMaxLength?: number
  robots?: string | null
}) {
  const path = input.publicPath || `${(input.pathPrefix || '/blog').replace(/\/$/, '')}/${encodeURIComponent(input.slug)}`
  const maxLength = input.descriptionMaxLength ?? 160
  const rawDescription = input.seoDescription?.trim() || input.excerpt?.trim() || `A post from ${input.siteName?.trim() || 'this site'}.`
  const description = rawDescription.length <= maxLength
    ? rawDescription
    : `${rawDescription.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim()}…`
  return {
    title: input.seoTitle?.trim() || input.title.trim(),
    description,
    canonicalUrl: input.canonicalUrl?.trim() || new URL(path, input.baseUrl).toString(),
    robots: input.robots?.trim() || 'index, follow',
  }
}

export function firstImageAssetId(blocks: EditorContentBlock[]) {
  const image = blocks.find(block => block.type === 'image' && block.data.status !== 'inactive')
  return image?.media?.find(item => item.slot === 'media')?.asset_id ?? null
}

export function parseScheduledFor(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('scheduled_for must be an ISO 8601 datetime with Z or a numeric timezone offset')
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('scheduled_for must be an ISO 8601 datetime with Z or a numeric timezone offset')
  return parsed.toISOString()
}

export function scheduledLifecycleValue(timing: 'Now' | 'Scheduled', localValue: string) {
  if (timing === 'Now') return null
  if (!localValue) throw new Error('Scheduled date and time is required')
  const parsed = new Date(localValue)
  if (Number.isNaN(parsed.getTime())) throw new Error('Scheduled date and time is invalid')
  return parsed.toISOString()
}

export function structuredComponentsFromBlocks(blocks: EditorContentBlock[]): Array<{
  type: 'faq' | 'how_to' | 'ai_assistance'
  position: number
  status: 'active' | 'inactive'
  render_enabled: boolean
  schema_enabled: boolean
  data: Record<string, unknown>
}> {
  const components: ReturnType<typeof structuredComponentsFromBlocks> = []
  blocks.forEach((block, position) => {
    if (block.type === 'faq') {
      const items = Array.isArray(block.data.items) ? block.data.items.filter(item => item && typeof item === 'object') : []
      components.push({ type: 'faq', position, status: block.data.status === 'inactive' ? 'inactive' : 'active', render_enabled: block.data.render_enabled !== false, schema_enabled: block.data.schema_enabled !== false, data: { items } })
    }
    if (block.type === 'how_to') {
      const steps = Array.isArray(block.data.steps) ? block.data.steps.filter(item => item && typeof item === 'object') : []
      components.push({ type: 'how_to', position, status: block.data.status === 'inactive' ? 'inactive' : 'active', render_enabled: block.data.render_enabled !== false, schema_enabled: block.data.schema_enabled !== false, data: { steps } })
    }
    if (block.type === 'ai_assistance') {
      const prompts = Array.isArray(block.data.prompts) ? block.data.prompts.filter(item => item && typeof item === 'object') : []
      components.push({ type: 'ai_assistance', position, status: block.data.status === 'inactive' ? 'inactive' : 'active', render_enabled: block.data.render_enabled !== false, schema_enabled: false, data: { ...block.data, prompts } })
    }
  })
  return components
}

export function resolveBlogPublicPath(input: {
  scope: 'platform' | 'tenant'
  slug: string
  category?: string | null
  template?: 'saya' | 'blawby' | 'platform' | string | null
}) {
  const slug = encodeURIComponent(input.slug)
  if (input.scope === 'tenant') return input.template === 'blawby' ? `/article/${slug}` : `/blog/${slug}`
  return `/blog/${normalizeBlogSlug(input.category || 'uncategorized', 'uncategorized')}/${slug}`
}

export function resolveSlugMutation(input: {
  requestedSlug: string | null | undefined
  title: string
  currentSlug: string
  manuallyOverridden: boolean
}) {
  if (input.requestedSlug === null) return { slug: normalizeBlogSlug(input.title), manuallyOverridden: false }
  if (typeof input.requestedSlug === 'string') return { slug: normalizeBlogSlug(input.requestedSlug), manuallyOverridden: true }
  return {
    slug: input.manuallyOverridden ? input.currentSlug : normalizeBlogSlug(input.title),
    manuallyOverridden: input.manuallyOverridden,
  }
}
