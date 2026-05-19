<template>
  <div v-if="shouldShowOpportunity">
    <UCard>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex gap-4">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <UIcon name="i-heroicons-language" class="size-5 text-primary" />
          </div>
          <div>
            <UBadge color="primary" variant="soft">Growth opportunity</UBadge>
            <h2 class="mt-3 text-lg font-semibold text-highlighted">Help more guests find and understand your restaurant</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-muted">
              ChowBot can prepare translated drafts for your menu, location details, and site pages. You review everything before it goes live.
            </p>
          </div>
        </div>
        <div class="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <UButton icon="i-heroicons-language" @click="openModal">
            Start translation
          </UButton>
          <UButton color="neutral" variant="ghost" @click="dismissed = true">
            Maybe later
          </UButton>
        </div>
      </div>
    </UCard>
  </div>

  <UModal v-model:open="isOpen" title="Reach guests in more languages" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <div class="space-y-5">
        <p class="text-sm leading-6 text-muted">
          Start with the language most likely to help guests read your menu and booking details. ChowBot creates drafts first, then you approve and publish.
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Language">
            <USelect v-model="form.locale" :items="targetLocaleOptions" class="w-full" :disabled="busy" />
          </UFormField>
          <UFormField label="Content">
            <USelect v-model="form.scope" :items="scopeOptions" class="w-full" :disabled="busy" />
          </UFormField>
        </div>

        <div class="rounded-lg border border-default bg-elevated p-4">
          <div v-if="estimateLoading" class="space-y-3">
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-8 w-full" />
          </div>
          <div v-else-if="estimate" class="grid gap-3 sm:grid-cols-3">
            <div>
              <p class="text-xs font-medium uppercase text-muted">Drafts</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.total_items) }}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase text-muted">Copy</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.total_chars) }} chars</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase text-muted">Estimate</p>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(estimate.estimated_credits) }} credits</p>
            </div>
          </div>
          <p v-else class="text-sm text-muted">Choose a language to see the estimated draft size and credit use.</p>
        </div>

        <UAlert
          color="neutral"
          variant="soft"
          icon="i-heroicons-clock"
          title="This can take a few minutes"
          description="You can keep editing your site while ChowBot works. Nothing publishes until you review and approve the drafts."
        />

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :description="error"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <UButton color="neutral" variant="ghost" :disabled="busy" @click="isOpen = false">
          Cancel
        </UButton>
        <UButton
          icon="i-heroicons-sparkles"
          :loading="jobCreating"
          :disabled="!canStart"
          @click="startTranslation"
        >
          Prepare drafts
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
type TranslationScope = 'site' | 'content' | 'menus' | 'locations' | 'posts'

interface SiteLocaleRow {
  locale: string
  label: string | null
  is_source: boolean
  status: 'draft' | 'published' | 'disabled'
  fallback_enabled: boolean
}

interface TranslationEstimate {
  source_locale: string
  target_locale: string
  scope: TranslationScope
  total_items: number
  total_chars: number
  estimated_credits: number
}

interface TranslationJobRow {
  id: string
  target_locale: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
}

const props = defineProps<{
  siteId: string
  menuItemsCount: number
  isPublished: boolean
  canPublish: boolean
}>()

const toast = useToast()
const isOpen = ref(false)
const dismissed = ref(false)
const statusLoaded = ref(false)
const statusLoading = ref(false)
const estimateLoading = ref(false)
const jobCreating = ref(false)
const error = ref('')
const sourceLocale = ref('en')
const locales = ref<SiteLocaleRow[]>([])
const jobs = ref<TranslationJobRow[]>([])
const estimate = ref<TranslationEstimate | null>(null)

const form = reactive({
  locale: 'th',
  scope: 'site' as TranslationScope,
})

const targetLocaleOptions = [
  { label: 'Thai', value: 'th' },
  { label: 'French', value: 'fr' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Korean', value: 'ko' },
  { label: 'German', value: 'de' },
  { label: 'Spanish', value: 'es' },
  { label: 'Italian', value: 'it' },
]

const scopeOptions = [
  { label: 'Entire site', value: 'site' },
  { label: 'Menu only', value: 'menus' },
  { label: 'Pages only', value: 'content' },
  { label: 'Locations only', value: 'locations' },
  { label: 'Posts only', value: 'posts' },
]

const eligible = computed(() =>
  (props.isPublished || props.canPublish) && props.menuItemsCount > 0
)

const hasTargetLocale = computed(() =>
  locales.value.some(locale => !locale.is_source && locale.status !== 'disabled')
)

const hasActiveJob = computed(() =>
  jobs.value.some(job => job.status === 'queued' || job.status === 'running')
)

const shouldShowOpportunity = computed(() =>
  eligible.value && statusLoaded.value && !dismissed.value && !hasTargetLocale.value && !hasActiveJob.value
)

const busy = computed(() => estimateLoading.value || jobCreating.value)

const canStart = computed(() =>
  Boolean(form.locale)
  && !estimateLoading.value
  && !jobCreating.value
  && Boolean(estimate.value)
  && (estimate.value?.total_items ?? 0) > 0
)

watch(
  eligible,
  (value) => {
    if (value) loadStatus()
  }
)

watch(
  () => [isOpen.value, form.locale, form.scope] as const,
  ([open, _locale, _scope]) => {
    if (open) estimateTranslation()
  }
)

async function loadStatus() {
  if (statusLoading.value) return
  statusLoading.value = true
  error.value = ''
  try {
    const [localesResponse, jobsResponse] = await Promise.all([
      $fetch<{ success: boolean; source_locale: string; locales: SiteLocaleRow[] }>(`/api/editor/sites/${props.siteId}/locales`),
      $fetch<{ success: boolean; jobs: TranslationJobRow[] }>(`/api/editor/sites/${props.siteId}/translations/jobs`),
    ])
    sourceLocale.value = localesResponse.source_locale || 'en'
    locales.value = localesResponse.locales || []
    jobs.value = jobsResponse.jobs || []
    if (form.locale === sourceLocale.value) {
      form.locale = targetLocaleOptions.find(option => option.value !== sourceLocale.value)?.value || ''
    }
    statusLoaded.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load translation status'
  } finally {
    statusLoading.value = false
  }
}

async function openModal() {
  isOpen.value = true
  await loadStatus()
}

async function estimateTranslation() {
  if (!form.locale || estimateLoading.value) return
  estimateLoading.value = true
  error.value = ''
  try {
    const response = await $fetch<{ success: boolean; estimate: TranslationEstimate }>(
      `/api/editor/sites/${props.siteId}/translations/inventory`,
      {
        query: {
          locale: form.locale,
          scope: form.scope,
          includePublished: false,
        }
      }
    )
    estimate.value = response.estimate
  } catch (err) {
    estimate.value = null
    error.value = err instanceof Error ? err.message : 'Failed to estimate translation'
  } finally {
    estimateLoading.value = false
  }
}

async function ensureLocale() {
  const existing = locales.value.find(locale => locale.locale === form.locale)
  if (existing) return

  await $fetch(`/api/editor/sites/${props.siteId}/locales`, {
    method: 'POST',
    body: {
      locale: form.locale,
      label: targetLocaleOptions.find(option => option.value === form.locale)?.label || form.locale,
      status: 'draft',
      is_source: false,
      fallback_enabled: true,
    }
  })
}

async function startTranslation() {
  if (!canStart.value) return
  jobCreating.value = true
  error.value = ''
  try {
    await ensureLocale()
    await $fetch(`/api/editor/sites/${props.siteId}/translations/jobs`, {
      method: 'POST',
      body: {
        locale: form.locale,
        scope: form.scope,
        includePublished: false,
      }
    })
    dismissed.value = true
    isOpen.value = false
    toast.add({
      title: 'Translation drafts queued',
      description: 'ChowBot is preparing drafts in the background. You can keep working and review them when they are ready.',
      color: 'success',
    })
    await navigateTo(`/dashboard/sites/${props.siteId}/translations?locale=${encodeURIComponent(form.locale)}`)
    loadStatus().catch((err) => {
      console.warn('translation_opportunity_status_refresh_failed', err)
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to start translation'
  } finally {
    jobCreating.value = false
  }
}

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat().format(Number(value || 0))

onMounted(() => {
  if (eligible.value) loadStatus()
})
</script>
