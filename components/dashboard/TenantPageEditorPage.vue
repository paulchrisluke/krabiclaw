<template>
  <!--
    With nothing below it open, the page is the Pages list's detail column, so
    it renders its rows and nothing else — no panel, no navbar, no second pair.
  -->
  <div v-if="frame.mode.value === 'index'" class="space-y-6">
    <UAlert
      v-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Page could not be loaded"
      :description="loadError"
    />
    <template v-else>
      <div v-if="pending" class="space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-20 rounded-2xl" />
      </div>
      <template v-else>
        <div v-if="isNew" class="flex justify-end">
          <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
        </div>
        <div v-else class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-external-link"
            label="Preview"
            :to="navigablePreviewUrl"
            target="_blank"
            :disabled="!navigablePreviewUrl"
          />
          <DashboardResourceLocalization
            :site-id="siteId"
            resource-type="content_document"
            :resource-id="draft.page_id"
            resource-label="page"
            :fields="localizationFields"
            :load-values="loadPageLocalization"
            :save-values="savePageLocalization"
            :language-settings-path="siteLocalizationSettingsPath"
            :disabled="dirty"
          />
        </div>
        <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
        <EditorNavigationList :groups="navigationGroups" />
      </template>
    </template>
  </div>

  <!--
    Something deeper than my own child is open — a section, a block, a record
    inside one. I draw no rail; the levels below me own both columns.
  -->
  <TenantPageSections v-else-if="frame.mode.value === 'yield'" :site-id="siteId" :page-id="pageId" />

  <UDashboardPanel v-else id="site-page" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="isNew ? 'New page' : draft.title || 'Page'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="pagesPath" label="Pages" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :detail-title="openLabel"
        :dismiss-to="recordPath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="cancel"
        @save="saveOpenSection"
      >
        <template #index>
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <EditorNavigationList :groups="navigationGroups" :active-item="openKey" />
        </template>

        <template #detail>
          <TenantPageSections v-if="openKey === 'sections'" :site-id="siteId" :page-id="pageId" />

          <UFormField v-else-if="openKey === 'title'" label="Title" required>
            <UInput v-model="draft.title" size="xl" maxlength="200" autofocus class="w-full" />
          </UFormField>

          <UFormField
            v-else-if="openKey === 'summary'"
            label="Summary"
            description="A concise introduction used when the page needs one."
          >
            <UTextarea v-model="draft.summary" :rows="5" autoresize autofocus class="w-full" />
          </UFormField>

          <div v-else-if="openKey === 'search'" class="space-y-6">
            <UFormField label="SEO title" description="Falls back to the page title.">
              <UInput v-model="draft.seo_title" size="xl" maxlength="200" autofocus class="w-full" />
            </UFormField>
            <UFormField label="SEO description">
              <UTextarea v-model="draft.seo_description" :rows="3" autoresize maxlength="500" class="w-full" />
            </UFormField>
            <UFormField label="Robots" description="Whether search engines may index and follow this page.">
              <USelect :model-value="robotsValue" :items="ROBOTS_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" @update:model-value="draft.robots = String($event)" />
            </UFormField>
          </div>

          <UFormField
            v-else-if="openKey === 'canonical'"
            label="Canonical URL"
            description="An absolute URL on one of this site's active domains. Leave empty to use this page's own address."
          >
            <UInput v-model="draft.canonical_url" size="xl" placeholder="https://example.com/about" autofocus class="w-full" />
          </UFormField>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import TenantPageSections from '~/components/dashboard/TenantPageSections.vue'
import { getErrorMessage, isNotFoundError, showNotFound } from '~/utils/errors'
import { ROBOTS_INTENTS, ROBOTS_INTENT_LABELS } from '~/shared/robots-directive'
import { previewHrefForTenantPage } from '~/utils/tenant-page-editor-safety'
import { tenantPageBlockLabel } from '~/utils/tenant-page-block-sections'
import {
  alignTenantPageTranslationBlocks,
  createTenantPageTranslationBlocks,
  tenantPageLocalizedTextFields,
  tenantPageTranslationSourceBlockId,
  writeTenantPageLocalizedText,
  type TenantPageBlock,
} from '~/utils/tenant-page-blocks'
import {
  isTenantPageListResponse,
  isTenantPageResponse,
  type TenantPageListRow,
  type TenantPageResponse,
} from '~/composables/useTenantPageDraft'

// The frame comes first, and before any `await`: `useEditorFrame` provides and
// injects, which Vue binds only while setup is still synchronous.
const route = useRoute()
const pageId = computed(() => String(route.params.pageId ?? ''))
const pagesPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages`)
const recordPath = computed(() => `${pagesPath.value}/${pageId.value}`)
const frame = useEditorFrame(recordPath)

const siteId = await useDashboardSiteId()
const dashboardApi = useDashboardApi()

const { load, data, error, pending, draft, dirty, revert, commit, isNew, previewUrl } = useTenantPageDraft(siteId, pageId.value)

// The page has to have been read before this renders, or a missing id answers
// HTTP 200 with the error page painted after hydration: `showError` during the
// render pass only reaches the payload. The Blog chain awaits its own load for
// the same reason.
if (import.meta.server) await load

// A page that is not there is not a page. A request that failed is a state this
// surface shows, because the page may well still exist.
watchEffect(() => {
  if (error.value && isNotFoundError(error.value)) {
    showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  }
})
const loadError = computed(() => (error.value && !isNotFoundError(error.value)
  ? getErrorMessage(error.value, 'Failed to load this page')
  : null))

const SECTION_LABELS = {
  sections: 'Sections',
  title: 'Title',
  summary: 'Summary',
  search: 'Search appearance',
  canonical: 'Canonical URL',
} as const
type SectionKey = keyof typeof SECTION_LABELS

const openKey = computed<SectionKey>(() => (frame.childSegment.value ?? 'title') as SectionKey)
const openLabel = computed(() => SECTION_LABELS[openKey.value])

// An unsupported route 404s rather than quietly showing the first section. A
// watcher, not a setup-time check: moving between leaves reuses this component.
watchEffect(() => {
  const open = frame.childSegment.value
  if (open && !(open in SECTION_LABELS)) return showNotFound()
  // Only Sections has anything beneath it; the rest are leaves.
  if (frame.rest.value.length > 1 && open !== 'sections') showNotFound()
})

const ROBOTS_OPTIONS = ROBOTS_INTENTS.map(value => ({ label: ROBOTS_INTENT_LABELS[value], value }))
/** The stored directive, or nothing: an unrecognised value is not shown as one of the known ones. */
const robotsValue = computed(() => ROBOTS_INTENTS.find(intent => intent === draft.value.robots))

const saving = ref(false)
const errorMessage = ref('')

const navigablePreviewUrl = computed(() => previewHrefForTenantPage(dirty.value, previewUrl.value))
const siteLocalizationSettingsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/settings/localization`)

function preview(value: string, empty: string) {
  return value.trim() || empty
}

const sectionsSummary = computed(() => {
  const count = draft.value.blocks.length
  if (!count) return 'No sections yet'
  return count === 1 ? '1 section' : `${count} sections`
})

const searchSummary = computed(() => {
  const robots = ROBOTS_INTENT_LABELS[draft.value.robots as keyof typeof ROBOTS_INTENT_LABELS]
  return draft.value.seo_title.trim() || robots || 'Falls back to the page title'
})

/**
 * Creating asks for the title and nothing else: everything below describes a
 * page that does not exist yet, and has nowhere to hang until it does.
 */
const navigationGroups = computed<EditorNavigationGroup[]>(() => {
  const title = {
    id: 'title',
    label: 'Title',
    summary: preview(draft.value.title, 'Not named yet'),
    placeholder: !draft.value.title.trim(),
    to: `${recordPath.value}/title`,
  }
  if (isNew.value) return [{ id: 'page', items: [title] }]
  return [
    {
      id: 'content',
      items: [
        {
          id: 'sections',
          label: 'Sections',
          summary: sectionsSummary.value,
          placeholder: !draft.value.blocks.length,
          to: `${recordPath.value}/sections`,
        },
        title,
        {
          id: 'summary',
          label: 'Summary',
          summary: preview(draft.value.summary, 'Nothing written yet'),
          placeholder: !draft.value.summary.trim(),
          to: `${recordPath.value}/summary`,
        },
      ],
    },
    {
      id: 'search',
      label: 'Search',
      items: [
        {
          id: 'search',
          label: 'Search appearance',
          summary: searchSummary.value,
          placeholder: !draft.value.seo_title.trim(),
          to: `${recordPath.value}/search`,
        },
        {
          id: 'canonical',
          label: 'Canonical URL',
          summary: preview(draft.value.canonical_url, 'This page’s own address'),
          placeholder: !draft.value.canonical_url.trim(),
          to: `${recordPath.value}/canonical`,
        },
      ],
    },
  ]
})

const { createActionLabel, saveLabel, saveDisabled, save: saveOpenSection, startOrCreate } = useCreateWalk({
  recordPath,
  isNew,
  openKey,
  labels: SECTION_LABELS,
  order: ['title'],
  missing: () => !draft.value.title.trim(),
  noun: 'page',
  saving: computed(() => saving.value || pending.value),
  // An existing page saves what is in front of the tenant; there is nothing to
  // save when the draft still matches what was loaded.
  existingBlocked: () => !dirty.value,
  commit: save,
})

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const created = isNew.value
    const page = await commit()
    await navigateTo(created ? `${pagesPath.value}/${page.id}` : recordPath.value)
  } catch (cause) {
    errorMessage.value = getErrorMessage(cause, 'Failed to save this page')
  } finally {
    saving.value = false
  }
}

/** Dismissing a leaf discards its draft and goes back one level. */
function cancel() {
  errorMessage.value = ''
  revert()
  void navigateTo(recordPath.value)
}

// ── Localization ────────────────────────────────────────
// The page and its blocks are one document, so a translation is another variant
// of that document rather than a second store of translated strings.
interface PageLocalizationState {
  locale: string
  variant: TenantPageResponse | null
  blocks: TenantPageBlock[]
}
let localizationState: PageLocalizationState | null = null
let localizationGeneration = 0

function blockFieldKey(blockId: string, path: readonly (string | number)[]): string {
  return `content:${blockId}:${path.join('.')}`
}

const localizationFields = computed(() => {
  const page = data.value?.page
  if (!page) return []
  const fields: Array<{ key: string; label: string; source: string | null; multiline?: boolean; rows?: number }> = [
    { key: 'title', label: 'Title', source: page.title },
    { key: 'summary', label: 'Summary', source: page.summary, multiline: true, rows: 3 },
  ]
  page.blocks.forEach((block, blockIndex) => {
    tenantPageLocalizedTextFields(block).forEach((field) => {
      fields.push({
        key: blockFieldKey(block.id, field.path),
        label: `${tenantPageBlockLabel(block.type)} ${blockIndex + 1} · ${field.label}`,
        source: field.value,
        multiline: true,
        rows: 3,
      })
    })
  })
  return fields
})

async function loadPageLocalization(locale: string): Promise<Record<string, unknown>> {
  const source = data.value?.page
  if (!source) throw new Error('The source page is unavailable.')
  const generation = ++localizationGeneration
  let variant: TenantPageResponse | null = null
  let blocks = createTenantPageTranslationBlocks(toRaw(source.blocks))
  const list = await dashboardApi<{ pages: TenantPageListRow[] }>(
    `/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(locale)}`,
    { validate: isTenantPageListResponse },
  )
  const summary = list.pages.find(page => page.page_id === source.page_id)
  const values: Record<string, unknown> = {}
  if (summary) {
    const response = await dashboardApi<{ page: TenantPageResponse }>(
      `/api/editor/sites/${siteId}/pages/${summary.id}`,
      { validate: isTenantPageResponse },
    )
    variant = response.page
    blocks = alignTenantPageTranslationBlocks(toRaw(source.blocks), response.page.blocks)
    values.title = response.page.title
    if (response.page.summary) values.summary = response.page.summary
  }
  // A language switched twice resolves in whatever order the network chose;
  // only the answer to the question still being asked is allowed to land.
  if (generation !== localizationGeneration) return {}
  localizationState = { locale, variant, blocks }
  source.blocks.forEach((sourceBlock) => {
    const block = blocks.find(candidate => tenantPageTranslationSourceBlockId(candidate) === sourceBlock.id)
    if (!block) throw new Error(`The translation for source block ${sourceBlock.id} is unavailable.`)
    tenantPageLocalizedTextFields(block).forEach((field) => {
      values[blockFieldKey(sourceBlock.id, field.path)] = field.value
    })
  })
  return values
}

async function savePageLocalization(locale: string, submitted: Record<string, unknown>): Promise<void> {
  const source = data.value?.page
  const state = localizationState
  if (!source || !state || state.locale !== locale) throw new Error('Choose the language again before saving.')
  const title = submitted.title
  if (typeof title !== 'string' || !title.trim()) throw new Error('Add the translated page title before saving.')
  const blocks = structuredClone(toRaw(state.blocks))
  source.blocks.forEach((sourceBlock) => {
    const block = blocks.find(candidate => tenantPageTranslationSourceBlockId(candidate) === sourceBlock.id)
    if (!block) throw new Error(`The translation for source block ${sourceBlock.id} is unavailable.`)
    tenantPageLocalizedTextFields(block).forEach((field) => {
      const value = submitted[blockFieldKey(sourceBlock.id, field.path)]
      if (typeof value === 'string') writeTenantPageLocalizedText(block, field.path, value)
    })
  })
  const body = {
    id: state.variant?.id,
    pageId: source.page_id,
    locale,
    path: source.path,
    title: title.trim(),
    summary: typeof submitted.summary === 'string' ? submitted.summary : '',
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: source.robots || null,
    pageType: source.page_type,
    recipe: source.recipe || null,
    sortOrder: source.sort_order,
    blocks,
    expectedUpdatedAt: state.variant?.document.updated_at,
  }
  const response = state.variant
    ? await dashboardApi<{ page: TenantPageResponse }>(`/api/editor/sites/${siteId}/pages/${state.variant.id}`, { method: 'PATCH', body, validate: isTenantPageResponse })
    : await dashboardApi<{ page: TenantPageResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: isTenantPageResponse })
  localizationState = {
    locale,
    variant: response.page,
    blocks: alignTenantPageTranslationBlocks(toRaw(source.blocks), response.page.blocks),
  }
}

useSeoMeta({ title: 'Page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
