<template>
  <UDashboardPanel id="tenant-pages-manager">
    <template #header>
      <UDashboardNavbar title="Pages">
        <template #leading><DashboardNavbarLeading /></template>
        <template #right>
          <UButton icon="i-lucide-plus" label="New page" :disabled="busy !== null || loading" @click="startNewPage" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid min-h-[calc(100vh-9rem)] gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-lg font-semibold text-highlighted">Site pages</h1>
              <p class="text-sm text-muted">One page system for every template.</p>
            </div>
            <USelect v-model="locale" :items="localeOptions" size="sm" class="w-24" aria-label="Page locale" :disabled="busy !== null || loading" />
          </div>
          <UAlert v-if="loadError" color="error" variant="soft" title="Pages unavailable" :description="loadError" />
          <div v-else-if="loading" class="space-y-2"><USkeleton v-for="index in 5" :key="index" class="h-16 rounded-xl" /></div>
          <div v-else class="space-y-2">
            <button
              v-for="page in pages"
              :key="page.id"
              type="button"
              class="w-full rounded-xl border p-3 text-left transition"
              :class="selected?.id === page.id ? 'border-primary bg-primary/5' : 'border-default bg-default hover:bg-elevated'"
              :disabled="busy !== null"
              @click="selectPage(page.id)"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="truncate font-medium text-highlighted">{{ page.title }}</span>
              </span>
              <span class="mt-1 block truncate text-xs text-muted">{{ page.path }}</span>
            </button>
            <UAlert v-if="!pages.length" color="neutral" variant="soft" title="No pages" description="Create the first page for this site." />
          </div>
        </aside>

        <section v-if="selected" class="min-w-0 space-y-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm text-muted">{{ selected.id ? selected.path : 'New page' }}</p>
              <h2 class="text-2xl font-semibold text-highlighted">{{ selected.title }}</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="selected.id" color="neutral" variant="outline" :disabled="busy !== null" @click="duplicate">Duplicate</UButton>
              <UButton v-if="selected.id" color="neutral" variant="outline" :to="navigablePreviewUrl" target="_blank" :disabled="busy !== null || !navigablePreviewUrl">Preview</UButton>
              <UButton color="primary" :loading="busy === 'save'" :disabled="busy !== null" @click="save">Save</UButton>
            </div>
          </div>

          <UAlert v-if="dirty" color="warning" variant="soft" title="Unsaved changes" description="Save before leaving the page, switching locales, or opening Preview." />

          <UAlert v-if="pageLoadError" color="error" variant="soft" title="Page could not be loaded" :description="pageLoadError" />
          <UAlert v-if="editorError" color="error" variant="soft" title="Page could not be saved" :description="editorError" />

          <UCard>
            <template #header><h3 class="font-semibold text-highlighted">Page settings</h3></template>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Title"><UInput v-model="selected.title" :disabled="busy !== null" /></UFormField>
              <UFormField label="Path"><UInput v-model="selected.path" placeholder="/your-page" :disabled="busy !== null" /></UFormField>
              <UFormField label="Page type">
                <UInput v-if="selected.page_type === 'system'" model-value="system (site-managed)" readonly />
                <USelect v-else v-model="selected.page_type" :items="pageTypeOptions" :disabled="busy !== null" />
              </UFormField>
              <UFormField label="Recipe"><UInput v-model="selected.recipe" placeholder="custom" :disabled="busy !== null" /></UFormField>
              <UFormField class="md:col-span-2" label="Summary"><UTextarea v-model="selected.summary" :rows="3" autoresize :disabled="busy !== null" /></UFormField>
              <UFormField label="SEO title"><UInput v-model="selected.seo_title" :disabled="busy !== null" /></UFormField>
              <UFormField label="Canonical URL"><UInput v-model="selected.canonical_url" :disabled="busy !== null" /></UFormField>
              <UFormField class="md:col-span-2" label="SEO description"><UTextarea v-model="selected.seo_description" :rows="3" autoresize :disabled="busy !== null" /></UFormField>
              <UFormField label="Robots"><UInput v-model="selected.robots" placeholder="index,follow" :disabled="busy !== null" /></UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div><h3 class="font-semibold text-highlighted">Blocks</h3><p class="text-sm text-muted">Typed sections shared by Saya and Blawby.</p></div>
                <div class="flex items-center gap-2">
                  <USelect v-model="newBlockType" :items="blockTypeOptions" size="sm" aria-label="New block type" :disabled="busy !== null" />
                  <UButton size="sm" icon="i-lucide-plus" label="Add block" :disabled="busy !== null" @click="addBlock" />
                </div>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="(block, index) in selected.blocks"
                :key="block.id"
                class="rounded-xl border p-4 transition-colors"
                :class="selectedBlockIndex === index ? 'border-primary bg-primary/5' : 'border-default bg-default'"
                :data-block-index="index"
                @click="selectedBlockIndex = index"
              >
                <div
                  class="flex cursor-grab flex-wrap items-center justify-between gap-3 active:cursor-grabbing"
                  draggable="true"
                  :aria-label="`Reorder ${block.type} block`"
                  @dragstart="busy === null && startDragging(index, $event)"
                  @dragover.prevent
                  @drop="busy === null && dropBlock(index)"
                  @dragend="finishDragging"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-muted" />
                    <UBadge color="neutral" variant="subtle">{{ index + 1 }}</UBadge>
                    <div class="min-w-0">
                      <p class="truncate font-medium text-highlighted">{{ blockTypeLabel(block.type) }}</p>
                      <p v-if="selectedBlockIndex !== index" class="truncate text-xs text-muted">{{ blockSummary(block) }}</p>
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <UButton color="primary" variant="soft" size="xs" aria-label="Edit block" :disabled="busy !== null" @click.stop="selectedBlockIndex = index">Edit</UButton>
                    <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="busy !== null || index === 0" aria-label="Move block up" @click.stop="moveBlock(index, -1)" />
                    <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="busy !== null || index === selected.blocks.length - 1" aria-label="Move block down" @click.stop="moveBlock(index, 1)" />
                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete block" :disabled="busy !== null" @click.stop="removeBlock(index)" />
                    <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" aria-label="Duplicate block" :disabled="busy !== null" @click.stop="duplicateBlock(index)" />
                  </div>
                </div>
                <div v-if="selectedBlockIndex === index" class="mt-4 border-t border-default pt-4" @click.stop>
                  <fieldset :disabled="busy !== null" class="contents">
                    <TenantPageBlockEditor :block="block" :site-id="resolvedSiteId" :page-recipe="selected.recipe" :page-type="selected.page_type" @update:block="updateBlock(index, $event)" />
                  </fieldset>
                </div>
              </div>
              <UAlert v-if="!selected.blocks.length" color="neutral" variant="soft" title="No blocks" description="Add a block to start composing this page." />
            </div>
          </UCard>
        </section>

        <UCard v-else class="xl:col-start-2">
          <div class="py-24 text-center"><UIcon name="i-lucide-file-plus-2" class="mx-auto size-10 text-muted" /><h2 class="mt-4 text-lg font-semibold">Choose a page</h2><p class="mt-2 text-sm text-muted">Create or select a page to edit its blocks.</p></div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { TENANT_PAGE_BLOCK_REGISTRY, createTenantPageBlock, isTenantPageBlockAllowed, type TenantPageBlock, type TenantPageBlockType, type TenantPageType } from '~/utils/tenant-page-blocks'
import { createTenantPageEditorData, tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { canProceedWithTenantPageTransition, createTenantPageLocaleRevertGuard, createTenantPageRequestGate, previewHrefForTenantPage } from '~/utils/tenant-page-editor-safety'

interface PageSummary { id: string; title: string; path: string; page_type: TenantPageType; recipe: string | null; locale: string; sort_order: number; updated_at: string }
interface PageDetailResponse extends PageSummary { page_id: string; site_id: string; organization_id: string; summary: string | null; seo_title: string | null; seo_description: string | null; canonical_url: string | null; robots: string | null; blocks: TenantPageBlock[]; document: { updated_at: string } }
interface PageDetail extends Omit<PageDetailResponse, 'recipe' | 'summary' | 'seo_title' | 'seo_description' | 'canonical_url' | 'robots'> { recipe: string; summary: string; seo_title: string; seo_description: string; canonical_url: string; robots: string }

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value as string | null
if (!siteId) throw createError({ statusCode: 503, statusMessage: 'Dashboard site context unavailable' })
const resolvedSiteId = siteId
const dashboardApi = useDashboardApi()
const toast = useToast()
const platformOrigin = useRequestURL().origin
const pages = ref<PageSummary[]>([])
const selected = ref<PageDetail | null>(null)
const locale = ref(String(dashboard.site.value?.source_locale || 'en'))
const locales = ref<string[]>([locale.value])
const loading = ref(true)
const loadError = ref<string | null>(null)
const pageLoadError = ref<string | null>(null)
const editorError = ref<string | null>(null)
const busy = ref<string | null>(null)
const previewToken = ref('')
const dirty = ref(false)
const hydrating = ref(false)
const requestGate = createTenantPageRequestGate()
const localeRevertGuard = createTenantPageLocaleRevertGuard()
const selectedBlockIndex = ref(0)
const draggedBlockIndex = ref<number | null>(null)
const newBlockType = ref<TenantPageBlockType>('markdown')

const localeOptions = computed(() => locales.value.map(value => ({ label: value, value })))
const pageTypeOptions = ['custom', 'recipe', 'legal'].map(value => ({ label: value, value }))
const blockTypeOptions = computed(() => Object.values(TENANT_PAGE_BLOCK_REGISTRY)
  .filter(definition => !selected.value || isTenantPageBlockAllowed(definition, selected.value.recipe, selected.value.page_type))
  .map(definition => ({ label: definition.label, value: definition.type })))
const blockErrors = computed(() => selected.value?.blocks.map(block => validateTenantPageBlock(block)) ?? [])
const previewUrl = computed(() => {
  if (!selected.value?.id || !previewToken.value) return ''
  const path = selected.value.path === '/' ? '' : selected.value.path
  return `${platformOrigin}/preview/site/${siteId}${path}?preview=true&locale=${encodeURIComponent(selected.value.locale)}&token=${encodeURIComponent(previewToken.value)}`
})
const navigablePreviewUrl = computed(() => previewHrefForTenantPage(dirty.value, previewUrl.value))

watch(blockTypeOptions, (options) => {
  if (!options.some(option => option.value === newBlockType.value)) {
    newBlockType.value = options[0]?.value ?? 'markdown'
  }
}, { immediate: true })

function validateList(value: unknown): value is { pages: PageSummary[] } {
  return isRecord(value)
    && Array.isArray(value.pages)
    && value.pages.every(page => isRecord(page) && typeof page.id === 'string' && typeof page.path === 'string')
}
function validatePage(value: unknown): value is { page: PageDetailResponse } {
  return isRecord(value)
    && isRecord(value.page)
    && typeof value.page.id === 'string'
    && isRecord(value.page.document)
    && Array.isArray(value.page.blocks)
}
function validateContext(value: unknown): value is { context: { previewToken: string } } {
  return isRecord(value) && isRecord(value.context) && typeof value.context.previewToken === 'string'
}
function validateLocales(value: unknown): value is { source_locale: string; locales: Array<{ locale: string; status: string }> } {
  return isRecord(value) && typeof value.source_locale === 'string' && Array.isArray(value.locales)
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
function toEditorPage(page: PageDetailResponse): PageDetail {
  return {
    ...page,
    recipe: page.recipe ?? '',
    summary: page.summary ?? '',
    seo_title: page.seo_title ?? '',
    seo_description: page.seo_description ?? '',
    canonical_url: page.canonical_url ?? '',
    robots: page.robots ?? '',
  }
}

function canDiscardUnsavedChanges(message = 'Discard unsaved page changes?') {
  return canProceedWithTenantPageTransition(dirty.value, () => window.confirm(message))
}

function preservePersistedIdentity(response: PageDetailResponse) {
  if (!selected.value) return
  selected.value.id = response.id
  selected.value.page_id = response.page_id
  selected.value.document = response.document
}

async function loadPages() {
  const requestToken = requestGate.begin()
  hydrating.value = true
  loading.value = true
  loadError.value = null
  pageLoadError.value = null
  try {
    const [response, context, localeResponse] = await Promise.all([
      dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(locale.value)}`, { validate: validateList }),
      dashboardApi<{ context: { previewToken: string } }>(`/api/editor/sites/${siteId}/context`, { validate: validateContext }),
      dashboardApi<{ source_locale: string; locales: Array<{ locale: string; status: string }> }>(`/api/editor/sites/${siteId}/locales`, { validate: validateLocales }),
    ])
    if (!requestGate.isCurrent(requestToken)) return
    pages.value = response.pages
    previewToken.value = context.context.previewToken
    locales.value = localeResponse.locales.filter(item => item.status !== 'disabled').map(item => item.locale)
    if (!locales.value.includes(locale.value)) locale.value = localeResponse.source_locale
    if (pages.value.length && !selected.value) await selectPage(pages.value[0]!.id)
  } catch (error) {
    if (requestGate.isCurrent(requestToken)) loadError.value = error instanceof Error ? error.message : 'Unable to load pages'
  } finally {
    if (requestGate.isCurrent(requestToken)) {
      loading.value = false
      hydrating.value = false
      dirty.value = false
    }
  }
}

async function selectPage(id: string) {
  if (!canDiscardUnsavedChanges()) return
  const requestToken = requestGate.begin()
  hydrating.value = true
  loading.value = true
  busy.value = 'load'
  pageLoadError.value = null
  editorError.value = null
  try {
    const response = await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${id}`, { validate: validatePage })
    if (!requestGate.isCurrent(requestToken)) return
    selected.value = toEditorPage(response.page)
    selectedBlockIndex.value = selected.value.blocks.length ? 0 : -1
    dirty.value = false
  } catch (error) {
    if (requestGate.isCurrent(requestToken)) pageLoadError.value = error instanceof Error ? error.message : 'Unable to load page'
  } finally {
    if (requestGate.isCurrent(requestToken)) {
      hydrating.value = false
      if (loading.value) loading.value = false
      if (busy.value === 'load') busy.value = null
    }
  }
}

function startNewPage() {
  if (!canDiscardUnsavedChanges()) return
  requestGate.invalidate()
  pageLoadError.value = null
  editorError.value = null
  selected.value = {
    id: '', page_id: '', site_id: resolvedSiteId, organization_id: '', locale: locale.value, path: '/new-page', title: 'New page', page_type: 'custom', recipe: '', sort_order: pages.value.length, updated_at: '',
    summary: '', seo_title: '', seo_description: '', canonical_url: '', robots: '', blocks: [], document: { updated_at: '' },
  }
  selectedBlockIndex.value = -1
  dirty.value = true
}

function addBlock() {
  if (!selected.value) return
  const definition = TENANT_PAGE_BLOCK_REGISTRY[newBlockType.value]
  if (!definition || !isTenantPageBlockAllowed(definition, selected.value.recipe, selected.value.page_type)) return
  const position = selected.value.blocks.length
  selected.value.blocks.push(createTenantPageBlock(newBlockType.value, createTenantPageEditorData(newBlockType.value), position))
  selectedBlockIndex.value = position
}

function moveBlock(index: number, delta: number) {
  if (!selected.value) return
  const next = index + delta
  if (next < 0 || next >= selected.value.blocks.length) return
  const block = selected.value.blocks.splice(index, 1)[0]!
  selected.value.blocks.splice(next, 0, block)
  selected.value.blocks.forEach((item, position) => { item.position = position })
  if (selectedBlockIndex.value === index) selectedBlockIndex.value = next
  else if (selectedBlockIndex.value === next) selectedBlockIndex.value = index
}

function duplicateBlock(index: number) {
  if (!selected.value) return
  const original = selected.value.blocks[index]
  if (!original) return
  const copy: TenantPageBlock = { ...original, id: crypto.randomUUID(), data: structuredClone(toRaw(original.data)), position: index + 1 }
  selected.value.blocks.splice(index + 1, 0, copy)
  selected.value.blocks.forEach((block, position) => { block.position = position })
  selectedBlockIndex.value = index + 1
}

function updateBlock(index: number, block: TenantPageBlock) {
  if (!selected.value || !selected.value.blocks[index]) return
  selected.value.blocks[index] = { ...block, position: index }
}

function removeBlock(index: number) {
  if (!selected.value) return
  selected.value.blocks.splice(index, 1)
  selected.value.blocks.forEach((block, position) => { block.position = position })
  if (!selected.value.blocks.length) selectedBlockIndex.value = -1
  else selectedBlockIndex.value = Math.min(index, selected.value.blocks.length - 1)
}

function startDragging(index: number, event: DragEvent) {
  draggedBlockIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function dropBlock(targetIndex: number) {
  const sourceIndex = draggedBlockIndex.value
  draggedBlockIndex.value = null
  if (sourceIndex == null || sourceIndex === targetIndex) return
  if (!selected.value) return
  const block = selected.value.blocks.splice(sourceIndex, 1)[0]
  if (!block) return
  selected.value.blocks.splice(targetIndex, 0, block)
  selected.value.blocks.forEach((item, position) => { item.position = position })
  selectedBlockIndex.value = targetIndex
}

function finishDragging() {
  draggedBlockIndex.value = null
}

function blockTypeLabel(type: string) {
  return TENANT_PAGE_BLOCK_REGISTRY[type as TenantPageBlockType]?.label ?? type
}

function blockSummary(block: TenantPageBlock) {
  return tenantPageBlockSummary(block)
}

async function save() {
  if (!selected.value) return
  busy.value = 'save'; editorError.value = null
  try {
    const invalidIndex = blockErrors.value.findIndex(errors => errors.length > 0)
    if (invalidIndex >= 0) {
      selectedBlockIndex.value = invalidIndex
      throw new Error(`Resolve the highlighted fields in block ${invalidIndex + 1} before saving.`)
    }
    selected.value.blocks.forEach((block, index) => { block.position = index })
    const body = { id: selected.value.id || undefined, pageId: selected.value.page_id || undefined, locale: selected.value.locale, path: selected.value.path, title: selected.value.title, summary: selected.value.summary, seoTitle: selected.value.seo_title, seoDescription: selected.value.seo_description, canonicalUrl: selected.value.canonical_url, robots: selected.value.robots, pageType: selected.value.page_type, recipe: selected.value.recipe, sortOrder: selected.value.sort_order, blocks: selected.value.blocks, expectedDocumentUpdatedAt: selected.value.id ? selected.value.document.updated_at : undefined }
    const editorAtRequest = selected.value
    const requestToken = requestGate.begin()
    const response = selected.value.id
      ? await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${selected.value.id}`, { method: 'PATCH', body, validate: validatePage })
      : await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: validatePage })
    if (!requestGate.isCurrent(requestToken)) {
      if (selected.value === editorAtRequest) preservePersistedIdentity(response.page)
      return
    }
    selected.value = toEditorPage(response.page)
    selectedBlockIndex.value = selected.value.blocks.length ? Math.min(selectedBlockIndex.value, selected.value.blocks.length - 1) : -1
    await loadPages()
    dirty.value = false
    toast.add({ title: 'Saved', description: 'Page saved.', color: 'success' })
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : 'Unable to save page'
  } finally { busy.value = null }
}

async function duplicate() {
  if (!selected.value || !canDiscardUnsavedChanges()) return
  const original = selected.value
  selected.value = { ...original, id: '', page_id: '', path: `${original.path}-copy`, title: `${original.title} copy`, document: { updated_at: '' }, blocks: original.blocks.map((block, index) => ({ ...block, id: crypto.randomUUID(), data: structuredClone(toRaw(block.data)), position: index })) }
  selectedBlockIndex.value = selected.value.blocks.length ? 0 : -1
  dirty.value = true
  await save()
}

watch(selected, () => {
  if (!hydrating.value) {
    dirty.value = true
    requestGate.invalidate()
  }
}, { deep: true, flush: 'sync' })

watch(locale, async (nextLocale, previousLocale) => {
  if (localeRevertGuard.consume(nextLocale)) return
  if (loading.value || nextLocale === previousLocale) return
  if (!canDiscardUnsavedChanges('Discard unsaved page changes and switch locale?')) {
    localeRevertGuard.arm(previousLocale)
    locale.value = previousLocale
    return
  }
  requestGate.invalidate()
  selected.value = null
  await loadPages()
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!canDiscardUnsavedChanges()) return false
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadPages()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>
