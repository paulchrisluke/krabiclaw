import { sanitizeUrl } from './sanitize.ts'
import type { ContentComponentType } from './content-component-resolver.ts'

export interface ContentFaqItem {
  question?: string | null
  answer?: string | null
  position?: number | null
}

export interface ContentHowToStep {
  name?: string | null
  text?: string | null
  url?: string | null
  image_public_url?: string | null
  image_width?: number | null
  image_height?: number | null
  position?: number | null
}

interface ContentComponentBase {
  type: ContentComponentType
  label?: string | null
  status?: 'active' | 'inactive' | null
  render_enabled?: boolean | null
  schema_enabled?: boolean | null
  position?: number | null
}

export interface ContentFaqComponent extends ContentComponentBase {
  type: 'faq'
  data?: {
    items?: ContentFaqItem[] | null
  } | null
}

export interface ContentHowToComponent extends ContentComponentBase {
  type: 'how_to'
  data?: {
    steps?: ContentHowToStep[] | null
    estimated_time?: string | null
    tool_items?: string[] | null
    supply_items?: string[] | null
  } | null
}

export type ContentComponent = ContentFaqComponent | ContentHowToComponent

export interface ContentFaqSectionProps {
  label?: string | null
  items: Array<{
    question: string
    answerHtml: string
  }>
}

export interface ContentHowToSectionProps {
  label?: string | null
  estimatedTime?: string | null
  toolItems?: string[]
  supplyItems?: string[]
  steps: Array<{
    name: string
    url: string | null
    image_public_url: string | null
    image_width?: number | null
    image_height?: number | null
    textHtml: string
  }>
}

export type NormalizedContentComponent =
  | { type: 'faq'; position: number; props: ContentFaqSectionProps; source: ContentComponent }
  | { type: 'how_to'; position: number; props: ContentHowToSectionProps; source: ContentComponent }

export type ContentBlock =
  | { kind: 'html'; html: string }
  | { kind: 'component'; type: ContentComponentType; props: ContentFaqSectionProps | ContentHowToSectionProps; component: ContentComponent }

const COMPONENT_EMBED_REGEX = /\{\{\s*component\s+type\s*=\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+))\s*\}\}/g

function sortByPosition<T extends { position?: number | null }>(items: T[]) {
  return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

export function normalizeContentComponent(
  component: ContentComponent,
  renderMarkdown: (_markdown: string) => string,
): NormalizedContentComponent | null {
  if (component.render_enabled === false) return null
  if (component.status != null && component.status !== 'active') return null

  if (component.type === 'faq') {
    const items = sortByPosition(component.data?.items ?? [])
      .filter(item => item.question?.trim() && item.answer?.trim())
      .map(item => ({
        question: item.question!.trim(),
        answerHtml: renderMarkdown(item.answer!.trim()),
      }))

    if (!items.length) return null

    return {
      type: 'faq',
      position: component.position ?? 0,
      source: component,
      props: {
        label: component.label,
        items,
      },
    }
  }

  const steps = sortByPosition(component.data?.steps ?? [])
    .filter(step => step.name?.trim() && step.text?.trim())
    .map(step => ({
      name: step.name!.trim(),
      url: sanitizeUrl(step.url),
      image_public_url: sanitizeUrl(step.image_public_url),
      image_width: step.image_width ?? null,
      image_height: step.image_height ?? null,
      textHtml: renderMarkdown(step.text!.trim()),
    }))

  if (!steps.length) return null

  return {
    type: 'how_to',
    position: component.position ?? 0,
    source: component,
    props: {
      label: component.label,
      estimatedTime: component.data?.estimated_time ?? null,
      toolItems: (component.data?.tool_items ?? []).filter(Boolean) as string[],
      supplyItems: (component.data?.supply_items ?? []).filter(Boolean) as string[],
      steps,
    },
  }
}

export function buildContentBlocks(
  body: string,
  components: ContentComponent[],
  renderMarkdown: (_markdown: string) => string,
): ContentBlock[] {
  const normalized = components
    .map(component => normalizeContentComponent(component, renderMarkdown))
    .filter((component): component is NormalizedContentComponent => Boolean(component))

  const componentQueues = {
    faq: normalized.filter(component => component.type === 'faq').sort((a, b) => a.position - b.position),
    how_to: normalized.filter(component => component.type === 'how_to').sort((a, b) => a.position - b.position),
  }

  const blocks: ContentBlock[] = []
  let cursor = 0

  for (const match of body.matchAll(COMPONENT_EMBED_REGEX)) {
    const fullMatch = match[0]
    const matchIndex = match.index ?? 0
    const prose = body.slice(cursor, matchIndex)

    if (prose.trim()) {
      blocks.push({ kind: 'html', html: renderMarkdown(prose) })
    }

    const rawType = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    const type = rawType === 'faq' || rawType === 'how_to' ? rawType : null
    if (type) {
      const nextComponent = componentQueues[type].shift()
      if (nextComponent) {
        blocks.push({
          kind: 'component',
          type,
          props: nextComponent.props,
          component: nextComponent.source,
        })
      }
    }

    cursor = matchIndex + fullMatch.length
  }

  const trailingProse = body.slice(cursor)
  if (trailingProse.trim()) {
    blocks.push({ kind: 'html', html: renderMarkdown(trailingProse) })
  }

  return blocks
}
