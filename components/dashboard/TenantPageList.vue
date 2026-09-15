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
    @add="openNew"
    @open="open"
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
import { isTenantPageListResponse, type TenantPageListRow } from '~/composables/useTenantPageDraft'

const route = useRoute()
const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
const pagesPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages`)

const { data, pending, error } = await useAsyncData(
  `tenant-pages-${siteId}`,
  () => dashboardApi<{ pages: TenantPageListRow[] }>(`/api/editor/sites/${siteId}/pages`, { validate: isTenantPageListResponse }),
  { server: false },
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
  })))

function openNew() {
  void navigateTo(`${pagesPath.value}/new`)
}

function open(item: { id: string }) {
  void navigateTo(`${pagesPath.value}/${item.id}`)
}
</script>
