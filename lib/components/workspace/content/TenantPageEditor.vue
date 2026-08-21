<template>
  <UDashboardPanel id="tenant-page-editor">
    <template #header>
      <UDashboardNavbar :title="editorTitle">
        <template #leading><DashboardNavbarLeading :detail-to="pagesPath" detail-label="Pages" /></template>
        <template #right>
          <UButton
            v-if="selected?.id"
            color="neutral"
            variant="outline"
            icon="i-lucide-external-link"
            label="Preview"
            :to="navigablePreviewUrl"
            target="_blank"
            :disabled="busy !== null || !navigablePreviewUrl"
          />
          <UButton icon="i-lucide-check" label="Save" :loading="busy === 'save'" :disabled="busy !== null || !selected" @click="save" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <div v-if="loading" class="space-y-4">
          <USkeleton class="h-32 rounded-2xl" />
          <USkeleton class="h-80 rounded-2xl" />
        </div>

        <template v-else-if="selected">
          <UAlert v-if="pageLoadError" color="error" variant="soft" title="Page could not be loaded" :description="pageLoadError" />
          <UAlert v-if="editorError" color="error" variant="soft" title="Page could not be saved" :description="editorError" />
          <UAlert v-if="dirty" color="warning" variant="soft" title="Unsaved changes" description="Save before leaving this page or opening Preview." />

          <UCard>
            <div class="space-y-5">
              <div v-if="!isNew && localeOptions.length > 1" class="flex justify-end">
                <USelect v-model="locale" :items="localeOptions" class="w-28" aria-label="Page language" :disabled="busy !== null" />
              </div>
              <UFormField label="Page title">
                <UInput v-model="selected.title" size="xl" :disabled="busy !== null" />
              </UFormField>
              <UFormField label="Short description" description="A concise introduction used when the page needs a summary.">
                <UTextarea v-model="selected.summary" :rows="3" autoresize :disabled="busy !== null" />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold text-highlighted">Page sections</h2>
                  <p class="text-sm text-muted">Add and arrange the content shown on this page.</p>
                </div>
                <div class="flex items-center gap-2">
                  <USelect v-model="newBlockType" :items="blockTypeOptions" size="sm" aria-label="Section type" :disabled="busy !== null" />
                  <UButton size="sm" icon="i-lucide-plus" label="Add section" :disabled="busy !== null" @click="addBlock" />
                </div>
              </div>
            </template>

            <div class="space-y-3">
              <div
                v-for="(block, index) in selected.blocks"
                :key="block.id"
                class="rounded-xl border p-4 transition-colors"
                :class="selectedBlockIndex === index ? 'border-primary bg-primary/5' : 'border-default bg-default hover:bg-elevated'"
                :data-block-index="index"
                @click="selectedBlockIndex = index"
              >
                <div
                  class="flex cursor-grab flex-wrap items-center justify-between gap-3 active:cursor-grabbing"
                  draggable="true"
                  :aria-label="`Reorder ${blockTypeLabel(block.type)} section`"
                  @dragstart="busy === null && startDragging(index, $event)"
                  @dragover.prevent
                  @drop="busy === null && dropBlock(index)"
                  @dragend="finishDragging"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-muted" />
                    <div class="min-w-0">
                      <p class="truncate font-medium text-highlighted">{{ blockTypeLabel(block.type) }}</p>
                      <p v-if="selectedBlockIndex !== index" class="truncate text-xs text-muted">{{ blockSummary(block) }}</p>
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="busy !== null || index === 0" aria-label="Move section up" @click.stop="moveBlock(index, -1)" />
                    <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="busy !== null || index === selected.blocks.length - 1" aria-label="Move section down" @click.stop="moveBlock(index, 1)" />
                    <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" aria-label="Duplicate section" :disabled="busy !== null" @click.stop="duplicateBlock(index)" />
                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete section" :disabled="busy !== null" @click.stop="removeBlock(index)" />
                  </div>
                </div>
                <div v-if="selectedBlockIndex === index" class="mt-4 border-t border-default pt-4" @click.stop>
                  <fieldset :disabled="busy !== null" class="contents">
                    <TenantPageBlockEditor :block="block" :site-id="resolvedSiteId" :page-recipe="selected.recipe" :page-type="selected.page_type" @update:block="updateBlock(index, $event)" />
                  </fieldset>
                </div>
              </div>
              <div v-if="!selected.blocks.length" class="rounded-xl border border-dashed border-default py-12 text-center">
                <p class="font-medium text-highlighted">This page has no sections yet.</p>
                <p class="mt-1 text-sm text-muted">Choose a section type above to start adding content.</p>
              </div>
            </div>
          </UCard>
        </template>

        <UAlert v-else color="error" variant="soft" title="Page unavailable" :description="pageLoadError || 'This page could not be loaded.'" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { slugifyTitle } from '~/utils/post-slugs'
import { TENANT_PAGE_BLOCK_REGISTRY, createTenantPageBlock, isTenantPageBlockAllowed, type TenantPageBlock, type TenantPageBlockType, type TenantPageType } from '~/utils/tenant-page-blocks'
import { createTenantPageEditorData, tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { canProceedWithTenantPageTransition, createTenantPageLocaleRevertGuard, createTenantPageRequestGate, previewHrefForTenantPage } from '~/utils/tenant-page-editor-safety'

const props = defineProps<{ pageId?: string }>()

interface PageSummary { id: string, page_id: string, title: string, path: string, page_type: TenantPageType, recipe: string | null, locale: string, sort_order: number, updated_at: string }
interface PageDetailResponse extends PageSummary { site_id: string, organization_id: string, summary: string | null, seo_title: string | null, seo_description: string | null, canonical_url: string | null, robots: string | null, blocks: TenantPageBlock[], document: { updated_at: string } }
interface PageDetail extends Omit<PageDetailResponse, 'recipe' | 'summary' | 'seo_title' | 'seo_description' | 'canonical_url' | 'robots'> { recipe: string, summary: string, seo_title: string, seo_description: string, canonical_url: string, robots: string }

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 503, statusMessage: 'Dashboard site context unavailable' })
const resolvedSiteId = siteId

const route = useRoute()
const dashboardApi = useDashboardApi()
const toast = useToast()
const platformOrigin = useRequestURL().origin
const pagesPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/pages`)
const isNew = computed(() => !props.pageId)
const selected = ref<PageDetail | null>(null)
const locale = ref(String(dashboard.site.value?.source_locale || 'en'))
const locales = ref<string[]>([locale.value])
const loading = ref(true)
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

const editorTitle = computed(() => isNew.value ? 'New page' : selected.value?.title || 'Page')
const localeOptions = computed(() => locales.value.map(value => ({ label: value, value })))
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
  if (!options.some(option => option.value === newBlockType.value)) newBlockType.value = options[0]?.value ?? 'markdown'
}, { immediate: true })

function validateList(value: unknown): value is { pages: PageSummary[] } {
  return isRecord(value) && Array.isArray(value.pages) && value.pages.every(page => isRecord(page) && typeof page.id === 'string' && typeof page.page_id === 'string')
}

function validatePage(value: unknown): value is { page: PageDetailResponse } {
  return isRecord(value) && isRecord(value.page) && typeof value.page.id === 'string' && isRecord(value.page.document) && Array.isArray(value.page.blocks)
}

function validateContext(value: unknown): value is { context: { previewToken: string } } {
  return isRecord(value) && isRecord(value.context) && typeof value.context.previewToken === 'string'
}

function validateLocales(value: unknown): value is { source_locale: string, locales: Array<{ locale: string, status: string }> } {
  return isRecord(value) && typeof value.source_locale === 'string' && Array.isArray(value.locales)
}

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

async function loadEditor() {
  const requestToken = requestGate.begin()
  hydrating.value = true
  loading.value = true
  pageLoadError.value = null
  try {
    const [contextResponse, localeResponse, pageResponse, pagesResponse] = await Promise.all([
      dashboardApi<{ context: { previewToken: string } }>(`/api/editor/sites/${siteId}/context`, { validate: validateContext }),
      dashboardApi<{ source_locale: string, locales: Array<{ locale: string, status: string }> }>(`/api/editor/sites/${siteId}/locales`, { validate: validateLocales }),
      props.pageId ? dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${props.pageId}`, { validate: validatePage }) : Promise.resolve(null),
      props.pageId ? Promise.resolve(null) : dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(locale.value)}`, { validate: validateList }),
    ])
    if (!requestGate.isCurrent(requestToken)) return
    previewToken.value = contextResponse.context.previewToken
    locales.value = localeResponse.locales.filter(item => item.status !== 'disabled').map(item => item.locale)
    if (pageResponse) {
      selected.value = toEditorPage(pageResponse.page)
      locale.value = pageResponse.page.locale
    } else {
      locale.value = localeResponse.source_locale
      selected.value = {
        id: '', page_id: '', site_id: resolvedSiteId, organization_id: '', locale: locale.value, path: '', title: '', page_type: 'custom', recipe: '', sort_order: pagesResponse?.pages.length ?? 0, updated_at: '',
        summary: '', seo_title: '', seo_description: '', canonical_url: '', robots: '', blocks: [], document: { updated_at: '' },
      }
    }
    selectedBlockIndex.value = selected.value.blocks.length ? 0 : -1
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
  if (sourceIndex == null || sourceIndex === targetIndex || !selected.value) return
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
  busy.value = 'save'
  editorError.value = null
  try {
    const title = selected.value.title.trim()
    if (!title) throw new Error('Add a page title before saving.')
    const invalidIndex = blockErrors.value.findIndex(errors => errors.length > 0)
    if (invalidIndex >= 0) {
      selectedBlockIndex.value = invalidIndex
      throw new Error(`Resolve the highlighted fields in section ${invalidIndex + 1} before saving.`)
    }
    selected.value.blocks.forEach((block, index) => { block.position = index })
    const path = selected.value.id ? selected.value.path : `/${slugifyTitle(title)}`
    if (path === '/') throw new Error('Choose a more specific page title.')
    const body = {
      id: selected.value.id || undefined,
      pageId: selected.value.page_id || undefined,
      locale: selected.value.locale,
      path,
      title,
      summary: selected.value.summary,
      seoTitle: selected.value.seo_title || null,
      seoDescription: selected.value.seo_description || null,
      canonicalUrl: selected.value.canonical_url || null,
      robots: selected.value.robots || null,
      pageType: selected.value.page_type,
      recipe: selected.value.recipe || null,
      sortOrder: selected.value.sort_order,
      blocks: selected.value.blocks,
      expectedDocumentUpdatedAt: selected.value.id ? selected.value.document.updated_at : undefined,
    }
    const response = selected.value.id
      ? await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${selected.value.id}`, { method: 'PATCH', body, validate: validatePage })
      : await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: validatePage })
    hydrating.value = true
    selected.value = toEditorPage(response.page)
    dirty.value = false
    hydrating.value = false
    toast.add({ title: 'Saved', description: 'Page saved.', color: 'success' })
    if (isNew.value) await navigateTo(`${pagesPath.value}/${response.page.id}`)
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : 'Unable to save page'
  } finally {
    busy.value = null
  }
}

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
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!canDiscardUnsavedChanges()) return false
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadEditor()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>
