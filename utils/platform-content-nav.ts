export const PLATFORM_DOC_NAV_SECTIONS = [
  { label: 'Getting Started', order: 10 },
  { label: 'Editing Your Site', order: 20 },
  { label: 'Business Operations', order: 30 },
  { label: 'Integrations', order: 40 },
  { label: 'Advanced', order: 50 },
] as const

export const PLATFORM_DOC_NAV_SECTION_LABELS = PLATFORM_DOC_NAV_SECTIONS.map(section => section.label)

const DOC_SECTION_ORDER = new Map<string, number>(PLATFORM_DOC_NAV_SECTIONS.map(section => [section.label, section.order]))
const DOC_CATEGORY_SECTION: Record<string, string> = {
  'Getting Started': 'Getting Started',
  'Menu Management': 'Editing Your Site',
  'Theme Customization': 'Editing Your Site',
  'SEO & Marketing': 'Business Operations',
  Integrations: 'Integrations',
  Advanced: 'Advanced',
}

const DEFAULT_SECTION_ORDER = 9000
const DEFAULT_NAV_LABEL = 'More'

export function docNavSectionFor(category: string | null | undefined, navSection: string | null | undefined) {
  const explicit = navSection?.trim()
  if (explicit) return explicit
  if (category) return DOC_CATEGORY_SECTION[category] ?? category
  return DEFAULT_NAV_LABEL
}

export function navSectionOrderFor(section: string | null | undefined, explicitOrder?: number | null) {
  if (typeof explicitOrder === 'number') return explicitOrder
  if (!section) return DEFAULT_SECTION_ORDER
  return DOC_SECTION_ORDER.get(section) ?? DEFAULT_SECTION_ORDER
}

export function navTitleFor(title: string, navTitle: string | null | undefined) {
  return navTitle?.trim() || title
}
