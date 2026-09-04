<template>
  <UDashboardPanel id="site-qa">
    <template #header>
      <UDashboardNavbar title="Site" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading v-if="sitePaths" :to="sitePaths.site" label="Site" />
        </template>
        <template #trailing>
          <USelect v-model="selectedPagePath" :items="pageScopes" class="w-48" aria-label="Q&A page scope" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DashboardListEditor
        v-model:editing="editing"
        title="Q&A"
        description="Manage general questions or questions tailored to a public page."
        :items="listItems"
        :pending="pending"
        :error="qaError ? getErrorMessage(qaError, 'Q&A request failed') : null"
        empty-title="No site Q&A yet"
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
          <p class="text-sm font-medium text-highlighted">{{ item.title }}</p>
          <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
        </template>
      </DashboardListEditor>

      <DashboardListItemDialog
        v-model:open="dialogOpen"
        :title="editingId ? 'Edit question' : 'Add a question'"
        :removable="Boolean(editingId)"
        :saving="saving"
        :removing="removingId === editingId"
        :save-disabled="!form.question.trim()"
        @save="save"
        @remove="removeEditing"
      >
        <UFormField label="Question"><UTextarea v-model="form.question" :rows="3" autofocus class="w-full" /></UFormField>
        <UFormField label="Answer"><UTextarea v-model="form.answer" :rows="6" class="w-full" /></UFormField>
        <UCheckbox v-model="form.published" label="Published" />
      </DashboardListItemDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import { getErrorMessage } from '~/utils/errors'
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.qa' })

const { sitePaths } = useDashboardSiteLinks()
useSeoMeta({ title: 'Site Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface QaRow {
  id: string
  question: string
  answer: string | null
  status: 'published' | 'hidden'
  sort_order: number
  page_path: string | null
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const saving = ref(false)
const selectedPagePath = ref('general')

const STANDARD_ROUTES = ['/', '/about', '/services', '/pricing', '/contact', '/schedule', '/blog', '/donate'] as const

const requestEvent = useRequestEvent()
// tenantPages, existingQaScopes, and the main qa query below are independent of
// each other (none reads another's result) — issue them together instead of
// sequentially awaiting each one, which otherwise turns three independent
// requests into a waterfall during SSR.
const tenantPagesAsyncData = useAsyncData(
  () => `dashboard-tenant-pages-${siteId}`,
  async () => {
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
const form = reactive({ question: '', answer: '', published: true })
const qaAsyncData = useAsyncData(
  () => `dashboard-site-qa-${siteId}-${selectedPagePath.value}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getSiteQa }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/qa-dashboard'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const qa = await getSiteQa(db, siteId, pagePath.value)
      return { qa }
    }
    return await dashboardApi<{ qa: QaRow[] }>(
      `/api/editor/sites/${siteId}/qa`,
      {
        query: pagePath.value ? { page_path: pagePath.value } : undefined,
        validate: (value): value is { qa: QaRow[] } =>
          isRecord(value)
          && Array.isArray(value.qa)
          && value.qa.every(item =>
            isRecord(item)
            && typeof item.id === 'string'
            && typeof item.question === 'string'
            && (item.answer === null || typeof item.answer === 'string')
            && (item.status === 'published' || item.status === 'hidden')
            && typeof item.sort_order === 'number'
            && (item.page_path === null || typeof item.page_path === 'string'),
          ),
      },
    )
  },
  { watch: [selectedPagePath] },
)

const [
  { data: tenantPages },
  { data: existingQaScopes },
  { data, pending, refresh, error: qaError },
] = await Promise.all([tenantPagesAsyncData, existingQaScopesAsyncData, qaAsyncData])

const pageScopes = computed(() => {
  const scopes = new Map<string, string>()
  scopes.set('general', 'General fallback')

  for (const path of STANDARD_ROUTES) {
    scopes.set(path, path === '/' ? 'Home' : path)
  }

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
const listItems = computed(() => qaRows.value.map(row => ({
  id: row.id,
  title: row.question,
  summary: row.answer || 'No answer yet.',
})))

const { editing, dialogOpen, editingId, removingId, openNew, openExisting, close, removeItem, removeEditing } = useListEditor<QaRow>({
  find: id => qaRows.value.find(row => row.id === id) ?? null,
  fill: (row) => {
    form.question = row.question
    form.answer = row.answer ?? ''
    form.published = row.status === 'published'
  },
  clear: () => {
    form.question = ''
    form.answer = ''
    form.published = true
  },
  destroy: async (id) => {
    try {
      await dashboardApi(`/api/editor/sites/${siteId}/qa/${id}`, {
        method: 'DELETE',
        query: pagePath.value ? { page_path: pagePath.value } : undefined,
        validate: (value): value is { qa_id: string; deleted: true } =>
          isRecord(value) && typeof value.qa_id === 'string' && value.deleted === true,
      })
      await refresh()
    } catch (error) {
      toast.add({ description: error instanceof Error ? error.message : 'Failed to remove question', color: 'error' })
      // Rethrow so the sheet stays open on the record that is still there.
      // Swallowing it here let useListEditor treat the delete as done and close
      // over a row the server had refused to remove.
      throw error
    }
  },
})

async function save() {
  saving.value = true
  try {
    const body: Record<string, unknown> = { page_path: pagePath.value, question: form.question, answer: form.answer || null, status: form.published ? 'published' : 'hidden' }
    if (editingId.value) {
      await dashboardApi(`/api/editor/sites/${siteId}/qa/${editingId.value}`, {
        method: 'PATCH',
        body,
        validate: (value): value is { updated: true; qa_id: string } =>
          isRecord(value) && value.updated === true && typeof value.qa_id === 'string',
      })
    } else {
      await dashboardApi(`/api/editor/sites/${siteId}/qa`, {
        method: 'POST',
        body,
        validate: (value): value is QaRow =>
          isRecord(value)
          && typeof value.id === 'string'
          && typeof value.question === 'string'
          && typeof value.sort_order === 'number',
      })
    }
    close()
    await refresh()
    toast.add({ description: 'Site Q&A saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save Q&A', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function move(item: { id: string }, direction: -1 | 1) {
  const index = qaRows.value.findIndex(row => row.id === item.id)
  const current = qaRows.value[index]
  const target = qaRows.value[index + direction]
  if (!current || !target) return
  await dashboardApi(`/api/editor/sites/${siteId}/qa/reorder`, {
    method: 'POST',
    body: { page_path: pagePath.value, updates: [{ id: current.id, sort_order: target.sort_order }, { id: target.id, sort_order: current.sort_order }] },
    validate: (value): value is { updated: number } =>
      isRecord(value) && typeof value.updated === 'number',
  })
  await refresh()
}

// Switching scope shows a different list, so anything the old one had open goes
// with it.
watch(selectedPagePath, () => {
  editing.value = false
  close()
})
</script>
