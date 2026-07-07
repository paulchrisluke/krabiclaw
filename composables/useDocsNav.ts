import { CATEGORY_SLUGS, categoryToSlug } from '~/utils/docs-categories'
import { docNavSectionFor, groupItemsByNavSection } from '~/utils/platform-content-nav'

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
    const eligible = docs.value
      .filter(doc => categoryToSlug(doc.category) && !doc.hide_from_nav)
      .map(doc => {
        const categorySlug = categoryToSlug(doc.category)!
        return {
          ...doc,
          categorySlug,
          path: doc.slug === categorySlug ? `/docs/${categorySlug}` : `/docs/${categorySlug}/${doc.slug}`,
        }
      })

    const groups = groupItemsByNavSection(
      eligible,
      (doc) => docNavSectionFor(doc.category, doc.nav_section),
      Object.keys(CATEGORY_SLUGS),
    )

    return groups.map(group => ({
      category: group.category,
      categorySlug: group.items[0]?.categorySlug ?? '',
      docs: group.items,
    }))
  })

  return { docs, categories }
}
