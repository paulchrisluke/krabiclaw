<template>
  <UDashboardPanel id="site-links-page">
    <template #header>
      <UDashboardNavbar title="Links page">
        <template #leading>
          <DashboardNavbarLeading v-if="sitePaths" :to="sitePaths.site" label="Site" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" icon="i-lucide-copy" :disabled="!publicLinksUrl" @click="copyPublicUrl">Copy URL</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-external-link" :to="publicLinksUrl || undefined" target="_blank" :disabled="!publicLinksUrl">Open</UButton>
            <UButton icon="i-lucide-save" :loading="saving" :disabled="!dirty" @click="save">Save</UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="space-y-6">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="errorMessage"
          />

          <UCard>
            <template #header>
              <div>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">Page details</h2>
                  <p class="mt-1 text-sm text-muted">Manage the owned-domain link hub for this site.</p>
                </div>
              </div>
            </template>

            <div v-if="!editorReady" class="space-y-4">
              <USkeleton class="h-10" />
              <USkeleton class="h-14" />
            </div>
            <div v-else class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Title" required>
                <UInput v-model="form.title" aria-label="Links page title" maxlength="160" />
              </UFormField>
              <UFormField label="Robots">
                <USelect v-model="form.robots" :items="robotsOptions" />
              </UFormField>
              <UFormField label="SEO title">
                <UInput v-model="form.seo_title" maxlength="200" />
              </UFormField>
              <UFormField label="SEO description">
                <UInput v-model="form.seo_description" maxlength="500" />
              </UFormField>
            </div>
          </UCard>

          <UCard v-if="translationLocales.length || translationLocaleError">
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <h2 class="text-base font-semibold text-highlighted">Translations</h2>
                <select v-model="translationLocale" data-testid="links-translation-locale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
                  <option v-for="option in translationLocales" :key="option" :value="option">{{ option }}</option>
                </select>
              </div>
            </template>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField :label="`Title (${translationLocale})`">
                <UInput v-model="translationFields.title" data-testid="links-translation-title" />
              </UFormField>
              <UFormField :label="`SEO title (${translationLocale})`">
                <UInput v-model="translationFields.seo_title" data-testid="links-translation-seo-title" />
              </UFormField>
              <UFormField class="md:col-span-2" :label="`SEO description (${translationLocale})`">
                <UInput v-model="translationFields.seo_description" data-testid="links-translation-seo-description" />
              </UFormField>
            </div>
            <p v-if="translationLocaleError || translationError" class="mt-2 text-sm text-error">{{ translationLocaleError || translationError }}</p>
            <UButton data-testid="links-save-page-translation" class="mt-3" size="sm" :loading="translationSaving" :disabled="translationUnavailable || !translationLocale" @click="saveTranslation">Save translation</UButton>

            <div v-if="items.length" class="mt-6 space-y-4 border-t border-default pt-4">
              <div v-for="item in items" :key="item.id" :data-testid="`links-item-translation-${item.id}`">
                <p class="text-sm text-muted">{{ item.label || 'Untitled link' }}</p>
                <UFormField :label="`Label (${translationLocale})`" class="mt-2">
                  <UInput v-model="itemTranslationLabels[item.id]" data-testid="links-item-translation-label" />
                </UFormField>
                <UButton data-testid="links-save-item-translation" class="mt-3" size="sm" variant="soft" :loading="itemTranslationSavingId === item.id" :disabled="translationUnavailable" @click="saveItemTranslation(item)">Save translation</UButton>
              </div>
              <p v-if="itemTranslationError" class="text-sm text-error">{{ itemTranslationError }}</p>
            </div>
          </UCard>

          <DashboardListEditor
            v-model:editing="editing"
            title="Links"
            description="Add, hide, and reorder the buttons shown on /links."
            :items="listItems"
            empty-title="No links yet"
            empty-icon="i-lucide-link"
            add-label="Add a link"
            reorderable
            @add="openNew"
            @open="openExisting"
            @remove="removeItem"
            @move="move"
          >
            <template #item="{ item }">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
                <UBadge v-if="item.row.status === 'hidden'" color="neutral" variant="soft" size="sm">hidden</UBadge>
              </div>
              <p class="mt-1 truncate text-sm text-muted">{{ item.row.destination || 'No destination yet' }}</p>
            </template>
          </DashboardListEditor>

          <DashboardListItemDialog
            v-model:open="dialogOpen"
            :title="editingId ? 'Edit link' : 'Add a link'"
            :removable="Boolean(editingId)"
            :save-disabled="!itemForm.label.trim() || !itemForm.destination.trim()"
            @save="applyItem"
            @remove="removeEditing"
          >
            <UFormField label="Label" required>
              <UInput v-model="itemForm.label" maxlength="120" autofocus class="w-full" />
            </UFormField>
            <UFormField label="Destination" required>
              <UInput v-model="itemForm.destination" placeholder="/reservations or https://example.com" maxlength="2048" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="itemForm.status" :items="itemStatusOptions" class="w-full" />
            </UFormField>
          </DashboardListItemDialog>
        </div>

        <aside class="xl:sticky xl:top-4 xl:self-start">
          <div class="overflow-hidden rounded-lg border border-default bg-elevated">
            <div class="border-b border-default px-4 py-3">
              <h2 class="text-sm font-semibold text-highlighted">Preview</h2>
            </div>
            <div class="px-4 py-6">
              <div class="mx-auto max-w-xs text-center">
                <h3 class="mt-4 truncate text-xl font-semibold text-highlighted">{{ form.title || 'Links' }}</h3>
                <div class="mt-5 space-y-2 text-left">
                  <div
                    v-for="item in activePreviewItems"
                    :key="item.id"
                    class="flex min-h-12 items-center rounded-lg border border-default bg-default px-3 py-2 text-center"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-highlighted">{{ item.label }}</span>
                    </span>
                  </div>
                  <p v-if="activePreviewItems.length === 0" class="text-center text-sm text-muted">No active links to preview.</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'

const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.links' })

const { sitePaths } = useDashboardSiteLinks()
useSeoMeta({ title: 'Links page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

type ItemStatus = 'active' | 'hidden'

interface LinksPage {
  id: string
  title: string
  robots: string
  seo_title: string
  seo_description: string
}

interface LinkItem {
  id: string
  label: string
  destination: string
  sort_order: number
  status: ItemStatus
}

interface ApiLinksPage extends Omit<LinksPage, 'seo_title' | 'seo_description'> {
  seo_title: string | null
  seo_description: string | null
}

type ApiLinkItem = LinkItem

const isLinksResponse = (
  value: unknown,
): value is { page: ApiLinksPage; items: ApiLinkItem[] } =>
  isRecord(value)
  && isRecord(value.page)
  && typeof value.page.title === 'string'
  && Array.isArray(value.items)
  && value.items.every(item =>
    isRecord(item)
    && typeof item.id === 'string'
    && typeof item.label === 'string'
    && typeof item.destination === 'string'
    && typeof item.sort_order === 'number'
    && typeof item.status === 'string',
  )

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const toast = useToast()
const saving = ref(false)
const errorMessage = ref('')
const savedSnapshot = ref('')
const mounted = ref(false)

const itemStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Hidden', value: 'hidden' },
]
const robotsOptions = [
  { label: 'No index, follow', value: 'noindex,follow' },
  { label: 'Index, follow', value: 'index,follow' },
  { label: 'Index, no follow', value: 'index,nofollow' },
  { label: 'No index, no follow', value: 'noindex,nofollow' },
]
const form = reactive<LinksPage>({
  id: '',
  title: '',
  robots: 'noindex,follow',
  seo_title: '',
  seo_description: '',
})
const items = ref<LinkItem[]>([])

const listItems = computed(() => items.value.map(row => ({
  id: row.id,
  title: row.label || 'Untitled link',
  row,
})))

const itemForm = reactive({ label: '', destination: '', status: 'active' as ItemStatus })

// The dialog edits the draft, not the server: this page saves its details and its
// links together through one endpoint, so "Save" here means "apply to the
// document" and the navbar's Save is what persists it.
const { editing, dialogOpen, editingId, openNew, openExisting, close, removeItem, removeEditing } = useListEditor<LinkItem>({
  find: id => items.value.find(item => item.id === id) ?? null,
  fill: (row) => {
    itemForm.label = row.label
    itemForm.destination = row.destination
    itemForm.status = row.status
  },
  clear: () => {
    itemForm.label = ''
    itemForm.destination = ''
    itemForm.status = 'active'
  },
  destroy: async (id) => {
    items.value = items.value
      .filter(item => item.id !== id)
      .map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
  },
})

function applyItem() {
  if (editingId.value) {
    items.value = items.value.map(item => item.id === editingId.value
      ? { ...item, label: itemForm.label, destination: itemForm.destination, status: itemForm.status }
      : item)
  } else {
    items.value = [...items.value, {
      id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: itemForm.label,
      destination: itemForm.destination,
      sort_order: items.value.length,
      status: itemForm.status,
    }]
  }
  close()
}

function move(item: { id: string }, direction: -1 | 1) {
  const index = items.value.findIndex(entry => entry.id === item.id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.value.length) return
  const next = [...items.value]
  const [moved] = next.splice(index, 1)
  if (!moved) return
  next.splice(nextIndex, 0, moved)
  items.value = next.map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
}

const { data, pending, refresh } = await useAsyncData(
  `links-page-editor-${siteId}`,
  () => dashboardApi<{ page: ApiLinksPage; items: ApiLinkItem[] }>(
    `/api/editor/sites/${siteId}/links-page`,
    { validate: isLinksResponse },
  ),
  { server: false },
)

watch(data, (value) => {
  if (!value) return
  Object.assign(form, {
    ...value.page,
    seo_title: value.page.seo_title ?? '',
    seo_description: value.page.seo_description ?? '',
  })
  items.value = value.items
  savedSnapshot.value = serializeState()
}, { immediate: true })

const dirty = computed(() => savedSnapshot.value !== serializeState())
const editorReady = computed(() => mounted.value && !pending.value)
const activePreviewItems = computed(() => items.value.filter(item => item.status === 'active'))
const publicLinksUrl = computed(() => {
  const base = dashboard.site.value?.public_url || ''
  return base ? `${base.replace(/\/+$/, '')}/links` : ''
})

function serializeState() {
  return JSON.stringify({
    page: {
      title: form.title,
      robots: form.robots,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
    },
    items: items.value.map((item, index) => ({
      id: item.id,
      label: item.label,
      destination: item.destination,
      sort_order: index,
      status: item.status,
    })),
  })
}




async function copyPublicUrl() {
  if (!publicLinksUrl.value) return
  try {
    await navigator.clipboard.writeText(publicLinksUrl.value)
    toast.add({ description: 'Links page URL copied', color: 'success' })
  } catch {
    toast.add({ description: 'Unable to copy the links page URL', color: 'error' })
  }
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      page: {
        title: form.title,
        robots: form.robots,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
      },
      items: items.value.map((item, index) => ({
        id: item.id,
        label: item.label,
        destination: item.destination,
        sort_order: index,
        status: item.status,
      })),
    }
    const response = await dashboardApi<{ page: ApiLinksPage; items: ApiLinkItem[] }>(`/api/editor/sites/${siteId}/links-page`, {
      method: 'PATCH',
      body: payload,
      validate: isLinksResponse,
    })
    data.value = response
    await refresh()
    savedSnapshot.value = serializeState()
    toast.add({ description: 'Links page saved', color: 'success' })
  } catch (error) {
    errorMessage.value = error instanceof ApiClientError
      ? error.message
      : error instanceof Error ? error.message : 'Unable to save links page'
    toast.add({ description: errorMessage.value, color: 'error' })
  } finally {
    saving.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
}

if (import.meta.client) {
  onMounted(() => {
    mounted.value = true
    window.addEventListener('beforeunload', handleBeforeUnload)
  })
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
}

onBeforeRouteLeave(() => {
  if (!dirty.value || !import.meta.client) return true
  return window.confirm('Discard unsaved links page changes?')
})

// ── Translations (resource_localizations, same API as the editor CRUD) ──
const translationLocale = ref('')
const translationLocales = ref<string[]>([])
const translationLocaleError = ref<string | null>(null)
const translationFields = reactive({ title: '', seo_title: '', seo_description: '' })
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
const itemTranslationLabels = reactive<Record<string, string>>({})
const itemTranslationError = ref<string | null>(null)
const itemTranslationSavingId = ref<string | null>(null)
const translationUnavailable = computed(() => Boolean(translationLocaleError.value || translationError.value || itemTranslationError.value))

function isLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadTranslationLocales() {
  translationLocaleError.value = null
  try {
    const response = await dashboardApi<{ languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> }>(
      `/api/editor/sites/${siteId}/locales`,
      { validate: isLocalesResponse },
    )
    translationLocales.value = response.languages.filter(item => item.locale_status === 'published' && !item.is_source).map(item => item.locale)
    translationLocale.value = translationLocales.value[0] ?? ''
  } catch (cause) {
    translationLocales.value = []
    translationLocale.value = ''
    translationLocaleError.value = cause instanceof Error ? cause.message : 'Failed to load site languages'
  }
}
function isTranslationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}
async function loadTranslationFields() {
  translationError.value = null
  translationFields.title = ''; translationFields.seo_title = ''; translationFields.seo_description = ''
  if (!form.id || !translationLocale.value) return
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/site_link_page/${form.id}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isTranslationResponse },
    )
    const values = response.localization.values
    translationFields.title = typeof values.title === 'string' ? values.title : ''
    translationFields.seo_title = typeof values.seo_title === 'string' ? values.seo_title : ''
    translationFields.seo_description = typeof values.seo_description === 'string' ? values.seo_description : ''
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) translationError.value = cause instanceof Error ? cause.message : 'Failed to load translation'
  }
}
async function loadItemTranslations() {
  itemTranslationError.value = null
  for (const key of Object.keys(itemTranslationLabels)) itemTranslationLabels[key] = ''
  if (!translationLocale.value) return
  for (const item of items.value) {
    itemTranslationLabels[item.id] = ''
    try {
      const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
        `/api/editor/sites/${siteId}/localization/site_link_item/${item.id}/${encodeURIComponent(translationLocale.value)}`,
        { validate: isTranslationResponse },
      )
      const value = response.localization.values.label
      itemTranslationLabels[item.id] = typeof value === 'string' ? value : ''
    } catch (cause) {
      const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
      if (statusCode !== 404) {
        itemTranslationError.value = cause instanceof Error ? cause.message : 'Failed to load link translations'
        return
      }
    }
  }
}
watch(translationLocale, () => { void loadTranslationFields(); void loadItemTranslations() })
watch(() => form.id, () => {
  if (!form.id) return
  void loadTranslationLocales().then(() => {
    if (!translationLocale.value) return
    void loadTranslationFields()
    void loadItemTranslations()
  })
})
watch(() => items.value.map(item => item.id).join(','), () => { if (translationLocale.value) void loadItemTranslations() })

async function saveTranslation() {
  if (!form.id || !translationLocale.value) return
  translationSaving.value = true
  translationError.value = null
  try {
    const values: Record<string, string> = {}
    if (translationFields.title.trim()) values.title = translationFields.title.trim()
    if (translationFields.seo_title.trim()) values.seo_title = translationFields.seo_title.trim()
    if (translationFields.seo_description.trim()) values.seo_description = translationFields.seo_description.trim()
    await dashboardApi(`/api/editor/sites/${siteId}/localization/site_link_page/${form.id}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values, route_path: `/${translationLocale.value}/links` },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    translationError.value = cause instanceof Error ? cause.message : 'Failed to save translation'
  } finally {
    translationSaving.value = false
  }
}

async function saveItemTranslation(item: LinkItem) {
  const label = itemTranslationLabels[item.id]?.trim()
  if (!translationLocale.value || !label) return
  itemTranslationSavingId.value = item.id
  itemTranslationError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/localization/site_link_item/${item.id}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values: { label } },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    itemTranslationError.value = cause instanceof Error ? cause.message : 'Failed to save translation'
  } finally {
    itemTranslationSavingId.value = null
  }
}
</script>
