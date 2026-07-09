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

interface NavGroupable {
  title: string
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
}

export interface NavGroup<T> {
  category: string
  order: number
  items: Array<T & { label: string; order: number }>
}

/**
 * Groups items (blog posts, docs, ...) into nav sections and sorts both the sections and the
 * items within each section — shared by useBlogNav/useDocsNav so the ordering rules (explicit
 * order first, then legacy category position, then alpha) only live in one place.
 */
export function groupItemsByNavSection<T extends NavGroupable>(
  items: T[],
  getSection: (_item: T) => string,
  legacyOrder: readonly string[],
): Array<NavGroup<T>> {
  const byCategory = new Map<string, NavGroup<T>>()
  for (const item of items) {
    if (item.hide_from_nav) continue
    const section = getSection(item)
    if (!section) continue
    const sectionOrder = navSectionOrderFor(section, item.nav_section_order)
    const group = byCategory.get(section) ?? { category: section, order: sectionOrder, items: [] }
    group.order = Math.min(group.order, sectionOrder)
    group.items.push({
      ...item,
      label: navTitleFor(item.title, item.nav_title),
      order: item.nav_order ?? 999999,
    })
    byCategory.set(section, group)
  }

  const legacyRank = (category: string) => {
    const index = legacyOrder.indexOf(category)
    return index === -1 ? 999 : index
  }
  return Array.from(byCategory.values())
    .sort((a, b) =>
      a.order - b.order
      || legacyRank(a.category) - legacyRank(b.category)
      || a.category.localeCompare(b.category)
    )
    .map(group => ({
      ...group,
      items: group.items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
}

interface DocNavGroupable extends NavGroupable {
  nav_group?: string | null
  nav_group_order?: number | null
}

export interface DocNavSubgroup<T> {
  group: string | null
  order: number
  items: Array<T & { label: string; order: number }>
}

export interface DocNavSection<T> {
  category: string
  order: number
  groups: Array<DocNavSubgroup<T>>
}

/**
 * Docs-only: further partitions each nav section's items into an optional collapsible
 * subgroup (nav_group), giving a curated Section → Group → Page hierarchy (max 3 levels).
 * Ungrouped items (no nav_group) render directly under the section, ahead of named subgroups.
 * Blog posts must stay flat — do not route blog nav through this function, use
 * groupItemsByNavSection directly (see useBlogNav).
 */
export function groupDocItemsByNavSectionAndGroup<T extends DocNavGroupable>(
  items: T[],
  getSection: (_item: T) => string,
  legacyOrder: readonly string[],
): Array<DocNavSection<T>> {
  const sections = groupItemsByNavSection(items, getSection, legacyOrder)
  return sections.map((section) => {
    const bySubgroup = new Map<string | null, DocNavSubgroup<T>>()
    for (const item of section.items) {
      const groupLabel = item.nav_group?.trim() || null
      const groupOrder = typeof item.nav_group_order === 'number' ? item.nav_group_order : 999999
      const existing = bySubgroup.get(groupLabel)
      if (existing) {
        existing.order = Math.min(existing.order, groupOrder)
        existing.items.push(item)
      } else {
        bySubgroup.set(groupLabel, { group: groupLabel, order: groupOrder, items: [item] })
      }
    }
    const groups = Array.from(bySubgroup.values()).sort((a, b) => {
      if (a.group === null && b.group !== null) return -1
      if (a.group !== null && b.group === null) return 1
      return a.order - b.order || (a.group ?? '').localeCompare(b.group ?? '')
    })
    return { category: section.category, order: section.order, groups }
  })
}
