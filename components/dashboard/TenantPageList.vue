<template>
  <DashboardListEditor
    title="Pages"
    description="The pages of your site that you write yourself."
    :items="listItems"
    empty-title="No pages yet"
    empty-icon="i-lucide-file-text"
    add-label="Add a page"
    :pending="pending"
    :error="loadError"
    :removing-id="removingId"
    @add="openNew"
    @open="open"
    @remove="remove"
  >
    <template #item="{ item }">
      <button type="button" class="block w-full text-left" @click="open(item)">
        <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
        <p class="mt-1 truncate text-sm text-muted">{{ item.summary }}</p>
      </button>
    </template>
  </DashboardListEditor>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import { isRecord } from '~/utils/api-clients'
import { isTenantPageListResponse, type TenantPageListRow } from '~/composables/useTenantPageDraft'

const route = useRoute()
const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
const pagesPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages`)

const requestEvent = useRequestEvent()
const { data, pending, error, refresh } = await useAsyncData(
  `tenant-pages-${siteId}`,
  async () => {
    // On the server the list is read straight from D1; going back out over HTTP
    // to our own endpoint would cost a round trip during render, and rendering
    // the empty state server-side only to replace it on the client is a
    // hydration mismatch the visitor sees flash.
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardTenantPages } = await import('~/server/utils/dashboard-editor-resources')
      const resource = await loadDashboardTenantPages(requestEvent, siteId)
      return { pages: resource.pages as unknown as TenantPageListRow[] }
    }
    return await dashboardApi<{ pages: TenantPageListRow[] }>(`/api/editor/sites/${siteId}/pages`, { validate: isTenantPageListResponse })
  },
  { lazy: import.meta.client },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Failed to load pages') : null))

/**
 * Pages a manager already owns are edited there, not here: a location's page
 * belongs to the location, and a recipe page is the Menu, the Q&A or the Blog
 * seen from the other side. Listing them again would offer two ways to edit one
 * thing, and the second one would not know what the first one means.
 */
const MANAGED_PAGE_RECIPES = new Set([
  'locations', 'menu', 'order', 'products', 'reservations', 'qa', 'reviews',
  'posts', 'photos', 'blog', 'services', 'pricing', 'donate', 'schedule',
])

const listItems = computed(() => (data.value?.pages ?? [])
  .filter(page => (!page.recipe || !MANAGED_PAGE_RECIPES.has(page.recipe)) && !page.path.startsWith('/locations/'))
  // The front page first, wherever its title sorts.
  .sort((left, right) => Number(right.path === '/') - Number(left.path === '/'))
  .map(page => ({
    id: page.id,
    title: page.path === '/' ? 'Home' : page.title,
    summary: page.path === '/' ? 'Homepage' : page.path,
    // Stated by the server, not recomputed here: a page the template renders a
    // document at cannot be removed, and a rule copied into the client drifts
    // from the one the endpoint enforces.
    removable: page.removable,
  })))

function openNew() {
  void navigateTo(`${pagesPath.value}/new`)
}

function open(item: { id: string }) {
  void navigateTo(`${pagesPath.value}/${item.id}`)
}

const removingId = ref<string | null>(null)
const toast = useToast()

/**
 * Remove a page and everything under it. The hub owns adding and removing a
 * record; the leaf edits the one it was opened on (DESIGN.md).
 *
 * The server refuses the pages that may not go -- a system page, and a path the
 * template renders a document at -- so this reports what it said rather than
 * keeping a second copy of the rule that would drift from it.
 */
async function remove(item: { id: string }) {
  removingId.value = item.id
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/pages/${item.id}`, { method: 'DELETE', validate: isRecord })
    await refresh()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to remove the page'), color: 'error' })
  } finally {
    removingId.value = null
  }
}
</script>
