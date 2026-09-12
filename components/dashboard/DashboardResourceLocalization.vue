<template>
  <UButton
    color="neutral"
    variant="outline"
    icon="i-lucide-languages"
    label="Localize"
    :disabled="disabled || !resourceId"
    data-testid="localize-resource"
    @click="open = true"
  />

  <UModal
    v-model:open="modalOpen"
    :title="`Localize ${resourceLabel}`"
    :dismissible="!saving"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <UFormField label="Language">
          <USelect
            v-model="selectedLocale"
            :items="localeOptions"
            placeholder="Choose a language"
            class="w-full"
            aria-label="Translation language"
            :disabled="loadingLanguages || saving"
            data-testid="localize-language"
          />
        </UFormField>

        <div v-if="loadingLanguages" class="space-y-3">
          <USkeleton class="h-16 rounded-lg" />
          <USkeleton class="h-16 rounded-lg" />
        </div>
        <UAlert
          v-else-if="languageError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="languageError"
        />
        <div v-else-if="localeOptions.length === 0" class="space-y-3">
          <p class="text-sm text-muted">Enable another language in Localization settings before translating this content.</p>
          <UButton v-if="languageSettingsPath" color="neutral" variant="soft" label="Manage languages" :to="languageSettingsPath" />
        </div>

        <template v-else-if="locale">
          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="field in fields" :key="field.key" class="h-24 rounded-lg" />
          </div>
          <template v-else>
            <div
              v-for="field in fields"
              :key="field.key"
              class="grid gap-3 rounded-lg border border-default p-4 md:grid-cols-2"
            >
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Source · {{ sourceLocale }}</p>
                <p class="mt-2 whitespace-pre-wrap text-sm text-highlighted">{{ sourceText(field) }}</p>
              </div>
              <UFormField :label="field.label">
                <UTextarea
                  v-if="field.multiline || field.kind === 'string-list'"
                  v-model="draft[field.key]"
                  :rows="field.rows || (field.kind === 'string-list' ? 4 : 3)"
                  :placeholder="field.kind === 'string-list' ? 'One item per line' : undefined"
                  class="w-full"
                  :disabled="saving"
                  :data-testid="`localize-field-${field.key}`"
                />
                <UInput
                  v-else
                  v-model="draft[field.key]"
                  class="w-full"
                  :disabled="saving"
                  :data-testid="`localize-field-${field.key}`"
                />
              </UFormField>
            </div>
            <UAlert v-if="editorError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editorError" />
          </template>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton color="neutral" variant="ghost" label="Cancel" :disabled="saving" @click="requestClose" />
        <UButton
          label="Save"
          :loading="saving"
          :disabled="!locale || loading || loadingLanguages || Boolean(languageError) || Boolean(editorError)"
          data-testid="localize-save"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

interface LocalizationField {
  key: string
  label: string
  source: string | readonly string[] | null | undefined
  kind?: 'text' | 'string-list'
  multiline?: boolean
  rows?: number
}

interface LanguageRow {
  locale: string
  label: string | null
  status: string
  is_source: boolean | number
}

interface LocalizationResponse {
  localization: {
    [key: string]: unknown
  }
}

const props = defineProps<{
  siteId: string
  resourceType: string
  resourceId: string
  resourceLabel: string
  fields: readonly LocalizationField[]
  /**
   * The localized public path for a resource that stores one. The writer
   * requires it for those resources and rejects it for the rest, so the caller
   * that owns a route passes this and nobody else does.
   */
  routePath?: (locale: string) => string
  languageSettingsPath?: string
  disabled?: boolean
  loadValues?: (locale: string) => Promise<Record<string, unknown>>
  saveValues?: (locale: string, values: Record<string, unknown>) => Promise<void>
}>()

const emit = defineEmits<{ saved: [locale: string] }>()
const dashboardApi = useDashboardApi()
const route = useRoute()
const toast = useToast()
const open = defineModel<boolean>('open', { default: false })
const locale = ref('')
const sourceLocale = ref('')
const localeOptions = ref<Array<{ label: string, value: string }>>([])
const draft = reactive<Record<string, string>>({})
const baseline = ref<Record<string, string>>({})
const loadingLanguages = ref(false)
const loading = ref(false)
const saving = ref(false)
const languageError = ref<string | null>(null)
const editorError = ref<string | null>(null)
let requestGeneration = 0
let documentRevision: { locale: string; updatedAt: string } | null = null

const dirty = computed(() => props.fields.some(field => draft[field.key] !== baseline.value[field.key]))

function canDiscardDraft(): boolean {
  return !dirty.value || window.confirm('Discard unsaved translation changes?')
}

const modalOpen = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (value) {
      open.value = true
      return
    }
    if (!saving.value && canDiscardDraft()) open.value = false
  },
})

const selectedLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    if (value === locale.value || saving.value) return
    if (canDiscardDraft()) locale.value = value
  },
})

function isLanguagesResponse(value: unknown): value is { languages: LanguageRow[] } {
  return isRecord(value)
    && Array.isArray(value.languages)
    && value.languages.every(item => isRecord(item)
      && typeof item.locale === 'string'
      && (typeof item.label === 'string' || item.label === null)
      && typeof item.status === 'string'
      && (typeof item.is_source === 'boolean' || typeof item.is_source === 'number'))
}

function isLocalizationResponse(value: unknown): value is LocalizationResponse {
  return isRecord(value) && isRecord(value.localization) && (props.resourceType === 'content_document'
    ? typeof value.localization.updated_at === 'string' && isRecord(value.localization.metadata)
    : isRecord(value.localization.values))
}

function sourceText(field: LocalizationField): string {
  if (Array.isArray(field.source)) return field.source.join('\n')
  return typeof field.source === 'string' && field.source.trim() ? field.source : 'Empty'
}

function clearDraft(): void {
  for (const field of props.fields) draft[field.key] = ''
}

function markDraftClean(): void {
  baseline.value = Object.fromEntries(props.fields.map(field => [field.key, draft[field.key] ?? '']))
}

function applyValues(values: Record<string, unknown>): void {
  for (const field of props.fields) {
    const value = props.loadValues ? values[field.key] : field.key.split('.').reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, values)
    draft[field.key] = field.kind === 'string-list'
      ? (Array.isArray(value) ? value.filter(item => typeof item === 'string').join('\n') : '')
      : (typeof value === 'string' ? value : '')
  }
  markDraftClean()
}

function serializedValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of props.fields) {
    const rawValue = draft[field.key]
    if (rawValue === undefined) throw new Error(`Translation field ${field.key} is unavailable.`)
    const text = rawValue.trim()
    if (!text) continue
    const value = field.kind === 'string-list'
      ? text.split('\n').map(item => item.trim()).filter(Boolean)
      : text
    if (props.saveValues) values[field.key] = value
    else {
      const path = field.key.split('.')
      let target = values
      for (const key of path.slice(0, -1)) {
        if (!isRecord(target[key])) target[key] = {}
        target = target[key] as Record<string, unknown>
      }
      target[path[path.length - 1]!] = value
    }
  }
  return values
}

async function loadLanguages(): Promise<void> {
  loadingLanguages.value = true
  languageError.value = null
  locale.value = ''
  localeOptions.value = []
  sourceLocale.value = ''
  clearDraft()
  markDraftClean()
  try {
    const response = await dashboardApi<{ languages: LanguageRow[] }>(
      `/api/editor/sites/${props.siteId}/locales`,
      { validate: isLanguagesResponse },
    )
    const sources = response.languages.filter(item => Boolean(item.is_source) && item.status === 'published')
    if (sources.length !== 1) throw new Error('The site source language is not configured correctly.')
    sourceLocale.value = sources[0]!.locale
    const secondaryLanguages = response.languages.filter(item => !item.is_source && item.status === 'published')
    if (secondaryLanguages.some(item => !item.label)) throw new Error('An enabled language is missing its display name.')
    localeOptions.value = secondaryLanguages.map(item => ({ label: `${item.label} (${item.locale})`, value: item.locale }))
    const requestedLocale = typeof route.query.locale === 'string' ? route.query.locale : ''
    if (route.query.localize === `${props.resourceType}:${props.resourceId}` && requestedLocale) {
      if (!localeOptions.value.some(option => option.value === requestedLocale)) {
        throw new Error(`The requested ${requestedLocale} language is not enabled for this site.`)
      }
      locale.value = requestedLocale
    }
  } catch (cause) {
    languageError.value = getErrorMessage(cause, 'Failed to load site languages')
  } finally {
    loadingLanguages.value = false
  }
}

async function load(): Promise<void> {
  const requestedLocale = locale.value
  const generation = ++requestGeneration
  documentRevision = null
  clearDraft()
  markDraftClean()
  editorError.value = null
  if (!requestedLocale) return
  loading.value = true
  try {
    const response = props.loadValues ? null : await dashboardApi<LocalizationResponse>(
      `/api/editor/sites/${props.siteId}/localization/${props.resourceType}/${props.resourceId}/${encodeURIComponent(requestedLocale)}`,
      { validate: isLocalizationResponse },
    )
    const values = props.loadValues ? await props.loadValues(requestedLocale)
      : props.resourceType === 'content_document' ? response!.localization : response!.localization.values
    if (generation !== requestGeneration || locale.value !== requestedLocale || !open.value) return
    if (!isRecord(values)) throw new Error('Localized values are unavailable.')
    if (response && typeof response.localization.updated_at === 'string') {
      documentRevision = { locale: requestedLocale, updatedAt: response.localization.updated_at }
    }
    applyValues(values)
  } catch (cause) {
    if (generation !== requestGeneration || locale.value !== requestedLocale || !open.value) return
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) editorError.value = getErrorMessage(cause, 'Failed to load translation')
  } finally {
    if (generation === requestGeneration && locale.value === requestedLocale) loading.value = false
  }
}

async function save(): Promise<void> {
  const requestedLocale = locale.value
  if (!requestedLocale || loading.value) return
  saving.value = true
  editorError.value = null
  try {
    const values = serializedValues()
    if (props.saveValues) {
      await props.saveValues(requestedLocale, values)
    } else {
      await dashboardApi(
        `/api/editor/sites/${props.siteId}/localization/${props.resourceType}/${props.resourceId}/${encodeURIComponent(requestedLocale)}`,
        {
          method: 'PUT',
          body: {
            values,
            ...(props.routePath ? { route_path: props.routePath(requestedLocale) } : {}),
            ...(documentRevision?.locale === requestedLocale ? { expected_updated_at: documentRevision.updatedAt } : {}),
          },
          validate: isLocalizationResponse,
        },
      )
    }
    toast.add({ description: 'Translation saved', color: 'success' })
    emit('saved', requestedLocale)
    markDraftClean()
    open.value = false
  } catch (cause) {
    editorError.value = getErrorMessage(cause, 'Failed to save translation')
  } finally {
    saving.value = false
  }
}

function requestClose(): void {
  modalOpen.value = false
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!open.value || !dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (open.value && !canDiscardDraft()) return false
})

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

watch(open, (value) => {
  requestGeneration += 1
  if (value) void loadLanguages()
  else {
    locale.value = ''
    clearDraft()
    markDraftClean()
    editorError.value = null
  }
})
watch(locale, () => { void load() })
watch(() => props.resourceId, () => {
  requestGeneration += 1
  if (open.value) {
    locale.value = ''
    clearDraft()
    markDraftClean()
  }
})
watchEffect(() => {
  if (route.query.localize === `${props.resourceType}:${props.resourceId}` && props.resourceId) open.value = true
})
</script>
