import { CATEGORY_SLUGS, categoryToSlug } from '~/utils/docs-categories'
import { docNavSectionFor, navSectionOrderFor, navTitleFor } from '~/utils/platform-content-nav'

interface PublicDoc {
  slug: string
  title: string
  category?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
}

interface DocsNavCategory {
  category: string
  categorySlug: string
  docs: Array<PublicDoc & { categorySlug: string; label: string; path: string }>
}

// Shared by PlatformHeader's "Docs" dropdown (rendered on every page, so the
// dropdown works from anywhere on the site) and DocsSidebar's nav — both need
// the same published-docs-grouped-by-category shape, and Nuxt's useFetch
// dedupes the underlying request by URL, so mounting both on a docs page
// only issues one fetch.
export function useDocsNav() {
  const { data } = useFetch<{ docs: PublicDoc[] }>('/api/public/docs', {
    default: () => ({ docs: [] }),
  })

  const docs = computed(() => data.value?.docs || [])

  // Grouped by editorial nav metadata, with category fallback preserving
  // stable URLs and ordering for older docs that predate nav fields.
  const categories = computed<DocsNavCategory[]>(() => {
    const byCategory = new Map<string, {
      category: string
      categorySlug: string
      order: number
      docs: Array<PublicDoc & { categorySlug: string; label: string; order: number; path: string }>
    }>()
    for (const doc of docs.value) {
      if (doc.hide_from_nav) continue
      const categorySlug = categoryToSlug(doc.category)
      if (!categorySlug) continue
      const section = docNavSectionFor(doc.category, doc.nav_section)
      const group = byCategory.get(section) ?? {
        category: section,
        categorySlug,
        order: navSectionOrderFor(section, doc.nav_section_order),
        docs: [],
      }
      group.order = Math.min(group.order, navSectionOrderFor(section, doc.nav_section_order))
      group.docs.push({
        ...doc,
        categorySlug,
        label: navTitleFor(doc.title, doc.nav_title),
        order: doc.nav_order ?? 999999,
        path: `/docs/${categorySlug}/${doc.slug}`,
      })
      byCategory.set(section, group)
    }

    const legacyOrder = Object.keys(CATEGORY_SLUGS)
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
        category: group.category,
        categorySlug: group.categorySlug,
        docs: group.docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
  })

  return { docs, categories }
}
