<template>
  <div class="space-y-6">
    <!-- The section's own actions. Its title and the way back belong to
         the shell, which renders them once for whichever section is open. -->
    <div class="flex flex-wrap items-center justify-end gap-2">
    <UButton v-if="sitePaths" :to="`${sitePaths.pages}/new`" icon="i-lucide-plus" label="New page" />
    </div>

  <div class="mx-auto w-full max-w-4xl space-y-5">
    <UAlert v-if="loadError" color="error" variant="soft" title="Pages unavailable" :description="loadError" />
    <div v-else-if="loading" class="space-y-2">
      <USkeleton v-for="index in 5" :key="index" class="h-16 rounded-xl" />
    </div>
    <div v-else-if="sitePaths && visiblePages.length" class="overflow-hidden rounded-2xl border border-default bg-default">
      <NuxtLink
        v-for="page in visiblePages"
        :key="page.id"
        :to="`${sitePaths.pages}/${page.id}`"
        class="flex min-h-16 items-center gap-4 border-b border-default px-4 last:border-0 hover:bg-elevated"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-highlighted">{{ page.path === '/' ? 'Home' : page.title }}</p>
          <p class="mt-0.5 truncate text-xs text-muted">{{ page.path === '/' ? 'Homepage' : page.path }}</p>
        </div>
        <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
      </NuxtLink>
    </div>
    <UCard v-else>
      <div class="py-12 text-center">
        <UIcon name="i-lucide-file-plus-2" class="mx-auto size-9 text-muted" />
        <h2 class="mt-4 font-semibold text-highlighted">Create your first page</h2>
        <UButton v-if="sitePaths" :to="`${sitePaths.pages}/new`" class="mt-5" icon="i-lucide-plus" label="New page" />
      </div>
    </UCard>
  </div>
  </div>
</template>

<script setup lang="ts">
import type { TenantPageType } from '~/utils/tenant-page-blocks'

interface PageSummary {
  id: string
  title: string
  path: string
  page_type: TenantPageType
  recipe: string | null
  locale: string
  sort_order: number
  updated_at: string
}

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 503, statusMessage: 'Dashboard site context unavailable' })

const dashboardApi = useDashboardApi()
const { sitePaths } = useDashboardSiteLinks()
const pages = ref<PageSummary[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const managedPageRecipes = new Set(['locations', 'menu', 'order', 'products', 'reservations', 'qa', 'reviews', 'posts', 'photos', 'blog', 'services', 'pricing', 'donate', 'schedule'])
const visiblePages = computed(() => pages.value
  .filter(page => (!page.recipe || !managedPageRecipes.has(page.recipe)) && !page.path.startsWith('/locations/'))
  .sort((left, right) => Number(right.path === '/') - Number(left.path === '/')))

function validateList(value: unknown): value is { pages: PageSummary[] } {
  return isRecord(value)
    && Array.isArray(value.pages)
    && value.pages.every(page => isRecord(page) && typeof page.id === 'string' && typeof page.title === 'string' && typeof page.path === 'string')
}

async function loadPages() {
  loading.value = true
  loadError.value = null
  try {
    const pagesResponse = await dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages`, { validate: validateList })
    pages.value = pagesResponse.pages
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load pages'
  } finally {
    loading.value = false
  }
}
onMounted(() => void loadPages())
</script>
