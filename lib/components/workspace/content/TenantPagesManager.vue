<template>
  <UDashboardPanel id="tenant-pages-manager">
    <template #header>
      <UDashboardNavbar title="Pages">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #right>
          <UButton icon="i-lucide-plus" label="New page" @click="startNewPage" />
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
            <USelect v-model="locale" :items="localeOptions" size="sm" class="w-24" aria-label="Page locale" />
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
              @click="selectPage(page.id)"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="truncate font-medium text-highlighted">{{ page.title }}</span>
                <UBadge :color="page.status === 'published' ? 'success' : page.status === 'archived' ? 'neutral' : 'warning'" variant="subtle" size="xs">{{ page.status }}</UBadge>
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
              <h2 class="text-2xl font-semibold text-highlighted">{{ selected.title || 'Untitled page' }}</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="selected.id && selected.status !== 'published'" color="success" variant="soft" :loading="busy === 'publish'" @click="publish">Publish</UButton>
              <UButton v-if="selected.id && selected.status === 'published'" color="warning" variant="soft" :loading="busy === 'unpublish'" @click="unpublish">Unpublish</UButton>
              <UButton v-if="selected.id && selected.status !== 'archived'" color="neutral" variant="soft" :loading="busy === 'archive'" @click="archive">Archive</UButton>
              <UButton v-if="selected.id && selected.status === 'archived'" color="success" variant="soft" :loading="busy === 'restore'" @click="restore">Restore</UButton>
              <UButton v-if="selected.id" color="error" variant="ghost" :loading="busy === 'delete'" @click="removePage">Delete</UButton>
              <UButton v-if="selected.id" color="neutral" variant="outline" @click="duplicate">Duplicate</UButton>
              <UButton v-if="selected.id" color="neutral" variant="outline" :href="previewUrl" target="_blank">Preview</UButton>
              <UButton color="primary" :loading="busy === 'save'" @click="save">Save</UButton>
            </div>
          </div>

          <UAlert v-if="dirty" color="warning" variant="soft" title="Unsaved changes" description="Save this draft before leaving the page or switching locales." />

          <UAlert v-if="editorError" color="error" variant="soft" title="Page could not be saved" :description="editorError" />

          <UCard>
            <template #header><h3 class="font-semibold text-highlighted">Page settings</h3></template>
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Title"><UInput v-model="selected.title" /></UFormField>
              <UFormField label="Path"><UInput v-model="selected.path" placeholder="/your-page" /></UFormField>
              <UFormField label="Page type">
                <UInput v-if="selected.page_type === 'system'" model-value="system (site-managed)" readonly />
                <USelect v-else v-model="selected.page_type" :items="pageTypeOptions" />
              </UFormField>
              <UFormField label="Recipe"><UInput v-model="selected.recipe" placeholder="custom" /></UFormField>
              <UFormField class="md:col-span-2" label="Summary"><UTextarea v-model="selected.summary" :rows="3" autoresize /></UFormField>
              <UFormField label="SEO title"><UInput v-model="selected.seo_title" /></UFormField>
              <UFormField label="Canonical URL"><UInput v-model="selected.canonical_url" /></UFormField>
              <UFormField class="md:col-span-2" label="SEO description"><UTextarea v-model="selected.seo_description" :rows="3" autoresize /></UFormField>
              <UFormField label="Robots"><UInput v-model="selected.robots" placeholder="index,follow" /></UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div><h3 class="font-semibold text-highlighted">Blocks</h3><p class="text-sm text-muted">Typed sections shared by Saya and Blawby.</p></div>
                <UButton size="sm" icon="i-lucide-plus" label="Add block" @click="addBlock" />
              </div>
            </template>
            <div class="space-y-3">
              <div v-for="(block, index) in selected.blocks" :key="block.id" class="rounded-xl border border-default p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UBadge color="neutral" variant="subtle">{{ index + 1 }}</UBadge>
                    <USelect v-model="block.type" :items="blockTypeOptions" size="sm" />
                  </div>
                  <div class="flex gap-1">
                    <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" aria-label="Move block up" @click="moveBlock(index, -1)" />
                    <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="index === selected.blocks.length - 1" aria-label="Move block down" @click="moveBlock(index, 1)" />
                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete block" @click="selected.blocks.splice(index, 1)" />
                    <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" aria-label="Duplicate block" @click="duplicateBlock(index)" />
                  </div>
                </div>
                <UTextarea v-model="blockJson[index]" class="mt-3 font-mono text-xs" :rows="6" autoresize aria-label="Block data JSON" />
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

interface PageSummary { id: string; title: string; path: string; page_type: string; recipe: string | null; status: string; locale: string; sort_order: number; updated_at: string; published_revision_id: string | null }
interface PageBlock { id: string; type: string; position: number; data: Record<string, unknown> }
interface PageDetailResponse extends PageSummary { page_id: string; site_id: string; organization_id: string; summary: string | null; seo_title: string | null; seo_description: string | null; canonical_url: string | null; robots: string | null; blocks: PageBlock[]; document: { updated_at: string; draft_revision_id: string | null; published_revision_id: string | null } }
interface PageDetail extends Omit<PageDetailResponse, 'recipe' | 'summary' | 'seo_title' | 'seo_description' | 'canonical_url' | 'robots'> { recipe: string; summary: string; seo_title: string; seo_description: string; canonical_url: string; robots: string }

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value as string | null
if (!siteId) throw createError({ statusCode: 503, statusMessage: 'Dashboard site context unavailable' })
const resolvedSiteId = siteId
const dashboardApi = useDashboardApi()
const toast = useToast()
const config = useRuntimeConfig()
const pages = ref<PageSummary[]>([])
const selected = ref<PageDetail | null>(null)
const locale = ref(String(dashboard.site.value?.source_locale || 'en'))
const locales = ref<string[]>([locale.value])
const loading = ref(true)
const loadError = ref<string | null>(null)
const editorError = ref<string | null>(null)
const busy = ref<string | null>(null)
const blockJson = ref<string[]>([])
const previewToken = ref('')
const dirty = ref(false)
const hydrating = ref(false)

const localeOptions = computed(() => locales.value.map(value => ({ label: value, value })))
const pageTypeOptions = ['custom', 'recipe', 'legal'].map(value => ({ label: value, value }))
const blockTypeOptions = ['heading', 'markdown', 'image', 'gallery', 'faq', 'divider', 'cta', 'callout', 'hero', 'button_group', 'feature_grid', 'testimonial_grid', 'contact_cta', 'booking_cta', 'donation_choices', 'offering_grid', 'location_grid'].map(value => ({ label: value, value }))
const previewUrl = computed(() => {
  if (!selected.value?.id || !previewToken.value) return ''
  const base = String(config.public.platformDomain || config.public.freeSiteDomain).replace(/\/$/, '')
  const path = selected.value.path === '/' ? '' : selected.value.path
  return `${base}/preview/site/${siteId}${path}?preview=true&locale=${encodeURIComponent(selected.value.locale)}&token=${encodeURIComponent(previewToken.value)}`
})

function validateList(value: unknown): value is { pages: PageSummary[] } {
  return isRecord(value) && Array.isArray(value.pages)
}
function validatePage(value: unknown): value is { page: PageDetailResponse } {
  return isRecord(value) && isRecord(value.page) && typeof value.page.id === 'string' && Array.isArray(value.page.blocks)
}
function validateContext(value: unknown): value is { context: { previewToken: string } } {
  return isRecord(value) && isRecord(value.context) && typeof value.context.previewToken === 'string'
}
function validateLocales(value: unknown): value is { source_locale: string; locales: Array<{ locale: string; status: string }> } {
  return isRecord(value) && typeof value.source_locale === 'string' && Array.isArray(value.locales)
}
function validateDelete(value: unknown): value is { deleted: true } {
  return isRecord(value) && value.deleted === true
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

async function loadPages() {
  hydrating.value = true
  loading.value = true
  loadError.value = null
  try {
    const [response, context, localeResponse] = await Promise.all([
      dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages?locale=${encodeURIComponent(locale.value)}`, { validate: validateList }),
      dashboardApi<{ context: { previewToken: string } }>(`/api/editor/sites/${siteId}/context`, { validate: validateContext }),
      dashboardApi<{ source_locale: string; locales: Array<{ locale: string; status: string }> }>(`/api/editor/sites/${siteId}/locales`, { validate: validateLocales }),
    ])
    pages.value = response.pages
    previewToken.value = context.context.previewToken
    locales.value = localeResponse.locales.filter(item => item.status !== 'disabled').map(item => item.locale)
    if (!locales.value.includes(locale.value)) locale.value = localeResponse.source_locale
    if (pages.value.length && !selected.value) await selectPage(pages.value[0]!.id)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load pages'
  } finally {
    loading.value = false
    hydrating.value = false
    dirty.value = false
  }
}

async function selectPage(id: string) {
  if (dirty.value && !window.confirm('Discard unsaved page changes?')) return
  hydrating.value = true
  editorError.value = null
  try {
    const response = await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${id}`, { validate: validatePage })
    selected.value = toEditorPage(response.page)
    blockJson.value = selected.value.blocks.map(block => JSON.stringify(block.data, null, 2))
    dirty.value = false
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : 'Unable to load page'
  } finally {
    hydrating.value = false
  }
}

function startNewPage() {
  editorError.value = null
  selected.value = {
    id: '', page_id: '', site_id: resolvedSiteId, organization_id: '', locale: locale.value, path: '/new-page', title: 'New page', page_type: 'custom', recipe: '', status: 'draft', sort_order: pages.value.length, updated_at: '', published_revision_id: null,
    summary: '', seo_title: '', seo_description: '', canonical_url: '', robots: '', blocks: [], document: { updated_at: '', draft_revision_id: null, published_revision_id: null },
  }
  blockJson.value = []
  dirty.value = true
}

function addBlock() {
  if (!selected.value) return
  selected.value.blocks.push({ id: crypto.randomUUID(), type: 'markdown', position: selected.value.blocks.length, data: { markdown: '' } })
  blockJson.value.push(JSON.stringify({ markdown: '' }, null, 2))
}

function moveBlock(index: number, delta: number) {
  if (!selected.value) return
  const next = index + delta
  if (next < 0 || next >= selected.value.blocks.length) return
  const block = selected.value.blocks.splice(index, 1)[0]!
  selected.value.blocks.splice(next, 0, block)
  const json = blockJson.value.splice(index, 1)[0]!
  blockJson.value.splice(next, 0, json)
}

function duplicateBlock(index: number) {
  if (!selected.value) return
  const original = selected.value.blocks[index]
  if (!original) return
  const copy = { ...original, id: crypto.randomUUID(), data: { ...original.data }, position: index + 1 }
  selected.value.blocks.splice(index + 1, 0, copy)
  blockJson.value.splice(index + 1, 0, JSON.stringify(copy.data, null, 2))
  selected.value.blocks.forEach((block, position) => { block.position = position })
}

function syncBlockData() {
  if (!selected.value) return
  selected.value.blocks.forEach((block, index) => {
    const raw = blockJson.value[index]
    if (typeof raw !== 'string') throw new Error(`Block ${index + 1} data is missing`)
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) throw new Error(`Block ${index + 1} data must be a JSON object`)
    block.data = parsed
    block.position = index
  })
}

async function save() {
  if (!selected.value) return
  busy.value = 'save'; editorError.value = null
  try {
    syncBlockData()
    const body = { id: selected.value.id || undefined, pageId: selected.value.page_id || undefined, locale: selected.value.locale, path: selected.value.path, title: selected.value.title, summary: selected.value.summary, seoTitle: selected.value.seo_title, seoDescription: selected.value.seo_description, canonicalUrl: selected.value.canonical_url, robots: selected.value.robots, pageType: selected.value.page_type, recipe: selected.value.recipe, sortOrder: selected.value.sort_order, blocks: selected.value.blocks, expectedDocumentUpdatedAt: selected.value.id ? selected.value.document.updated_at : undefined }
    const response = selected.value.id
      ? await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${selected.value.id}`, { method: 'PATCH', body, validate: validatePage })
      : await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages`, { method: 'POST', body, validate: validatePage })
    selected.value = toEditorPage(response.page)
    blockJson.value = selected.value.blocks.map(block => JSON.stringify(block.data, null, 2))
    await loadPages()
    dirty.value = false
    toast.add({ title: 'Saved', description: 'Page draft saved.', color: 'success' })
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : 'Unable to save page'
  } finally { busy.value = null }
}

async function action(name: string, path: string, confirmMessage?: string, extraBody: Record<string, unknown> = {}) {
  if (!selected.value?.id) return
  if (confirmMessage && !window.confirm(confirmMessage)) return
  busy.value = name; editorError.value = null
  try {
    const response = await dashboardApi<{ page: PageDetailResponse }>(`/api/editor/sites/${siteId}/pages/${selected.value.id}/${path}`, { method: 'POST', body: { expectedDocumentUpdatedAt: selected.value.document.updated_at, ...extraBody }, validate: validatePage })
    selected.value = toEditorPage(response.page)
    blockJson.value = selected.value.blocks.map(block => JSON.stringify(block.data, null, 2))
    await loadPages()
    dirty.value = false
  } catch (error) { editorError.value = error instanceof Error ? error.message : `Unable to ${name} page` } finally { busy.value = null }
}
const publish = () => action('publish', 'publish')
const unpublish = () => action('unpublish', 'unpublish')
async function archive() {
  if (!selected.value) return
  const archiveOptions: Record<string, unknown> = {}
  if (selected.value.page_type === 'legal') {
    const decision = window.prompt('Enter a published replacement path, or type 410 to make this page return Gone. Leave blank to archive without a redirect.')
    if (decision === null) return
    if (decision.trim() === '410') archiveOptions.gone = true
    else if (decision.trim()) archiveOptions.replacementPath = decision.trim()
  }
  await action('archive', 'archive', 'Archive this page? It will stop rendering publicly.', archiveOptions)
}
const restore = () => action('restore', 'restore')

async function removePage() {
  if (!selected.value?.id || !window.confirm('Delete this page and its revisions? This cannot be undone.')) return
  busy.value = 'delete'; editorError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/pages/${selected.value.id}`, { method: 'DELETE', body: { expectedDocumentUpdatedAt: selected.value.document.updated_at }, validate: validateDelete })
    selected.value = null
    await loadPages()
    dirty.value = false
  } catch (error) { editorError.value = error instanceof Error ? error.message : 'Unable to delete page' } finally { busy.value = null }
}

async function duplicate() {
  if (!selected.value) return
  const original = selected.value
  selected.value = { ...original, id: '', page_id: '', path: `${original.path}-copy`, title: `${original.title} copy`, status: 'draft', published_revision_id: null, document: { updated_at: '', draft_revision_id: null, published_revision_id: null }, blocks: original.blocks.map(block => ({ ...block, id: crypto.randomUUID(), data: { ...block.data } })) }
  blockJson.value = selected.value.blocks.map(block => JSON.stringify(block.data, null, 2))
  dirty.value = true
  await save()
}

watch([selected, blockJson], () => {
  if (!hydrating.value) dirty.value = true
}, { deep: true })

watch(locale, async (nextLocale, previousLocale) => {
  if (loading.value || nextLocale === previousLocale) return
  if (dirty.value && !window.confirm('Discard unsaved page changes and switch locale?')) {
    locale.value = previousLocale
    return
  }
  selected.value = null
  await loadPages()
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Discard unsaved page changes?')) return false
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadPages()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>
