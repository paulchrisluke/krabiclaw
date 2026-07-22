import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { PublicSearchResult } from '~/server/utils/public-search'

interface SearchResponse {
  results: PublicSearchResult[]
}

const RESULT_GROUP_LABEL: Record<PublicSearchResult['type'], string> = {
  doc: 'Guides',
  blog: 'Articles',
  faq: 'Help answers',
  route: 'Quick links',
  platform_page: 'Pages',
  dashboard_route: 'Dashboard',
}

/** Drives UDashboardSearch in layouts/dashboard.vue — debounced server-side search
 *  against /api/public/search (the same endpoint and result grouping the Saya/Blawby
 *  tenant search modal uses), scoped to the current org/site/location route context. */
export function useDashboardSearch() {
  const route = useRoute()
  const router = useRouter()
  const searchTerm = ref('')
  const loading = ref(false)
  const groups = ref<CommandPaletteGroup[]>([])

  let debounceHandle: ReturnType<typeof setTimeout> | null = null
  let requestSequence = 0

  function groupResults(results: PublicSearchResult[]): CommandPaletteGroup[] {
    const byLabel = new Map<string, CommandPaletteItem[]>()
    for (const result of results) {
      const label = RESULT_GROUP_LABEL[result.type] ?? 'Results'
      const items = byLabel.get(label) ?? []
      items.push({
        id: result.id,
        label: result.title,
        suffix: result.snippet,
        icon: result.icon,
        onSelect: () => { router.push(result.path) },
      })
      byLabel.set(label, items)
    }
    // Results are already server-filtered against searchTerm — ignoreFilter stops
    // CommandPalette's own client-side Fuse re-filtering from hiding relevant
    // matches the server already decided to return.
    return [...byLabel.entries()].map(([label, items]) => ({ id: label, label, items, ignoreFilter: true }))
  }

  async function runSearch() {
    const normalized = searchTerm.value.trim()
    if (!normalized) {
      requestSequence += 1
      groups.value = []
      loading.value = false
      return
    }

    const requestId = ++requestSequence
    loading.value = true
    try {
      const response = await $fetch<SearchResponse>('/api/public/search', {
        query: {
          q: normalized,
          surface: 'dashboard',
          orgSlug: typeof route.params.orgSlug === 'string' ? route.params.orgSlug : '',
          siteSlug: typeof route.params.siteSlug === 'string' ? route.params.siteSlug : '',
          locationSlug: typeof route.params.locationSlug === 'string' ? route.params.locationSlug : '',
        },
      })
      if (requestId !== requestSequence) return
      groups.value = groupResults(response.results ?? [])
    } catch (error) {
      if (requestId !== requestSequence) return
      console.error('Dashboard search failed:', error)
      groups.value = []
    } finally {
      if (requestId === requestSequence) loading.value = false
    }
  }

  watch(searchTerm, () => {
    if (debounceHandle) clearTimeout(debounceHandle)
    debounceHandle = setTimeout(() => { void runSearch() }, 120)
  })

  onBeforeUnmount(() => {
    if (debounceHandle) clearTimeout(debounceHandle)
  })

  return { searchTerm, loading, groups }
}
