import { CATEGORY_SLUGS, categoryToSlug } from '~/utils/docs-categories'
import { docNavSectionFor, groupDocItemsByNavSectionAndGroup } from '~/utils/platform-content-nav'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

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

interface PublicDocsResponse {
  docs: PublicDoc[]
}

const isPublicDocsResponse = (value: unknown): value is PublicDocsResponse =>
  isRecord(value)
  && Array.isArray(value.docs)
  && value.docs.every((doc) => isRecord(doc) && typeof doc.slug === 'string' && typeof doc.title === 'string')

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
export async function useDocsNav() {
  const { data, pending, error } = await useAsyncData<PublicDocsResponse>('public-docs-index', async () => {
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { listPlatformDocs }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 503, statusMessage: 'Documentation data is temporarily unavailable' })
      return { docs: await listPlatformDocs(db, 'published') as PublicDoc[] }
    }
    return await publicApiRequest<PublicDocsResponse>('/api/public/docs', {
      validate: isPublicDocsResponse,
    })
  }, { server: true, lazy: false })

  if (error.value) throw error.value

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

  return { data, docs, categories, pending, error }
}
