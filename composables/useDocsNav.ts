import { CATEGORY_SLUGS, categoryToSlug } from '~/utils/docs-categories'
import { docNavSectionFor, groupDocItemsByNavSectionAndGroup } from '~/utils/platform-content-nav'

interface PublicDoc {
  slug: string
  title: string
  category?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  nav_group?: string | null
  nav_group_order?: number | null
  hide_from_nav?: boolean | number | null
}

type DocWithNavMeta = PublicDoc & { categorySlug: string; label: string; path: string }

interface DocsNavSubgroup {
  group: string | null
  docs: DocWithNavMeta[]
}

interface DocsNavCategory {
  category: string
  categorySlug: string
  groups: DocsNavSubgroup[]
}

// Used by DocsSidebar's nav. Renders a curated Section → Group → Page hierarchy
// (max 3 levels) — docs support an optional nav_group subgroup within their
// nav_section; blog posts never get this (see useBlogNav, which stays flat).
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

    const sections = groupDocItemsByNavSectionAndGroup(
      eligible,
      (doc) => docNavSectionFor(doc.category, doc.nav_section),
      Object.keys(CATEGORY_SLUGS),
    )

    return sections.map(section => ({
      category: section.category,
      categorySlug: section.groups[0]?.items[0]?.categorySlug ?? '',
      groups: section.groups.map(subgroup => ({
        group: subgroup.group,
        docs: subgroup.items,
      })),
    }))
  })

  return { docs, categories }
}
