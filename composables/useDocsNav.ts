import { CATEGORY_SLUGS, categoryToSlug } from '~/utils/docs-categories'

interface PublicDoc {
  slug: string
  title: string
  category?: string | null
}

interface DocsNavCategory {
  category: string
  categorySlug: string
  docs: PublicDoc[]
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

  // Grouped in the canonical category order (CATEGORY_SLUGS), not API order,
  // so nav ordering is stable regardless of how docs were authored.
  const categories = computed<DocsNavCategory[]>(() => {
    const byCategory = new Map<string, PublicDoc[]>()
    for (const doc of docs.value) {
      if (!doc.category) continue
      const list = byCategory.get(doc.category) ?? []
      list.push(doc)
      byCategory.set(doc.category, list)
    }

    return Object.keys(CATEGORY_SLUGS)
      .filter(category => byCategory.has(category))
      .map(category => ({
        category,
        categorySlug: categoryToSlug(category)!,
        docs: byCategory.get(category)!,
      }))
  })

  return { docs, categories }
}
