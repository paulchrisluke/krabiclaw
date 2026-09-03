<template>
  <UDashboardPanel id="tenant-page-editor" class="min-w-0 bg-default" :ui="{ root: 'h-full min-h-0', body: 'min-h-0 overflow-y-auto p-0' }">
    <template #header>
      <UDashboardNavbar :toggle="false" :title="mobileTitle" class="bg-default lg:hidden" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UButton v-if="selectedSectionId" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="Back to page outline" @click="returnToOutline" />
          <UButton v-else :to="pagesPath" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="Back to pages" />
        </template>
        <template #right>
          <UButton v-if="dirty" label="Save" :loading="busy === 'save'" :disabled="busy !== null" @click="saveCurrentPage" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="mx-auto w-full max-w-2xl space-y-4 px-5 py-8">
        <USkeleton class="h-32 rounded-2xl" />
        <USkeleton class="h-80 rounded-2xl" />
      </div>

      <div v-else-if="!selected" class="mx-auto w-full max-w-2xl px-5 py-8">
        <UAlert color="error" variant="soft" title="Page unavailable" :description="pageLoadError || 'This page could not be loaded.'" />
      </div>

      <EditorPaneShell v-else :has-detail="Boolean(selectedSectionId)" show-desktop-detail>
        <template #index>
          <div class="mb-8 hidden items-center gap-4 lg:flex">
            <UButton :to="pagesPath" icon="i-lucide-arrow-left" color="neutral" variant="soft" square aria-label="Back to pages" class="rounded-full" />
            <h1 class="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-highlighted">Page editor</h1>
          </div>
          <UAlert v-if="pageLoadError" class="mb-5" color="error" variant="soft" title="Page could not be loaded" :description="pageLoadError" />
          <UAlert v-if="editorError" class="mb-5" color="error" variant="soft" title="Page could not be saved" :description="editorError" />
          <TenantPageOutline
            :title="selected.title"
            :summary="selected.summary"
            :locale="selected.locale"
            :path="selected.path"
            :blocks="selected.blocks"
            :preview-blocks="previewBlocks"
            :selected-id="desktopSelectedId"
            :block-type-options="blockTypeOptions"
            :disabled="busy !== null"
            @select="openSection"
            @add="addBlock"
            @move="moveBlock"
            @duplicate="duplicateBlock"
            @remove="removeBlock"
          />
          <div class="mt-8 flex flex-col items-center gap-2">
            <UButton :to="navigablePreviewUrl" target="_blank" icon="i-lucide-eye" label="Preview page" color="neutral" variant="solid" :disabled="busy !== null || !navigablePreviewUrl" class="min-w-44 justify-center rounded-full" />
            <span v-if="dirty" class="text-xs text-warning">Unsaved changes</span>
          </div>
        </template>

        <template #detail>
          <div class="mx-auto max-w-xl">
            <div class="mb-8 hidden items-start justify-between gap-5 lg:flex">
              <div class="min-w-0">
                <h2 class="text-4xl font-bold tracking-tight text-highlighted">{{ readTitle }}</h2>
                <p v-if="dirty" class="mt-2 text-sm text-warning">Unsaved changes</p>
              </div>
              <UButton v-if="dirty" label="Save changes" :loading="busy === 'save'" :disabled="busy !== null" @click="saveCurrentPage" />
            </div>

            <UAlert v-if="pageLoadError" class="mb-5" color="error" variant="soft" title="Page could not be loaded" :description="pageLoadError" />
            <UAlert v-if="editorError && !focusedField" class="mb-5" color="error" variant="soft" title="Page could not be saved" :description="editorError" />

            <template v-if="readSection.kind === 'details'">
              <div class="space-y-3 lg:divide-y lg:divide-default lg:space-y-0 lg:border-y lg:border-default">
                <button v-for="field in pageFields" :key="field.id" type="button" class="w-full rounded-[1.25rem] bg-white p-5 text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:rounded-none lg:bg-transparent lg:px-0 lg:py-6 lg:shadow-none lg:hover:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent" @click="openPageField(field.id, $event.currentTarget)">
                  <span class="block text-sm font-semibold text-highlighted lg:text-muted">{{ field.label }}</span>
                  <span class="mt-2 line-clamp-4 block text-lg leading-7 text-toned lg:text-highlighted">{{ field.value || 'Not set' }}</span>
                </button>
                <div v-for="field in readonlyPageFields" :key="field.label" class="rounded-[1.25rem] bg-white p-5 shadow-sm lg:rounded-none lg:bg-transparent lg:px-0 lg:py-6 lg:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent">
                  <p class="text-sm font-semibold text-highlighted lg:text-muted">{{ field.label }}</p>
                  <p class="mt-2 break-words text-lg leading-7 text-toned lg:text-highlighted">{{ field.value || 'Not set' }}</p>
                </div>
                <div v-if="!isNew && localeOptions.length > 1" class="rounded-[1.25rem] bg-white p-5 shadow-sm lg:rounded-none lg:bg-transparent lg:px-0 lg:py-6 lg:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent">
                  <label for="tenant-page-language" class="block text-sm font-semibold text-highlighted lg:text-muted">Language</label>
                  <USelect id="tenant-page-language" v-model="locale" :items="localeOptions" class="mt-2 w-full" :disabled="busy !== null" />
                </div>
                <div v-else class="rounded-[1.25rem] bg-white p-5 shadow-sm lg:rounded-none lg:bg-transparent lg:px-0 lg:py-6 lg:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent">
                  <p class="text-sm font-semibold text-highlighted lg:text-muted">Language</p>
                  <p class="mt-2 text-lg leading-7 text-toned lg:text-highlighted">{{ selected.locale.toUpperCase() }}</p>
                </div>
              </div>
            </template>

            <template v-else-if="activeBlock">
              <div class="overflow-hidden rounded-[1.25rem] bg-white shadow-sm lg:rounded-none lg:bg-transparent lg:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent">
                <TenantPageSectionPreview :block="previewBlock(activeBlock)" />
              </div>
              <button v-if="activeBlock.type !== 'divider'" type="button" class="mt-6 w-full rounded-[1.25rem] bg-white p-5 text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:rounded-none lg:border-y lg:border-default lg:bg-transparent lg:px-0 lg:py-6 lg:shadow-none lg:hover:shadow-none dark:bg-white/[0.04] lg:dark:bg-transparent" @click="openBlockField($event.currentTarget)">
                <span class="block text-sm font-semibold text-highlighted lg:text-muted">Content</span>
                <span class="mt-2 line-clamp-4 block text-lg leading-7 text-toned lg:text-highlighted">{{ blockSummary(activeBlock) }}</span>
              </button>
            </template>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <EditorFocusedField
    :open="Boolean(focusedField)"
    :title="focusedTitle"
    :saving="busy === 'save'"
    :save-disabled="!fieldDraft"
    :error="editorError"
    @close="closeFocusedField"
    @cancel="cancelFocusedField"
    @save="saveFocusedField"
    @restore-focus="restoreFieldFocus"
  >
    <UInput v-if="fieldDraft?.kind === 'title'" v-model="fieldDraft.value" size="xl" aria-label="Page title" :disabled="busy !== null" class="w-full" />
    <UTextarea v-else-if="fieldDraft?.kind === 'summary'" v-model="fieldDraft.value" :rows="8" autoresize aria-label="Short description" :disabled="busy !== null" class="w-full" />
    <fieldset v-else-if="fieldDraft?.kind === 'block'" :disabled="busy !== null" class="contents">
      <TenantPageBlockEditor :block="fieldDraft.block" :site-id="resolvedSiteId" :page-recipe="selected?.recipe" :page-type="selected?.page_type ?? 'custom'" @update:block="updateDraftBlock" />
    </fieldset>
  </EditorFocusedField>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type LocationQueryRaw } from 'vue-router'
import EditorFocusedField from '~/components/dashboard/EditorFocusedField.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { slugifyTitle } from '~/utils/post-slugs'
import { TENANT_PAGE_BLOCK_REGISTRY, createTenantPageBlock, isTenantPageBlockAllowed, type TenantPageBlock, type TenantPageBlockType, type TenantPageMedia, type TenantPageType } from '~/utils/tenant-page-blocks'
import { createTenantPageEditorData, tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { canProceedWithTenantPageTransition, createTenantPageLocaleRevertGuard, createTenantPageRequestGate, previewHrefForTenantPage } from '~/utils/tenant-page-editor-safety'

const props = defineProps<{ pageId?: string }>()

interface PageSummary { id: string, page_id: string, title: string, path: string, page_type: TenantPageType, recipe: string | null, locale: string, sort_order: number, updated_at: string }
interface PageDetailResponse extends PageSummary { site_id: string, organization_id: string, summary: string | null, seo_title: string | null, seo_description: string | null, canonical_url: string | null, robots: string | null, blocks: TenantPageBlock[], document: { updated_at: string } }
interface PageDetail extends Omit<PageDetailResponse, 'recipe' | 'summary' | 'seo_title' | 'seo_description' | 'canonical_url' | 'robots'> { recipe: string, summary: string, seo_title: string, seo_description: string, canonical_url: string, robots: string }
type PageFieldId = 'title' | 'summary'
type ReadSection = { kind: 'details' } | { kind: 'block', blockId: string }
type FieldDraft = { kind: 'title', value: string } | { kind: 'summary', value: string } | { kind: 'block', block: TenantPageBlock }
interface GalleryMediaResponse { media: Array<Pick<TenantPageMedia, 'asset_id'> & Partial<TenantPageMedia>> }
interface GalleryChange { blockId: string, desired: TenantPageMedia[] }
interface PreviewPageResponse { page: { blocks: TenantPageBlock[] } }

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 503, statusMessage: 'Dashboard site context unavailable' })
const resolvedSiteId = siteId

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const toast = useToast()
const platformOrigin = useRequestURL().origin
const pagesPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/pages`)
const isNew = computed(() => !props.pageId)
const selected = ref<PageDetail | null>(null)
const locale = ref('en')
const locales = ref<string[]>([locale.value])
const loading = ref(true)
const pageLoadError = ref<string | null>(null)
const editorError = ref<string | null>(null)
const busy = ref<'save' | null>(null)
const previewToken = ref('')
const dirty = ref(false)
const hydrating = ref(false)
const requestGate = createTenantPageRequestGate()
const localeRevertGuard = createTenantPageLocaleRevertGuard()
const fieldDraft = ref<FieldDraft | null>(null)
const fieldTrigger = ref<HTMLElement | null>(null)
const allowFieldExit = ref(false)
const initialFieldSnapshot = ref('')
const persistedGalleryMedia = ref(new Map<string, TenantPageMedia[]>())
const sourcePreviewBlocks = ref<TenantPageBlock[]>([])

const blockTypeOptions = computed(() => Object.values(TENANT_PAGE_BLOCK_REGISTRY)
  .filter(definition => !selected.value || isTenantPageBlockAllowed(definition, selected.value.recipe, selected.value.page_type))
  .map(definition => ({ label: definition.label, value: definition.type })))
const localeOptions = computed(() => locales.value.map(value => ({ label: value.toUpperCase(), value })))
const previewUrl = computed(() => {
  if (!selected.value?.id || !previewToken.value) return ''
  const path = selected.value.path === '/' ? '' : selected.value.path
  return `${platformOrigin}/preview/site/${siteId}${path}?preview=true&token=${encodeURIComponent(previewToken.value)}&locale=${encodeURIComponent(locale.value)}`
})
const requestedSectionId = computed(() => singleQueryValue(route.query.section))
const selectedSectionId = computed(() => {
  const requested = requestedSectionId.value
  if (requested === 'details') return requested
  return selected.value?.blocks.some(block => block.id === requested) ? requested : ''
})
const desktopSelectedId = computed(() => selectedSectionId.value || 'details')
const readSection = computed<ReadSection>(() => selectedSectionId.value && selectedSectionId.value !== 'details'
  ? { kind: 'block', blockId: selectedSectionId.value }
  : { kind: 'details' })
const activeBlock = computed(() => {
  const section = readSection.value
  return section.kind === 'block' ? selected.value?.blocks.find(block => block.id === section.blockId) ?? null : null
})
const previewBlocks = computed(() => selected.value?.blocks.map(previewBlock) ?? [])
const readTitle = computed(() => readSection.value.kind === 'details' ? 'Page details' : activeBlock.value ? TENANT_PAGE_BLOCK_REGISTRY[activeBlock.value.type].label : 'Page editor')
const mobileTitle = computed(() => selectedSectionId.value ? readTitle.value : 'Page editor')
const requestedFieldId = computed(() => singleQueryValue(route.query.field))
const focusedField = computed(() => {
  if (!selectedSectionId.value || !requestedFieldId.value) return null
  if (readSection.value.kind === 'details' && (requestedFieldId.value === 'title' || requestedFieldId.value === 'summary')) return requestedFieldId.value
  if (readSection.value.kind === 'block' && requestedFieldId.value === 'content' && activeBlock.value?.type !== 'divider') return 'content'
  return null
})
const focusedTitle = computed(() => focusedField.value === 'title' ? 'Page title' : focusedField.value === 'summary' ? 'Short description' : readTitle.value)
const fieldDraftDirty = computed(() => fieldDraft.value !== null && JSON.stringify(fieldDraft.value) !== initialFieldSnapshot.value)
const navigablePreviewUrl = computed(() => previewHrefForTenantPage(dirty.value || fieldDraftDirty.value, previewUrl.value))
const pageFields = computed(() => [
  { id: 'title' as const, label: 'Title', value: selected.value?.title ?? '' },
  { id: 'summary' as const, label: 'Description', value: selected.value?.summary ?? '' },
])
const readonlyPageFields = computed(() => [
  { label: 'URL', value: selected.value?.path || 'Not set' },
])

function singleQueryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function validateList(value: unknown): value is { pages: PageSummary[] } {
  return isRecord(value) && Array.isArray(value.pages) && value.pages.every(page => isRecord(page) && typeof page.id === 'string' && typeof page.page_id === 'string')
}

function validatePage(value: unknown): value is { page: PageDetailResponse } {
  return isRecord(value) && isRecord(value.page) && typeof value.page.id === 'string' && isRecord(value.page.document) && Array.isArray(value.page.blocks)
}

function validateContext(value: unknown): value is { context: { previewToken: string } } {
  return isRecord(value) && isRecord(value.context) && typeof value.context.previewToken === 'string'
}

function validateLocales(value: unknown): value is { languages: Array<{ locale: string, locale_status: string }> } {
  return isRecord(value) && Array.isArray(value.languages)
}

function validatePreviewPage(value: unknown): value is PreviewPageResponse {
  return isRecord(value) && isRecord(value.page) && Array.isArray(value.page.blocks)
}

function toEditorPage(page: PageDetailResponse): PageDetail {
  return { ...page, recipe: page.recipe ?? '', summary: page.summary ?? '', seo_title: page.seo_title ?? '', seo_description: page.seo_description ?? '', canonical_url: page.canonical_url ?? '', robots: page.robots ?? '' }
}

function canDiscardUnsavedChanges(message = 'Discard unsaved page changes?') {
  return canProceedWithTenantPageTransition(dirty.value, () => window.confirm(message))
}

async function loadEditor() {
  const requestToken = requestGate.begin()
  hydrating.value = true
  loading.value = true
  pageLoadError.value = null
  try {
    const [contextResponse, localeResponse, pageResponse, pagesResponse] = await Promise.all([
      dashboardApi<{ context: { previewToken: string } }>(`/api/editor/sites/${siteId}/context`, { validate: validateContext }),
      dashboardApi<{ languages: Array<{ locale: string, locale_status: string }> }>(`/api/editor/sites/${siteId}/locales`, { validate: validateLocales }),
      props.pageId ? dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${props.pageId}`, { validate: validatePage }) : Promise.resolve(null),
      props.pageId ? Promise.resolve(null) : dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(locale.value)}`, { validate: validateList }),
    ])
    if (!requestGate.isCurrent(requestToken)) return
    previewToken.value = contextResponse.context.previewToken
    locales.value = localeResponse.languages.filter(item => item.locale_status === 'published').map(item => item.locale)
    if (pageResponse) {
      selected.value = toEditorPage(pageResponse.page)
      locale.value = pageResponse.page.locale
      persistedGalleryMedia.value = galleryMediaMap(selected.value.blocks)
      sourcePreviewBlocks.value = await loadSourcePreviewBlocks(selected.value, contextResponse.context.previewToken)
    } else {
      locale.value = 'en'
      selected.value = {
        id: '', page_id: '', site_id: resolvedSiteId, organization_id: '', locale: locale.value, path: '', title: '', page_type: 'custom', recipe: '', sort_order: pagesResponse?.pages.length ?? 0, updated_at: '',
        summary: '', seo_title: '', seo_description: '', canonical_url: '', robots: '', blocks: [], document: { updated_at: '' },
      }
      persistedGalleryMedia.value = new Map()
      sourcePreviewBlocks.value = []
    }
    dirty.value = false
  } catch (error) {
    pageLoadError.value = error instanceof Error ? error.message : 'Unable to load page'
    selected.value = null
  } finally {
    if (requestGate.isCurrent(requestToken)) {
      hydrating.value = false
      loading.value = false
    }
  }
}

function openSection(id: string, trigger: EventTarget | null) {
  if (trigger instanceof HTMLElement) fieldTrigger.value = trigger
  const query: LocationQueryRaw = { ...route.query, section: id }
  delete query.field
  void router.push({ query })
}

function returnToOutline() {
  const query: LocationQueryRaw = { ...route.query }
  delete query.section
  delete query.field
  if (canReturnWithinEditor()) void router.back()
  else void router.replace({ query })
}

function openPageField(field: PageFieldId, trigger: EventTarget | null) {
  if (trigger instanceof HTMLElement) fieldTrigger.value = trigger
  void router.push({ query: { ...route.query, section: 'details', field } })
}

function openBlockField(trigger: EventTarget | null) {
  if (!activeBlock.value || activeBlock.value.type === 'divider') return
  if (trigger instanceof HTMLElement) fieldTrigger.value = trigger
  void router.push({ query: { ...route.query, section: activeBlock.value.id, field: 'content' } })
}

function closeFocusedField() {
  if (!busy.value) leaveFocusedField()
}

function cancelFocusedField() {
  if (busy.value) return
  allowFieldExit.value = true
  leaveFocusedField()
}

function leaveFocusedField() {
  const query: LocationQueryRaw = { ...route.query }
  delete query.field
  if (canReturnWithinEditor()) void router.back()
  else void router.replace({ query })
}

function canReturnWithinEditor(): boolean {
  if (!import.meta.client) return false
  const previousUrl = window.history.state?.back
  if (typeof previousUrl !== 'string') return false
  return new URL(previousUrl, window.location.href).pathname === route.path
}

function restoreFieldFocus() {
  void nextTick(() => fieldTrigger.value?.focus())
}

function addBlock(type: TenantPageBlockType) {
  if (!selected.value) return
  const definition = TENANT_PAGE_BLOCK_REGISTRY[type]
  if (!definition || !isTenantPageBlockAllowed(definition, selected.value.recipe, selected.value.page_type)) return
  const position = selected.value.blocks.length
  const block = createTenantPageBlock(type, createTenantPageEditorData(type), position)
  selected.value.blocks.push(block)
  openSection(block.id, null)
}

function moveBlock(index: number, delta: number) {
  if (!selected.value) return
  const next = index + delta
  if (next < 0 || next >= selected.value.blocks.length) return
  const block = selected.value.blocks[index]
  if (!block) return
  selected.value.blocks.splice(index, 1)
  selected.value.blocks.splice(next, 0, block)
  selected.value.blocks.forEach((item, position) => { item.position = position })
}

function duplicateBlock(index: number) {
  if (!selected.value) return
  const original = selected.value.blocks[index]
  if (!original) return
  const copy: TenantPageBlock = { ...cloneEditorValue(original), id: crypto.randomUUID(), position: index + 1 }
  selected.value.blocks.splice(index + 1, 0, copy)
  selected.value.blocks.forEach((block, position) => { block.position = position })
}

function removeBlock(index: number) {
  if (!selected.value) return
  const removed = selected.value.blocks[index]
  selected.value.blocks.splice(index, 1)
  selected.value.blocks.forEach((block, position) => { block.position = position })
  if (removed?.id === selectedSectionId.value) returnToOutline()
}

function blockSummary(block: TenantPageBlock): string {
  return tenantPageBlockSummary(block)
}

function updateDraftBlock(block: TenantPageBlock) {
  if (fieldDraft.value?.kind === 'block') fieldDraft.value = { kind: 'block', block: cloneEditorValue(block) }
}

function isSourceBacked(block: TenantPageBlock): boolean {
  const source = block.data.source
  return (block.type === 'faq' && source === 'page_qa')
    || (block.type === 'feature_grid' && source === 'site_posts')
    || (block.type === 'testimonial_grid' && source === 'site_reviews')
    || (block.type === 'offering_grid' && source === 'site_offerings')
}

async function loadSourcePreviewBlocks(page: PageDetail, token: string): Promise<TenantPageBlock[]> {
  if (!page.blocks.some(isSourceBacked)) return []
  const query = new URLSearchParams({ path: page.path, locale: page.locale, preview: 'true', token })
  const response = await dashboardApi<PreviewPageResponse>(`/api/public/sites/${siteId}/pages?${query}`, { validate: validatePreviewPage })
  return response.page.blocks
}

function previewBlock(block: TenantPageBlock): TenantPageBlock {
  if (!isSourceBacked(block)) return block
  const hydrated = sourcePreviewBlocks.value.find(item => item.id === block.id && item.type === block.type && item.data.source === block.data.source)
  return hydrated ? { ...block, data: { ...block.data, items: hydrated.data.items } } : block
}

function cloneEditorValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function galleryMediaMap(blocks: TenantPageBlock[]): Map<string, TenantPageMedia[]> {
  return new Map(blocks
    .filter(block => block.type === 'gallery')
    .map(block => [block.id, cloneEditorValue(block.media)]))
}

function assetOrder(media: TenantPageMedia[]): string[] {
  return media
    .filter(item => item.slot === 'gallery')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(item => item.asset_id)
}

function galleryChangesFor(candidate: PageDetail): GalleryChange[] {
  return candidate.blocks.flatMap((block) => {
    const persisted = persistedGalleryMedia.value.get(block.id)
    if (block.type !== 'gallery' || !persisted) return []
    return JSON.stringify(assetOrder(persisted)) === JSON.stringify(assetOrder(block.media))
      ? []
      : [{ blockId: block.id, desired: cloneEditorValue(block.media) }]
  })
}

function pageWriteBlocks(candidate: PageDetail): TenantPageBlock[] {
  return candidate.blocks.map((block) => {
    const persisted = persistedGalleryMedia.value.get(block.id)
    return block.type === 'gallery' && persisted
      ? { ...block, media: cloneEditorValue(persisted) }
      : block
  })
}

function validateGalleryMediaResponse(value: unknown): value is GalleryMediaResponse {
  return isRecord(value) && Array.isArray(value.media)
    && value.media.every(item => isRecord(item) && typeof item.asset_id === 'string')
}

function toGalleryMedia(response: GalleryMediaResponse): TenantPageMedia[] {
  return response.media.map((item, sortOrder) => ({
    asset_id: item.asset_id,
    slot: 'gallery',
    sort_order: item.sort_order ?? sortOrder,
    public_url: item.public_url ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    kind: item.kind ?? null,
    alt_text: item.alt_text ?? null,
  }))
}

async function reconcileGallery(change: GalleryChange): Promise<TenantPageMedia[]> {
  const placement = { owner_type: 'content_block', owner_id: change.blockId, slot: 'gallery' }
  const desiredOrder = assetOrder(change.desired)
  let current = cloneEditorValue(persistedGalleryMedia.value.get(change.blockId) ?? [])
  let currentOrder = assetOrder(current)

  for (const assetId of desiredOrder.filter(assetId => !currentOrder.includes(assetId))) {
    const response = await dashboardApi<GalleryMediaResponse>(`/api/editor/sites/${siteId}/media/placements/attach`, {
      method: 'POST', body: { placement, asset_id: assetId }, validate: validateGalleryMediaResponse,
    })
    current = toGalleryMedia(response)
    currentOrder = assetOrder(current)
    persistedGalleryMedia.value.set(change.blockId, current)
  }
  for (const assetId of currentOrder.filter(assetId => !desiredOrder.includes(assetId))) {
    const response = await dashboardApi<GalleryMediaResponse>(`/api/editor/sites/${siteId}/media/placements/remove`, {
      method: 'POST', body: { placement, asset_id: assetId }, validate: validateGalleryMediaResponse,
    })
    current = toGalleryMedia(response)
    currentOrder = assetOrder(current)
    persistedGalleryMedia.value.set(change.blockId, current)
  }
  if (JSON.stringify(currentOrder) !== JSON.stringify(desiredOrder)) {
    const response = await dashboardApi<GalleryMediaResponse>(`/api/editor/sites/${siteId}/media/placements/reorder`, {
      method: 'POST', body: { placement, moves: desiredOrder.map(asset_id => ({ asset_id })) }, validate: validateGalleryMediaResponse,
    })
    current = toGalleryMedia(response)
    persistedGalleryMedia.value.set(change.blockId, current)
  }
  return current
}

async function saveCurrentPage() {
  if (selected.value) await persistPage(cloneEditorValue(selected.value))
}

async function saveFocusedField() {
  if (busy.value) return
  const draft = fieldDraft.value
  if (!selected.value || !draft) return
  editorError.value = null
  const candidate = cloneEditorValue(selected.value)
  if (draft.kind === 'title') {
    if (!draft.value.trim()) {
      editorError.value = 'Add a page title before saving.'
      return
    }
    candidate.title = draft.value
  } else if (draft.kind === 'summary') {
    candidate.summary = draft.value
  } else {
    const invalid = validateTenantPageBlock(draft.block)
    if (invalid.length) {
      editorError.value = invalid.join(' ')
      return
    }
    const blockIndex = candidate.blocks.findIndex(block => block.id === draft.block.id)
    if (blockIndex < 0) {
      editorError.value = 'This section is no longer available.'
      return
    }
    candidate.blocks[blockIndex] = cloneEditorValue(draft.block)
  }
  if (await persistPage(candidate) && focusedField.value) {
    allowFieldExit.value = true
    leaveFocusedField()
  }
}

async function persistPage(candidate: PageDetail): Promise<boolean> {
  if (busy.value) return false
  busy.value = 'save'
  editorError.value = null
  const galleryChanges = galleryChangesFor(candidate)
  let persistedPage: PageDetail | null = null
  try {
    const title = candidate.title.trim()
    if (!title) throw new Error('Add a page title before saving.')
    const invalidIndex = candidate.blocks.findIndex(block => validateTenantPageBlock(block).length > 0)
    if (invalidIndex >= 0) throw new Error(`Resolve the highlighted fields in section ${invalidIndex + 1} before saving.`)
    candidate.blocks.forEach((block, index) => { block.position = index })
    const path = candidate.id ? candidate.path : `/${slugifyTitle(title)}`
    if (!candidate.id && path === '/') throw new Error('Choose a more specific page title.')
    const body = {
      id: candidate.id || undefined,
      pageId: candidate.page_id || undefined,
      locale: candidate.locale,
      path,
      title,
      summary: candidate.summary,
      seoTitle: candidate.seo_title || null,
      seoDescription: candidate.seo_description || null,
      canonicalUrl: candidate.canonical_url || null,
      robots: candidate.robots || null,
      pageType: candidate.page_type,
      recipe: candidate.recipe || null,
      sortOrder: candidate.sort_order,
      blocks: pageWriteBlocks(candidate),
      expectedDocumentUpdatedAt: candidate.id ? candidate.document.updated_at : undefined,
    }
    const response = candidate.id
      ? await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${candidate.id}`, { method: 'PATCH', body, validate: validatePage })
      : await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: validatePage })
    persistedPage = toEditorPage(response.page)
    persistedGalleryMedia.value = galleryMediaMap(persistedPage.blocks)
    for (const change of galleryChanges) {
      const block = persistedPage.blocks.find(item => item.id === change.blockId)
      if (block) block.media = await reconcileGallery(change)
    }
    hydrating.value = true
    selected.value = persistedPage
    locale.value = persistedPage.locale
    persistedGalleryMedia.value = galleryMediaMap(persistedPage.blocks)
    dirty.value = false
    hydrating.value = false
    toast.add({ title: 'Saved', description: 'Page saved.', color: 'success' })
    if (isNew.value) {
      allowFieldExit.value = true
      await navigateTo(`${pagesPath.value}/${response.page.id}`)
    }
    return true
  } catch (error) {
    if (persistedPage) {
      const retryPage = cloneEditorValue(persistedPage)
      for (const change of galleryChanges) {
        const block = retryPage.blocks.find(item => item.id === change.blockId)
        if (block) block.media = cloneEditorValue(change.desired)
      }
      hydrating.value = true
      selected.value = retryPage
      locale.value = retryPage.locale
      dirty.value = true
      hydrating.value = false
    }
    editorError.value = error instanceof Error ? error.message : 'Unable to save page'
    return false
  } finally {
    hydrating.value = false
    busy.value = null
  }
}

watch(focusedField, (field) => {
  editorError.value = null
  if (field === 'title') fieldDraft.value = { kind: 'title', value: selected.value?.title ?? '' }
  else if (field === 'summary') fieldDraft.value = { kind: 'summary', value: selected.value?.summary ?? '' }
  else if (field === 'content' && activeBlock.value) fieldDraft.value = { kind: 'block', block: cloneEditorValue(activeBlock.value) }
  else fieldDraft.value = null
  initialFieldSnapshot.value = JSON.stringify(fieldDraft.value)
  if (!field) allowFieldExit.value = false
}, { immediate: true })

watch([requestedSectionId, requestedFieldId, selected, loading], () => {
  if (loading.value || !selected.value) return
  if (requestedSectionId.value && !selectedSectionId.value) {
    const query: LocationQueryRaw = { ...route.query }
    delete query.section
    delete query.field
    void router.replace({ query })
  } else if (requestedFieldId.value && !focusedField.value) {
    const query: LocationQueryRaw = { ...route.query }
    delete query.field
    void router.replace({ query })
  }
}, { immediate: true })

watch(selected, () => {
  if (hydrating.value) {
    dirty.value = false
    return
  }
  dirty.value = true
  requestGate.invalidate()
}, { deep: true, flush: 'sync' })

watch(locale, async (nextLocale, previousLocale) => {
  if (localeRevertGuard.consume(nextLocale) || loading.value || isNew.value || nextLocale === previousLocale || !selected.value) return
  if (!canDiscardUnsavedChanges('Discard unsaved page changes and switch language?')) {
    localeRevertGuard.arm(previousLocale)
    locale.value = previousLocale
    return
  }
  try {
    const response = await dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(nextLocale)}`, { validate: validateList })
    const translatedPage = response.pages.find(page => page.page_id === selected.value?.page_id)
    if (!translatedPage) throw new Error('This page is unavailable in the selected language.')
    dirty.value = false
    await navigateTo(`${pagesPath.value}/${translatedPage.id}`)
  } catch (error) {
    localeRevertGuard.arm(previousLocale)
    locale.value = previousLocale
    editorError.value = error instanceof Error ? error.message : 'Unable to switch language'
  }
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !fieldDraftDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteUpdate((to) => {
  const leavesField = Boolean(focusedField.value) && singleQueryValue(to.query.field) !== requestedFieldId.value
  if (!leavesField || !fieldDraftDirty.value || allowFieldExit.value) return
  if (!window.confirm('Discard this field change?')) return false
})
onBeforeRouteLeave(() => {
  if (fieldDraftDirty.value && !allowFieldExit.value && !window.confirm('Discard this field change?')) return false
  if (!canDiscardUnsavedChanges()) return false
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadEditor()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>
