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
import { isTenantPageListResponse, tenantPageRows, type TenantPageListRow } from '~/composables/useTenantPageDraft'

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

const listItems = computed(() => tenantPageRows(data.value?.pages ?? []))

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
