<template>
  <div class="space-y-6">
    <!-- Which page these questions belong to. A location's questions are its own; only the site's are filed by page. -->
    <div v-if="!locationId" class="flex justify-end">
      <USelect v-model="selectedPagePath" :items="pageScopes" class="w-48" aria-label="Q&A page scope" />
    </div>

  <DashboardListEditor
    read-only
    title="Q&A"
    description="Questions and answers are read-only. Manage Google questions and answers in Google."
    :items="listItems"
    :pending="pending"
    :error="qaError ? getErrorMessage(qaError, 'Q&A request failed') : null"
    :empty-title="locationId ? 'No Q&A yet' : 'No site Q&A yet'"
    empty-icon="i-lucide-circle-help"
  >
    <template #item="{ item }">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="item.row.status === 'published' ? 'success' : 'neutral'" variant="soft">{{ item.row.status }}</UBadge>
        <span v-if="item.row.upvote_count" class="text-xs text-muted">{{ item.row.upvote_count }} upvotes</span>
      </div>
      <p class="mt-2 text-sm font-medium text-highlighted">{{ item.title }}</p>
      <p class="mt-1 text-sm text-muted" :class="item.row.answer ? '' : 'italic'">{{ item.row.answer || 'No answer yet.' }}</p>
    </template>
  </DashboardListEditor>
  </div>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import { isQaResponse, type QaRow } from '~/utils/site-qa'
/** Set when this list is a location's Q&A rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
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
  { data, pending, error: qaError },
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

</script>
