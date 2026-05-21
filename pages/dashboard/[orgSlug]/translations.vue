<template>
  <UPage>
    <UPageHeader
      title="Translations"
      description="Review generated language drafts, make edits, and publish them when they are ready."
    >
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div class="space-y-6">
        <div class="rounded-lg border border-default p-4">
          <div class="grid gap-3 lg:grid-cols-[1fr_12rem_12rem_auto_auto]">
            <UFormField label="Language">
              <USelect
                v-model="filters.locale"
                :items="translationLocaleOptions"
                value-key="value"
                label-key="label"
                :disabled="loading"
              />
            </UFormField>
            <UFormField label="Scope">
              <USelect
                v-model="filters.scope"
                :items="scopeOptions"
                value-key="value"
                label-key="label"
                :disabled="loading"
              />
            </UFormField>
            <UFormField label="Status">
              <USelect
                v-model="filters.status"
                :items="statusOptions"
                value-key="value"
                label-key="label"
                :disabled="loading"
              />
            </UFormField>
            <div class="flex items-end">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-heroicons-arrow-path"
                :loading="loading"
                :disabled="!filters.locale"
                @click="loadReview"
              >
                Refresh
              </UButton>
            </div>
            <div class="flex items-end">
              <UButton
                icon="i-heroicons-arrow-up-on-square"
                :loading="publishing"
                :disabled="!filters.locale"
                @click="publishDrafts"
              >
                Publish drafts
              </UButton>
            </div>
          </div>

          <UAlert
            v-if="error"
            class="mt-4"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :description="error"
          />

          <div v-if="estimate" class="mt-4 grid gap-3 sm:grid-cols-4">
            <div class="rounded-md border border-default p-3">
              <p class="text-xs font-medium uppercase text-muted">Items</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.total_items) }}</p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs font-medium uppercase text-muted">Characters</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.total_chars) }}</p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs font-medium uppercase text-muted">Estimated credits</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.estimated_credits) }}</p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs font-medium uppercase text-muted">Source</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ sourceLocale }}</p>
            </div>
          </div>
        </div>

        <div v-if="loading" class="space-y-3">
          <USkeleton class="h-48 w-full" />
          <USkeleton class="h-48 w-full" />
          <USkeleton class="h-48 w-full" />
        </div>

        <div v-else-if="!filters.locale" class="rounded-lg border border-dashed border-default p-8 text-center">
          <UIcon name="i-heroicons-language" class="mx-auto size-9 text-muted" />
          <h2 class="mt-3 font-semibold text-highlighted">Add a target language first</h2>
          <p class="mt-1 text-sm text-muted">Languages are managed in site settings.</p>
          <UButton class="mt-4" color="neutral" variant="soft" :to="paths.settings">Open settings</UButton>
        </div>

        <div v-else-if="reviewItems.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
          <UIcon name="i-heroicons-check-circle" class="mx-auto size-9 text-success" />
          <h2 class="mt-3 font-semibold text-highlighted">Nothing to review</h2>
          <p class="mt-1 text-sm text-muted">Try another status filter or create a translation job from Settings.</p>
        </div>

        <div v-else class="divide-y divide-default rounded-lg border border-default">
          <section
            v-for="item in reviewItems"
            :key="itemKey(item)"
            class="p-4"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-medium text-highlighted">{{ item.label }}</h2>
                  <UBadge color="neutral" variant="soft">{{ entityLabel(item.entity_type) }}</UBadge>
                  <UBadge :color="statusColor(item.status)" variant="soft">{{ item.status }}</UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">{{ item.entity_id }} · {{ item.field }}</p>
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-heroicons-document-check"
                :loading="savingKey === itemKey(item)"
                @click="saveItem(item)"
              >
                Save draft
              </UButton>
            </div>

            <div class="mt-4 space-y-4">
              <div
                v-for="fieldName in fieldNames(item)"
                :key="fieldName"
                class="grid gap-3 lg:grid-cols-2"
              >
                <UFormField :label="fieldLabel(fieldName, 'Source')">
                  <UTextarea
                    :model-value="item.source_fields[fieldName] || ''"
                    :rows="fieldRows(item.source_fields[fieldName])"
                    readonly
                    class="font-mono text-sm"
                  />
                </UFormField>
                <UFormField :label="fieldLabel(fieldName, localeLabel(filters.locale))">
                  <UTextarea
                    :model-value="draftValue(item, fieldName)"
                    :rows="fieldRows(item.source_fields[fieldName])"
                    :disabled="savingKey === itemKey(item)"
                    @update:model-value="updateDraft(item, fieldName, String($event || ''))"
                  />
                </UFormField>
              </div>
            </div>
          </section>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

type TranslationScope = 'site' | 'content' | 'menus' | 'locations' | 'posts'
type TranslationStatus = 'all' | 'missing' | 'draft' | 'published' | 'stale'
type TranslationEntityType = 'site_content' | 'menu' | 'menu_item' | 'business_location' | 'post'

interface SiteLocaleRow {
  locale: string
  label: string | null
  is_source: boolean
  status: 'draft' | 'published' | 'disabled'
  fallback_enabled: boolean
}

interface TranslationEstimate {
  total_items: number
  total_chars: number
  estimated_credits: number
}

interface TranslationReviewItem {
  entity_type: TranslationEntityType
  entity_id: string
  location_id: string | null
  page: string | null
  field: string
  label: string
  status: Exclude<TranslationStatus, 'all'>
  source_hash: string
  source_fields: Record<string, string>
  translated_fields: Record<string, string>
}

const route = useRoute()
const siteId = await useDashboardSiteId()
const toast = useToast()
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId)

const localeOptions = [
  { label: 'English', value: 'en' },
  { label: 'Thai', value: 'th' },
  { label: 'French', value: 'fr' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Korean', value: 'ko' },
  { label: 'Spanish', value: 'es' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
]

const scopeOptions = [
  { label: 'Entire site', value: 'site' },
  { label: 'Pages', value: 'content' },
  { label: 'Menus', value: 'menus' },
  { label: 'Locations', value: 'locations' },
  { label: 'Posts', value: 'posts' },
]

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Stale', value: 'stale' },
  { label: 'Missing', value: 'missing' },
  { label: 'Published', value: 'published' },
]

const filters = reactive({
  locale: typeof route.query.locale === 'string' ? route.query.locale : 'th',
  scope: 'site' as TranslationScope,
  status: 'draft' as TranslationStatus,
})
const locales = ref<SiteLocaleRow[]>([])
const sourceLocale = ref('en')
const reviewItems = ref<TranslationReviewItem[]>([])
const estimate = ref<TranslationEstimate | null>(null)
const draftValues = ref<Record<string, Record<string, string>>>({})
const loading = ref(false)
const publishing = ref(false)
const savingKey = ref<string | null>(null)
const error = ref('')
const suppressReviewWatcher = ref(false)

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: paths.value.settings, color: 'neutral', variant: 'soft' }
]))

const translationLocaleOptions = computed(() => {
  const options = locales.value
    .filter(locale => !locale.is_source)
    .map(locale => ({ label: localeLabel(locale.locale, locale.label), value: locale.locale }))
  if (options.length) return options
  return localeOptions.filter(option => option.value !== sourceLocale.value)
})

const localeLabel = (locale: string, label?: string | null) =>
  label || localeOptions.find(option => option.value === locale)?.label || locale

const itemKey = (item: Pick<TranslationReviewItem, 'entity_type' | 'entity_id' | 'field'>) =>
  `${item.entity_type}:${item.entity_id}:${item.field}`

const fieldNames = (item: TranslationReviewItem) => Object.keys(item.source_fields)

const draftValue = (item: TranslationReviewItem, fieldName: string) =>
  draftValues.value[itemKey(item)]?.[fieldName] ?? ''

const updateDraft = (item: TranslationReviewItem, fieldName: string, value: string) => {
  const key = itemKey(item)
  draftValues.value = {
    ...draftValues.value,
    [key]: {
      ...(draftValues.value[key] ?? {}),
      [fieldName]: value,
    }
  }
}

const loadLocales = async () => {
  const response = await $fetch<{ success: boolean; source_locale: string; locales: SiteLocaleRow[] }>(
    `/api/dashboard/editor/locales`
  )
  sourceLocale.value = response.source_locale || 'en'
  locales.value = response.locales || []
  filters.locale = translationLocaleOptions.value.find(option => option.value === filters.locale)?.value
    || translationLocaleOptions.value[0]?.value
    || ''
}

const loadReview = async () => {
  if (!filters.locale) return
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch<{
      success: boolean
      source_locale: string
      estimate: TranslationEstimate
      items: TranslationReviewItem[]
    }>(`/api/dashboard/editor/translations/review`, {
      query: {
        locale: filters.locale,
        scope: filters.scope,
        status: filters.status,
      }
    })
    sourceLocale.value = response.source_locale || sourceLocale.value
    estimate.value = response.estimate
    reviewItems.value = response.items || []
    const nextDrafts: Record<string, Record<string, string>> = {}
    for (const item of reviewItems.value) {
      const key = itemKey(item)
      nextDrafts[key] = Object.keys(draftValues.value[key] ?? {}).length
        ? { ...draftValues.value[key] }
        : { ...item.translated_fields }
    }
    draftValues.value = nextDrafts
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load translations'
  } finally {
    loading.value = false
  }
}

const saveItem = async (item: TranslationReviewItem) => {
  const key = itemKey(item)
  savingKey.value = key
  error.value = ''
  try {
    const response = await $fetch<{ success: boolean; item: Pick<TranslationReviewItem, 'entity_type' | 'entity_id' | 'field' | 'status' | 'translated_fields'> }>(
      `/api/dashboard/editor/translations/review`,
      {
        method: 'PATCH',
        body: {
          locale: filters.locale,
          scope: filters.scope,
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          field: item.field,
          fields: draftValues.value[key] ?? {},
        }
      }
    )
    const saved = response.item
    const savedKey = itemKey(saved)
    reviewItems.value = reviewItems.value.map(reviewItem =>
      itemKey(reviewItem) === savedKey
        ? { ...reviewItem, status: saved.status, translated_fields: saved.translated_fields }
        : reviewItem
    )
    draftValues.value = {
      ...draftValues.value,
      [savedKey]: { ...saved.translated_fields },
    }
    toast.add({ description: 'Translation draft saved', color: 'success' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save translation'
  } finally {
    savingKey.value = null
  }
}

const publishDrafts = async () => {
  if (!filters.locale) return
  publishing.value = true
  error.value = ''
  try {
    const response = await $fetch<{ success: boolean; result: { published_items: number } }>(
      `/api/dashboard/editor/translations/publish`,
      {
        method: 'POST',
        body: {
          locale: filters.locale,
          scope: filters.scope,
        }
      }
    )
    toast.add({ description: `${response.result.published_items} translation drafts published`, color: 'success' })
    await Promise.all([loadLocales(), loadReview()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to publish translations'
  } finally {
    publishing.value = false
  }
}

const entityLabel = (type: TranslationEntityType) => {
  if (type === 'site_content') return 'Page'
  if (type === 'menu_item') return 'Menu item'
  if (type === 'business_location') return 'Location'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

const fieldLabel = (fieldName: string, suffix: string) =>
  `${fieldName.replaceAll('_', ' ')} (${suffix})`

const fieldRows = (value?: string) => {
  const length = value?.length ?? 0
  if (length > 260) return 6
  if (length > 120) return 4
  return 2
}

const statusColor = (status: TranslationReviewItem['status']) => {
  if (status === 'published') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'stale') return 'error'
  return 'neutral'
}

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat().format(Number(value || 0))

watch(
  () => [filters.locale, filters.scope, filters.status],
  () => {
    if (filters.locale && !suppressReviewWatcher.value) loadReview()
  }
)

onMounted(async () => {
  try {
    suppressReviewWatcher.value = true
    await loadLocales()
    await loadReview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load translations'
  } finally {
    suppressReviewWatcher.value = false
  }
})

useSeoMeta({ title: 'Translations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
