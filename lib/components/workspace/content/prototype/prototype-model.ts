import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlock, type TenantPageBlockType } from '~/utils/tenant-page-blocks'
import { tenantPageBlockSummary } from '~/utils/tenant-page-editor'

export type PrototypeVariantKey = 'A' | 'B' | 'C'

export interface PrototypeVariant {
  key: PrototypeVariantKey
  name: string
}

export interface PrototypeSection {
  id: string
  type: TenantPageBlockType
  label: string
  description: string
  summary: string
  body: string
  icon: string
  mediaUrl: string | null
  mediaAlt: string
}

export interface PrototypePageView {
  title: string
  summary: string
  locale: string
  path: string
  dirty: boolean
  sections: PrototypeSection[]
}

export type PrototypeEditorKind = 'text' | 'textarea' | 'readonly'

export interface PrototypeEditorField {
  key: string
  label: string
  value: string
  kind: PrototypeEditorKind
}

export const PROTOTYPE_VARIANTS: readonly PrototypeVariant[] = [
  { key: 'A', name: 'Visual outline' },
  { key: 'B', name: 'Editorial canvas' },
  { key: 'C', name: 'Visual storyboard' },
]

const BLOCK_ICONS: Record<TenantPageBlockType, string> = {
  heading: 'i-lucide-heading',
  markdown: 'i-lucide-align-left',
  image: 'i-lucide-image',
  gallery: 'i-lucide-images',
  faq: 'i-lucide-messages-square',
  divider: 'i-lucide-minus',
  cta: 'i-lucide-mouse-pointer-click',
  callout: 'i-lucide-megaphone',
  hero: 'i-lucide-panels-top-left',
  button_group: 'i-lucide-gallery-horizontal',
  feature_grid: 'i-lucide-layout-grid',
  testimonial_grid: 'i-lucide-quote',
  contact_cta: 'i-lucide-mail',
  booking_cta: 'i-lucide-calendar-check',
  donation_choices: 'i-lucide-heart-handshake',
  offering_grid: 'i-lucide-layout-dashboard',
  location_grid: 'i-lucide-map-pin',
}

export function parsePrototypeVariant(value: unknown): PrototypeVariantKey {
  if (value === 'B' || value === 'C') return value
  return 'A'
}

export function createPrototypePageView(input: {
  title: string
  summary: string
  locale: string
  path: string
  dirty: boolean
  blocks: TenantPageBlock[]
}): PrototypePageView {
  return {
    title: input.title,
    summary: input.summary,
    locale: input.locale,
    path: input.path,
    dirty: input.dirty,
    sections: input.blocks.map(block => {
      const definition = TENANT_PAGE_BLOCK_REGISTRY[block.type]
      const media = block.media[0]
      const body = firstString(block.data, ['markdown', 'body', 'text', 'subtitle', 'description', 'title'])
      return {
        id: block.id,
        type: block.type,
        label: definition.label,
        description: definition.description,
        summary: tenantPageBlockSummary(block),
        body,
        icon: BLOCK_ICONS[block.type],
        mediaUrl: media?.thumbnail_url ?? media?.public_url ?? null,
        mediaAlt: media?.alt_text?.trim() || definition.label,
      }
    }),
  }
}

function firstString(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
