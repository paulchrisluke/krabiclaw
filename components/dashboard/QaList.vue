<template>
  <div class="space-y-6">
    <!-- Which page these questions belong to. A location's questions are its own; only the site's are filed by page. -->
    <div v-if="!locationId" class="flex justify-end">
      <USelect v-model="selectedPagePath" :items="pageScopes" class="w-48" aria-label="Q&A page scope" />
    </div>

  <DashboardListEditor
    v-model:editing="editing"
    title="Q&A"
    :description="locationId ? 'Add common guest questions, then answer them once.' : 'Manage general questions or questions tailored to a public page.'"
    :items="listItems"
    :pending="pending"
    :error="qaError ? getErrorMessage(qaError, 'Q&A request failed') : null"
    :empty-title="locationId ? 'No Q&A yet' : 'No site Q&A yet'"
    empty-icon="i-lucide-circle-help"
    add-label="Add a question"
    reorderable
    :removing-id="removingId"
    @add="openNew"
    @open="openExisting"
    @remove="removeItem"
    @move="move"
  >
    <template #item="{ item }">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="item.row.status === 'published' ? 'success' : 'neutral'" variant="soft">{{ item.row.status }}</UBadge>
        <span v-if="item.row.upvote_count" class="text-xs text-muted">{{ item.row.upvote_count }} upvotes</span>
      </div>
      <p class="mt-2 text-sm font-medium text-highlighted">{{ item.title }}</p>
      <p class="mt-1 line-clamp-2 text-sm text-muted" :class="item.row.answer ? '' : 'italic'">{{ item.row.answer || 'No answer yet.' }}</p>
    </template>
  </DashboardListEditor>
  </div>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import { isQaDeleted, isQaResponse, type QaRow } from '~/utils/site-qa'
/** Set when this list is a location's Q&A rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const dashboardApi = useDashboardApi()
const route = useRoute()
const siteId = await useDashboardSiteId()
const toast = useToast()
const selectedPagePath = ref('general')

const requestEvent = useRequestEvent()
const qaEndpoint = computed(() => props.locationId
  ? `/api/editor/sites/${siteId}/locations/${props.locationId}/qa`
  : `/api/editor/sites/${siteId}/qa`)

// The three reads are independent, so they are issued together.
const tenantPagesAsyncData = useAsyncData(
  () => `dashboard-tenant-pages-${siteId}`,
  async () => {
    if (props.locationId) return []
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getTenantPages }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/qa-dashboard'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getTenantPages(db, siteId)
    }
    return await dashboardApi<Array<{ path: string; title: string }>>(
      `/api/editor/sites/${siteId}/tenant-pages`,
      {
        validate: (value): value is Array<{ path: string; title: string }> =>
          Array.isArray(value)
          && value.every(page =>
            isRecord(page)
            && typeof page.path === 'string'
            && typeof page.title === 'string',
          ),
      },
    )
  },
)

const existingQaScopesAsyncData = useAsyncData(
  () => `dashboard-qa-scopes-${siteId}`,
  async () => {
    if (props.locationId) return []
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getQaScopes }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/qa-dashboard'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getQaScopes(db, siteId)
    }
    return await dashboardApi<Array<{ page_path: string | null }>>(
      `/api/editor/sites/${siteId}/qa/scopes`,
      {
        validate: (value): value is Array<{ page_path: string | null }> =>
          Array.isArray(value)
          && value.every(scope =>
            isRecord(scope)
            && (scope.page_path === null || typeof scope.page_path === 'string'),
          ),
      },
    )
  },
)

const pagePath = computed(() => selectedPagePath.value === 'general' ? null : selectedPagePath.value)
const qaAsyncData = useAsyncData(
  () => props.locationId ? `dashboard-location-qa-${siteId}-${props.locationId}` : `dashboard-site-qa-${siteId}-${selectedPagePath.value}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      if (props.locationId) {
        const { loadDashboardLocationQa } = await import('~/server/utils/dashboard-editor-resources')
        return await loadDashboardLocationQa(requestEvent, siteId, props.locationId)
      }
      const [{ cloudflareEnv }, { getSiteQa }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/qa-dashboard'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const qa = await getSiteQa(db, siteId, pagePath.value)
      return { qa }
    }
    return await dashboardApi<{ qa: QaRow[] }>(qaEndpoint.value, {
      query: pagePath.value ? { page_path: pagePath.value } : undefined,
      validate: isQaResponse,
    })
  },
)

const [
  { data: tenantPages },
  { data: existingQaScopes },
  { data, pending, refresh, error: qaError },
] = await Promise.all([tenantPagesAsyncData, existingQaScopesAsyncData, qaAsyncData])

const pageScopes = computed(() => {
  const scopes = new Map<string, string>()
  scopes.set('general', 'Whole site')

  for (const page of tenantPages.value ?? []) {
    if (page.path && !scopes.has(page.path)) {
      scopes.set(page.path, page.title || page.path)
    }
  }

  for (const scope of existingQaScopes.value ?? []) {
    if (scope.page_path && !scopes.has(scope.page_path)) {
      scopes.set(scope.page_path, scope.page_path)
    }
  }

  return Array.from(scopes.entries()).map(([value, label]) => ({ label, value }))
})
const qaRows = computed(() => data.value?.qa ?? [])
const listItems = computed(() => qaRows.value.map(row => ({ id: row.id, title: row.question, row })))

const editing = ref(false)
const removingId = ref<string | null>(null)

const qaPath = computed(() => props.locationId
  ? `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}/qa`
  : `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/qa`)

// A question opens its own level rather than a sheet over the list, so the
// record has a URL and adding and editing are the same screen. The page the
// list is filtered to rides along as the new record's intended scope.
function openNew() {
  void navigateTo({ path: `${qaPath.value}/new`, query: pagePath.value ? { page_path: pagePath.value } : undefined })
}

function openExisting(item: { id: string }) {
  void navigateTo(`${qaPath.value}/${item.id}`)
}

async function removeItem(item: { id: string }) {
  removingId.value = item.id
  try {
    await dashboardApi(`${qaEndpoint.value}/${item.id}`, {
      method: 'DELETE',
      query: pagePath.value ? { page_path: pagePath.value } : undefined,
      validate: isQaDeleted,
    })
    await refresh()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to remove question', color: 'error' })
  } finally {
    removingId.value = null
  }
}

async function move(item: { id: string }, direction: -1 | 1) {
  const index = qaRows.value.findIndex(row => row.id === item.id)
  const current = qaRows.value[index]
  const target = qaRows.value[index + direction]
  if (!current || !target) return
  await dashboardApi(`${qaEndpoint.value}/reorder`, {
    method: 'POST',
    body: { ...(props.locationId ? {} : { page_path: pagePath.value }), updates: [{ id: current.id, sort_order: target.sort_order }, { id: target.id, sort_order: current.sort_order }] },
    validate: (value): value is { updated: number } =>
      isRecord(value) && typeof value.updated === 'number',
  })
  await refresh()
}

// Switching scope shows a different list, so the edit state goes with it.
watch(selectedPagePath, () => {
  editing.value = false
})
</script>
