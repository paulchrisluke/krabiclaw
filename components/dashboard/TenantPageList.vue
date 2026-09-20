<template>
  <div class="space-y-4">
  <DashboardListEditor
    title="Pages"
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
  <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="deleteError" />
  </div>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import { isRecord } from '~/utils/api-clients'
import { isTenantPageListResponse, type TenantPageListRow } from '~/composables/useTenantPageDraft'

const route = useRoute()
const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const pagesPath = computed(() => `${sitePath.value}/pages`)

const { data, pending, error, refresh } = await useAsyncData(
  `tenant-pages-${siteId}`,
  () => dashboardApi<{ pages: TenantPageListRow[] }>(`/api/editor/sites/${siteId}/pages`, { validate: isTenantPageListResponse }),
  { lazy: true },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Failed to load pages') : null))

/**
 * Pages a manager already owns are edited there, not here: a location's page
 * belongs to the location, and a recipe page is the Menu, the Q&A or the Blog
 * seen from the other side. Listing them again would offer two ways to edit one
 * thing, and the second one would not know what the first one means.
 */
const MANAGED_PAGE_RECIPES = new Set([
  'locations', 'menu', 'products', 'reservations', 'qa', 'reviews',
  'posts', 'photos', 'blog', 'services', 'pricing', 'donate', 'schedule',
])

// The links page leads: it is the page a tenant shares most, and it opens its
// own editor rather than the block editor. It is listed before its row exists,
// because the editor creates the row on the first save.
const LINKS_PAGE = { id: 'links', recipe: 'links', title: 'Links page', summary: '/links', removable: false, updatedAt: '' }

const listItems = computed(() => {
  const pages = (data.value?.pages ?? [])
    .filter(page => (!page.recipe || !MANAGED_PAGE_RECIPES.has(page.recipe)) && !page.path.startsWith('/locations/'))
  const links = pages.find(page => page.recipe === 'links')
  return [
    links ? { ...LINKS_PAGE, id: links.id, updatedAt: links.updated_at } : LINKS_PAGE,
    ...pages
      .filter(page => page.recipe !== 'links')
      // The front page first, wherever its title sorts.
      .sort((left, right) => Number(right.path === '/') - Number(left.path === '/'))
      .map(page => ({
        id: page.id,
        recipe: page.recipe ?? null,
        title: page.path === '/' ? 'Home' : page.title,
        summary: page.path === '/' ? 'Homepage' : page.path,
        // Stated by the server, not recomputed here: a page the template renders a
        // document at cannot be removed, and a rule copied into the client drifts
        // from the one the endpoint enforces.
        removable: page.removable,
        // The delete endpoint takes the timestamp the row was last seen at, so a
        // page someone else changed in the meantime conflicts instead of going.
        updatedAt: page.updated_at,
      })),
  ]
})

function openNew() {
  void navigateTo(`${pagesPath.value}/new`)
}

function open(item: { id: string; recipe: string | null }) {
  void navigateTo(item.recipe === 'links' ? `${sitePath.value}/links` : `${pagesPath.value}/${item.id}`)
}

const removingId = ref<string | null>(null)
const deleteError = ref<string | null>(null)

/**
 * Remove a page and everything under it. The hub owns adding and removing a
 * record; the leaf edits the one it was opened on (DESIGN.md).
 *
 * The server refuses the pages that may not go -- a system page, and a path the
 * template renders a document at -- so this reports what it said rather than
 * keeping a second copy of the rule that would drift from it.
 */
async function remove(item: { id: string; updatedAt: string }) {
  removingId.value = item.id
  deleteError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/pages/${item.id}`, {
      method: 'DELETE',
      body: { expectedUpdatedAt: item.updatedAt },
      validate: isRecord,
    })
    await refresh()
  } catch (error) {
    deleteError.value = getErrorMessage(error, 'Failed to remove the page')
  } finally {
    removingId.value = null
  }
}
</script>
