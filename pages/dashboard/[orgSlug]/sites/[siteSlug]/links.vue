<template>
  <UDashboardPanel id="site-links-page">
    <template #header>
      <UDashboardNavbar title="Links page">
        <template #leading>
          <DashboardNavbarLeading />
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
            <div v-else class="grid gap-5 md:grid-cols-2">
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

          <UCard v-if="translationLocales.length">
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <h2 class="text-base font-semibold text-highlighted">Translations</h2>
                <select v-model="translationLocale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
                  <option v-for="option in translationLocales" :key="option" :value="option">{{ option }}</option>
                </select>
              </div>
            </template>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField :label="`Title (${translationLocale})`">
                <UInput v-model="translationFields.title" />
              </UFormField>
              <UFormField :label="`SEO title (${translationLocale})`">
                <UInput v-model="translationFields.seo_title" />
              </UFormField>
              <UFormField class="md:col-span-2" :label="`SEO description (${translationLocale})`">
                <UInput v-model="translationFields.seo_description" />
              </UFormField>
            </div>
            <p v-if="translationError" class="mt-2 text-sm text-error">{{ translationError }}</p>
            <UButton class="mt-3" size="sm" :loading="translationSaving" @click="saveTranslation">Save translation</UButton>

            <div v-if="items[0]" class="mt-6 border-t border-default pt-4">
              <p class="text-sm text-muted">First link item ({{ items[0].label || 'untitled' }})</p>
              <UFormField :label="`Label (${translationLocale})`" class="mt-2">
                <UInput v-model="itemTranslationLabel" />
              </UFormField>
              <p v-if="itemTranslationError" class="mt-2 text-sm text-error">{{ itemTranslationError }}</p>
              <UButton class="mt-3" size="sm" variant="soft" :loading="itemTranslationSaving" @click="saveItemTranslation">Save translation</UButton>
            </div>
          </UCard>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-highlighted">Links</h2>
                <p class="mt-1 text-sm text-muted">Add, hide, delete, and reorder the buttons shown on /links.</p>
              </div>
              <UButton color="neutral" variant="soft" icon="i-lucide-plus" @click="addLink">Add link</UButton>
            </div>

            <div v-if="items.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
              <UIcon name="i-lucide-link" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">No links yet</p>
              <p class="mt-1 text-sm text-muted">Add an active link to make the page available.</p>
            </div>

            <div v-for="(item, index) in items" :key="item.id" class="rounded-lg border border-default bg-default p-4">
              <div class="flex flex-wrap items-center gap-2">
                <span class="flex size-8 shrink-0 items-center justify-center rounded bg-elevated text-xs font-semibold text-muted">{{ index + 1 }}</span>
                <UInput v-model="item.label" class="min-w-52 flex-1" placeholder="Label" maxlength="120" />
                <USelect v-model="item.status" :items="itemStatusOptions" class="w-32" />
                <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" :disabled="index === 0" :aria-label="`Move ${item.label || 'link'} up`" @click="moveItem(index, -1)" />
                <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" :disabled="index === items.length - 1" :aria-label="`Move ${item.label || 'link'} down`" @click="moveItem(index, 1)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="`Delete ${item.label || 'link'}`" @click="deleteItem(index)" />
              </div>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <UFormField class="md:col-span-2" label="Destination" required>
                  <UInput v-model="item.destination" aria-label="Link destination" placeholder="/reservations or https://example.com" maxlength="2048" />
                </UFormField>
              </div>
            </div>
          </div>
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
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.links' })
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

function addLink() {
  items.value.push({
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    destination: '',
    sort_order: items.value.length,
    status: 'active',
  })
}

function moveItem(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.value.length) return
  const next = [...items.value]
  const [item] = next.splice(index, 1)
  if (!item) return
  next.splice(nextIndex, 0, item)
  items.value = next.map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
}

function deleteItem(index: number) {
  const item = items.value[index]
  if (!item) return
  if (import.meta.client && !window.confirm(`Delete "${item.label || 'this link'}"?`)) return
  items.value.splice(index, 1)
  items.value = items.value.map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
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
const translationFields = reactive({ title: '', seo_title: '', seo_description: '' })
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
const itemTranslationLabel = ref('')
const itemTranslationError = ref<string | null>(null)
const itemTranslationSaving = ref(false)

function isLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadTranslationLocales() {
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
    translationError.value = cause instanceof Error ? cause.message : 'Failed to load site languages'
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
async function loadItemTranslation() {
  itemTranslationError.value = null
  itemTranslationLabel.value = ''
  const item = items.value[0]
  if (!item || !translationLocale.value) return
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/site_link_item/${item.id}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isTranslationResponse },
    )
    const value = response.localization.values.label
    itemTranslationLabel.value = typeof value === 'string' ? value : ''
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) itemTranslationError.value = cause instanceof Error ? cause.message : 'Failed to load translation'
  }
}
watch(translationLocale, () => { void loadTranslationFields(); void loadItemTranslation() })
watch(() => form.id, () => { if (form.id) void loadTranslationLocales().then(() => { void loadTranslationFields(); void loadItemTranslation() }) })

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

async function saveItemTranslation() {
  const item = items.value[0]
  if (!item || !translationLocale.value || !itemTranslationLabel.value.trim()) return
  itemTranslationSaving.value = true
  itemTranslationError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/localization/site_link_item/${item.id}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values: { label: itemTranslationLabel.value.trim() } },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    itemTranslationError.value = cause instanceof Error ? cause.message : 'Failed to save translation'
  } finally {
    itemTranslationSaving.value = false
  }
}
</script>
