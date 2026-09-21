<template>
  <!--
    The page: its rows are its sections list and the fields a page has of its
    own. Each is a level below this one; the shell reads which is open.
  -->
  <DashboardIndexPanel id="site-page" :title="isNew ? 'New page' : draft.title || 'Page'">
    <UAlert
      v-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Page could not be loaded"
      :description="loadError"
    />
    <div v-else-if="pending" class="space-y-3">
      <USkeleton v-for="index in 4" :key="index" class="h-20 rounded-2xl" />
    </div>
    <template v-else>
      <div v-if="isNew" class="mb-6 flex justify-end">
        <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
      </div>
      <div v-else class="mb-6 flex flex-wrap items-center justify-end gap-2">
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
      <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
      <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
    </template>
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Ref } from 'vue'
import { ROBOTS_INTENTS, ROBOTS_INTENT_LABELS } from '~/shared/robots-directive'
import {
  isTenantPageListResponse,
  isTenantPageResponse,
  type TenantPageDraft,
  type TenantPageListRow,
  type TenantPageResponse,
} from '~/composables/useTenantPageDraft'

export const SECTION_LABELS = {
  sections: 'Sections',
  title: 'Title',
  summary: 'Summary',
  search: 'Search appearance',
  canonical: 'Canonical URL',
} as const
export type SectionKey = keyof typeof SECTION_LABELS

export const ROBOTS_OPTIONS = ROBOTS_INTENTS.map(value => ({ label: ROBOTS_INTENT_LABELS[value], value }))

/**
 * What a page's own leaves edit and how they commit. The draft itself is the
 * keyed store in `useTenantPageDraft`; this adds the page level's save walk so
 * a leaf's footer says `Create page` or `Save` for the same reasons the rows do.
 */
export interface TenantPageEditor {
  draft: Ref<TenantPageDraft>
  ready: Ref<boolean>
  saving: Ref<boolean>
  saveDisabled: Ref<boolean>
  saveLabel: Ref<string | undefined>
  errorMessage: Ref<string>
  revert: () => void
  save: () => Promise<void>
}

export const tenantPageEditorKey = Symbol('tenant-page-editor') as InjectionKey<TenantPageEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { getErrorMessage, isNotFoundError, showNotFound } from '~/utils/errors'
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

// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()
const route = useRoute()
const pageId = computed(() => String(route.params.pageId ?? ''))
const recordPath = level.path

const siteId = await useDashboardSiteId()
const dashboardApi = useDashboardApi()

const { data, error, pending, draft, dirty, revert, commit, isNew, previewUrl } = useTenantPageDraft(siteId, pageId.value)

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

/** The open child, for the create walk; with nothing open the walk starts at Title. */
const openKey = computed<SectionKey>(() => (level.child.value ?? 'title') as SectionKey)

// An unsupported route 404s rather than quietly showing the first section. A
// watcher, not a setup-time check: moving between leaves reuses this component.
watchEffect(() => {
  const open = level.child.value
  if (open && !(open in SECTION_LABELS)) return showNotFound()
  // Only Sections has anything beneath it; the rest are leaves.
  if (level.mode.value === 'yield' && open !== 'sections') showNotFound()
})

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
    // A created page is the record it became, not the `new` form it was, so
    // Back from it goes to Pages and never to an empty Add screen.
    if (created) await navigateTo(`${level.to.value}/${page.id}`, { replace: true })
    else await level.close()
  } catch (cause) {
    errorMessage.value = getErrorMessage(cause, 'Failed to save this page')
  } finally {
    saving.value = false
  }
}

/** A cancelled leaf puts the loaded page back before it closes. */
function revertDraft() {
  errorMessage.value = ''
  revert()
}

provide(tenantPageEditorKey, {
  draft,
  ready: computed(() => !pending.value),
  saving,
  saveDisabled,
  saveLabel,
  errorMessage,
  revert: revertDraft,
  save: saveOpenSection,
})

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
