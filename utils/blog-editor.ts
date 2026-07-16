export type BlogVisibility = 'public' | 'unlisted'
export type BlogPublishingStatus = 'draft' | 'published' | 'scheduled' | 'archived'

export interface EditorContentBlock {
  id?: string
  type: string
  position?: number
  level?: number | null
  parent_block_id?: string | null
  data: Record<string, unknown>
  updated_at?: string
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
  pathPrefix: string
  robots?: string | null
}) {
  const path = `${input.pathPrefix.replace(/\/$/, '')}/${encodeURIComponent(input.slug)}`
  return {
    title: input.seoTitle?.trim() || input.title.trim(),
    description: input.seoDescription?.trim() || input.excerpt?.trim() || '',
    canonicalUrl: input.canonicalUrl?.trim() || new URL(path, input.baseUrl).toString(),
    robots: input.robots?.trim() || 'index, follow',
  }
}

export function firstImageAssetId(blocks: EditorContentBlock[]) {
  const image = blocks.find(block => block.type === 'image' && block.data.status !== 'inactive')
  return image && typeof image.data.asset_id === 'string' ? image.data.asset_id : null
}

export function parseScheduledFor(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('scheduled_for must be an ISO 8601 datetime')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('scheduled_for must be an ISO 8601 datetime')
  return parsed.toISOString()
}

export function structuredComponentsFromBlocks(blocks: EditorContentBlock[]): Array<{
  type: 'faq' | 'how_to'
  position: number
  status: 'active'
  render_enabled: true
  schema_enabled: true
  data: { items: unknown[] } | { steps: unknown[] }
}> {
  const components: ReturnType<typeof structuredComponentsFromBlocks> = []
  blocks.forEach((block, position) => {
    if (block.type === 'faq') {
      const items = Array.isArray(block.data.items) ? block.data.items.filter(item => item && typeof item === 'object') : []
      components.push({ type: 'faq', position, status: 'active', render_enabled: true, schema_enabled: true, data: { items } })
    }
    if (block.type === 'how_to') {
      const steps = Array.isArray(block.data.steps) ? block.data.steps.filter(item => item && typeof item === 'object') : []
      components.push({ type: 'how_to', position, status: 'active', render_enabled: true, schema_enabled: true, data: { steps } })
    }
  })
  return components
}
