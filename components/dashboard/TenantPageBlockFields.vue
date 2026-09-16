<template>
  <div class="space-y-6">
    <!-- heading -->
    <template v-if="block.type === 'heading'">
      <UFormField label="Heading text" required>
        <UInput :model-value="str('text')" size="xl" autofocus class="w-full" @update:model-value="setString('text', $event)" />
      </UFormField>
      <UFormField label="Heading level">
        <USelect :model-value="num('level', 2)" :items="HEADING_LEVELS" value-key="value" label-key="label" size="xl" class="w-full" @update:model-value="setNumber('level', $event)" />
      </UFormField>
    </template>

    <!-- markdown -->
    <UFormField v-else-if="block.type === 'markdown'" label="Text">
      <!-- Lazy: the rich text editor pulls TipTap/ProseMirror, ~211 KB over the
           wire. Only a markdown block opens it, so the editor route should not
           pay for it to render a list of sections. -->
      <LazyRichTextEditor
        :model-value="str('markdown')"
        :mode="markdownMode"
        placeholder="Start writing in Markdown…"
        @update:model-value="setString('markdown', $event)"
        @split-insert="$emit('splitInsert', $event)"
      />
    </UFormField>

    <!-- image -->
    <template v-else-if="block.type === 'image'">
      <UFormField label="Image" required>
        <MediaPicker :site-id="siteId" :model-value="mediaAt('media', 0)?.asset_id" :selected-summary="mediaAt('media', 0)" accept="image" @update:model-value="setMediaAt('media', 0, $event)" />
      </UFormField>
      <UFormField label="Caption">
        <UInput :model-value="str('caption')" size="xl" class="w-full" @update:model-value="setString('caption', $event)" />
      </UFormField>
    </template>

    <!-- gallery -->
    <template v-else-if="block.type === 'gallery'">
      <UFormField label="Caption">
        <UInput :model-value="str('caption')" size="xl" class="w-full" @update:model-value="setString('caption', $event)" />
      </UFormField>
      <div class="space-y-3">
        <div v-for="(media, index) in mediaForSlot('gallery')" :key="`${media.asset_id}-${index}`" class="flex items-center gap-3">
          <span class="w-6 shrink-0 text-center text-xs text-muted">{{ index + 1 }}</span>
          <MediaPicker class="min-w-0 flex-1" :site-id="siteId" :model-value="media.asset_id" :selected-summary="media" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset(index, $event)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" square aria-label="Remove gallery image" :loading="galleryBusy" :disabled="galleryBusy" @click="commitGalleryAsset(index, null)" />
        </div>
        <div v-if="pendingNewGallerySlot" class="flex items-center gap-3">
          <span class="w-6 shrink-0 text-center text-xs text-muted">{{ mediaForSlot('gallery').length + 1 }}</span>
          <MediaPicker class="min-w-0 flex-1" :site-id="siteId" :model-value="null" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset('new', $event)" />
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" square aria-label="Cancel adding image" :disabled="galleryBusy" @click="pendingNewGallerySlot = false" />
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :disabled="pendingNewGallerySlot || galleryBusy" @click="pendingNewGallerySlot = true">Add image</UButton>
      </div>
      <UAlert v-if="galleryError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="galleryError" />
    </template>

    <!-- faq -->
    <template v-else-if="block.type === 'faq'">
      <UFormField label="Section title">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField label="Questions" description="Which published Q&amp;A records this block lists. Add or edit questions in the site's Q&amp;A manager.">
        <USelect :model-value="faqSource" :items="FAQ_SOURCE_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" @update:model-value="setString('source', $event)" />
      </UFormField>
    </template>

    <!-- page_grid: references, chosen from the pages that exist -->
    <template v-else-if="block.type === 'page_grid'">
      <UFormField label="Section title">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField label="Pages" required description="The pages this grid links to.">
        <USelectMenu
          :model-value="strList('page_ids')"
          :items="pageOptions"
          value-key="value"
          label-key="label"
          multiple
          size="xl"
          class="w-full"
          placeholder="Choose pages"
          @update:model-value="setStringList('page_ids', $event)"
        />
      </UFormField>
    </template>

    <!-- product_grid: a collection or named products, never both -->
    <template v-else-if="block.type === 'product_grid'">
      <UFormField label="Section title">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField label="Products" description="A whole collection, or the products you name.">
        <USelect v-model="productMode" :items="PRODUCT_MODES" value-key="value" label-key="label" size="xl" class="w-full" />
      </UFormField>
      <UFormField v-if="productMode === 'collection'" label="Collection" required>
        <USelect
          :model-value="str('collection_id')"
          :items="collectionOptions"
          value-key="value"
          label-key="label"
          size="xl"
          class="w-full"
          placeholder="Choose a collection"
          @update:model-value="setCollection($event)"
        />
      </UFormField>
      <UFormField v-else label="Products" required>
        <USelectMenu
          :model-value="strList('product_ids')"
          :items="productOptions"
          value-key="value"
          label-key="label"
          multiple
          size="xl"
          class="w-full"
          placeholder="Choose products"
          @update:model-value="setProducts($event)"
        />
      </UFormField>
    </template>

    <!-- how_to / grids: the title on its own -->
    <UFormField v-else-if="sectionKey === 'title'" label="Section title">
      <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
    </UFormField>

    <!-- settings: title, and where the rows come from -->
    <template v-else-if="sectionKey === 'settings'">
      <UFormField label="Section title">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField v-if="sourceOptions.length" label="Rows" description="Canonical sources read the site's live records.">
        <USelect :model-value="source" :items="sourceOptions" value-key="value" label-key="label" size="xl" class="w-full" @update:model-value="setString('source', $event)" />
      </UFormField>
    </template>

    <!-- location_grid references -->
    <UFormField v-else-if="sectionKey === 'locations'" label="Locations" description="The locations this grid links to.">
      <USelectMenu
        :model-value="strList('location_ids')"
        :items="locationOptions"
        value-key="value"
        label-key="label"
        multiple
        size="xl"
        class="w-full"
        placeholder="Choose locations"
        @update:model-value="setStringList('location_ids', $event)"
      />
    </UFormField>

    <!-- copy -->
    <template v-else-if="sectionKey === 'copy'">
      <UFormField v-if="block.type === 'hero'" label="Eyebrow">
        <UInput :model-value="str('eyebrow')" size="xl" class="w-full" @update:model-value="setString('eyebrow', $event)" />
      </UFormField>
      <UFormField label="Title">
        <UInput :model-value="str('title')" size="xl" :autofocus="block.type !== 'hero'" class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField v-if="block.type === 'hero'" label="Subtitle">
        <UTextarea :model-value="str('subtitle')" :rows="3" autoresize class="w-full" @update:model-value="setString('subtitle', $event)" />
      </UFormField>
      <UFormField v-else label="Description">
        <UTextarea :model-value="str('description')" :rows="4" autoresize class="w-full" @update:model-value="setString('description', $event)" />
      </UFormField>
    </template>

    <!-- message (callout) -->
    <template v-else-if="sectionKey === 'message'">
      <UFormField label="Title">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="setString('title', $event)" />
      </UFormField>
      <UFormField label="Body">
        <UTextarea :model-value="str('body')" :rows="5" autoresize class="w-full" @update:model-value="setString('body', $event)" />
      </UFormField>
      <UFormField label="Tone">
        <USelect :model-value="str('tone') || 'neutral'" :items="TONE_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" @update:model-value="setString('tone', $event)" />
      </UFormField>
    </template>

    <!-- image (hero) -->
    <UFormField v-else-if="sectionKey === 'image'" label="Image">
      <MediaPicker :site-id="siteId" :model-value="mediaAt('media', 0)?.asset_id" :selected-summary="mediaAt('media', 0)" accept="image" @update:model-value="setMediaAt('media', 0, $event)" />
    </UFormField>

    <!-- button: a label and where it goes -->
    <template v-else-if="sectionKey === 'button'">
      <UFormField label="Button label">
        <UInput :model-value="str(buttonLabelKey)" size="xl" autofocus class="w-full" @update:model-value="setString(buttonLabelKey, $event)" />
      </UFormField>
      <UFormField label="Button URL">
        <UInput :model-value="str(buttonUrlKey)" size="xl" placeholder="/contact or https://example.com" class="w-full" @update:model-value="setString(buttonUrlKey, $event)" />
      </UFormField>
    </template>

    <!-- destination (donation_choices) -->
    <UFormField v-else-if="sectionKey === 'destination'" label="Donation destination" required>
      <UInput :model-value="str('destination')" size="xl" placeholder="https://example.com/give" autofocus class="w-full" @update:model-value="setString('destination', $event)" />
    </UFormField>

    <!-- calculator -->
    <template v-else-if="sectionKey === 'calculator'">
      <UFormField label="Note">
        <UInput :model-value="calculatorNote" size="xl" class="w-full" @update:model-value="setCalculatorNote($event)" />
      </UFormField>
      <div class="space-y-3">
        <div class="grid gap-2 text-xs text-muted lg:grid-cols-4">
          <span>Household size</span><span>250% limit</span><span>350% limit</span><span>400% limit</span>
        </div>
        <div v-for="(row, rowIndex) in calculatorRows" :key="rowIndex" class="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <UInput :model-value="cellValue(row, 0)" type="number" min="1" max="8" aria-label="Household size" @update:model-value="setCalculatorCell(rowIndex, 0, $event)" />
          <UInput :model-value="cellValue(row, 1)" type="number" aria-label="250 percent limit" placeholder="250%" @update:model-value="setCalculatorCell(rowIndex, 1, $event)" />
          <UInput :model-value="cellValue(row, 2)" type="number" aria-label="350 percent limit" placeholder="350%" @update:model-value="setCalculatorCell(rowIndex, 2, $event)" />
          <UInput :model-value="cellValue(row, 3)" type="number" aria-label="400 percent limit" placeholder="400%" @update:model-value="setCalculatorCell(rowIndex, 3, $event)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" square aria-label="Remove calculator row" @click="removeCalculatorRow(rowIndex)" />
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addCalculatorRow">Add row</UButton>
      </div>
    </template>

    <UAlert
      v-if="validationErrors.length"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Needs attention"
      :description="validationErrors.join(' ')"
    />
  </div>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import { FAQ_SOURCE_OPTIONS, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { isPlatformTemplate } from '~/utils/template-registry'
import { FAQ_BLOCK_SOURCES, type FaqBlockSource } from '~/shared/faq-block'
import { tenantPageBlockSource } from '~/utils/tenant-page-block-sections'
import { isTenantPageListResponse, type TenantPageListRow } from '~/composables/useTenantPageDraft'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

/**
 * The controls of one leaf of one block.
 *
 * The block it is handed is the page draft's own object, so writing a field
 * here is writing the page, and the level that owns the commit bar saves it.
 * That is why this component has no Save of its own and no copy of the block.
 */
const props = defineProps<{
  siteId: string
  pageId: string
  /** The block's id, or `new` while it is being added. */
  blockId: string
  sectionKey: string
}>()

defineEmits<{ splitInsert: [payload: { after: string; blockType: 'image' | 'faq' | 'how_to'; editorMode: 'rich' | 'source' }] }>()

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()

const { draft, savedBlockIds } = useTenantPageDraft(props.siteId, props.pageId)
const newBlock = useTenantPageNewBlock(props.siteId, props.pageId)

/**
 * The block this leaf edits, taken from the page draft rather than copied into
 * a prop: writing a field here is writing the page, and the level that owns the
 * commit bar saves exactly what these controls changed.
 */
const block = computed<TenantPageBlock>(() => {
  const found = props.blockId === 'new'
    ? newBlock.value
    : draft.value.blocks.find(candidate => candidate.id === props.blockId) ?? null
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Section not found' })
  return found
})

/** A block has a `content_blocks` row only once the page has been saved with it. */
const isPersisted = computed(() => savedBlockIds.value.has(block.value.id))

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6].map(level => ({ label: `H${level}`, value: level }))
const TONE_OPTIONS = ['neutral', 'info', 'success', 'warning', 'error']
  .map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
const PRODUCT_MODES = [
  { label: 'A collection', value: 'collection' },
  { label: 'Products I choose', value: 'products' },
]

const validationErrors = computed(() => validateTenantPageBlock(block.value))

// ── Reading and writing the block ───────────────────────
function str(key: string): string {
  const value = block.value.data[key]
  return value == null ? '' : String(value)
}

function num(key: string, fallback: number): number {
  const value = Number(block.value.data[key])
  return Number.isFinite(value) ? value : fallback
}

function strList(key: string): string[] {
  const value = block.value.data[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function setString(key: string, value: unknown) {
  block.value.data[key] = value == null ? '' : String(value)
}

function setNumber(key: string, value: unknown) {
  const number = Number(value)
  block.value.data[key] = Number.isFinite(number) ? number : null
}

function setStringList(key: string, value: unknown) {
  block.value.data[key] = Array.isArray(value) ? value.map(item => String(item)) : []
}

// ── Media ───────────────────────────────────────────────
function mediaForSlot(slot: string) {
  return block.value.media.filter(item => item.slot === slot).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function mediaAt(slot: string, index: number) {
  return mediaForSlot(slot)[index]
}

function setMediaAt(slot: string, index: number, assetId: string | null | undefined) {
  const slotMedia = mediaForSlot(slot)
  if (assetId) slotMedia[index] = { asset_id: assetId, slot, sort_order: index }
  else slotMedia.splice(index, 1)
  block.value.media = [
    ...block.value.media.filter(item => item.slot !== slot),
    ...slotMedia.map((item, sort_order) => ({ ...item, sort_order })),
  ]
}

// ── Markdown ────────────────────────────────────────────
/** The stored editor mode, which the block has carried since it was created. */
const markdownMode = computed<'rich' | 'source'>(() => (str('editor_mode') === 'source' ? 'source' : 'rich'))

// ── FAQ ─────────────────────────────────────────────────
/** The stored source, or nothing: an unknown value is not quietly shown as one of the two. */
const faqSource = computed<FaqBlockSource | undefined>(() => FAQ_BLOCK_SOURCES.find(source => source === str('source')))

// ── Grid sources ────────────────────────────────────────
const isPlatformSite = computed(() => isPlatformTemplate({ themeId: dashboard.site.value?.theme_id }))
const source = computed(() => tenantPageBlockSource(block.value))
const sourceOptions = computed(() => {
  switch (block.value.type) {
    case 'feature_grid': return [
      { label: 'Items I write', value: 'manual' },
      { label: 'Published posts', value: 'site_posts' },
      { label: 'Pricing calculator', value: 'calculator' },
      // KrabiClaw's own plans come from its Stripe catalog, so this source is
      // offered on KrabiClaw's own site and nowhere else.
      ...(isPlatformSite.value ? [{ label: 'KrabiClaw plans', value: 'billing_plans' }] : []),
    ]
    case 'testimonial_grid': return [
      { label: 'Items I write', value: 'manual' },
      { label: 'Published reviews', value: 'site_reviews' },
    ]
    default: return []
  }
})

// ── Button keys ─────────────────────────────────────────
// A hero names its button with its own keys; every other block uses the plain ones.
const buttonLabelKey = computed(() => (block.value.type === 'hero' ? 'cta_label' : 'label'))
const buttonUrlKey = computed(() => (block.value.type === 'hero' ? 'cta_url' : 'url'))

// ── References ──────────────────────────────────────────
// A reference block stores ids, so the tenant picks records rather than typing
// identifiers a typo turns into a page that renders nothing.
const needsPages = computed(() => block.value.type === 'page_grid')
const needsProducts = computed(() => block.value.type === 'product_grid')

const { data: pagesData } = await useAsyncData(
  `tenant-page-references-${props.siteId}`,
  () => dashboardApi<{ pages: TenantPageListRow[] }>(`/api/editor/sites/${props.siteId}/pages`, { validate: isTenantPageListResponse }),
  { server: false, immediate: needsPages.value },
)

/** A grid links to other pages; linking a page to itself is not a thing to offer. */
const pageOptions = computed(() => (pagesData.value?.pages ?? [])
  .filter(page => page.locale === 'en' && page.page_id !== draft.value.page_id)
  .map(page => ({ label: page.path === '/' ? 'Home' : `${page.title} — ${page.path}`, value: page.page_id })))

interface CollectionRow { id: string; name: string }
interface ProductRow { id: string; name: string }

const isCollectionsResponse = (value: unknown): value is { collections: CollectionRow[] } =>
  isRecord(value) && Array.isArray(value.collections)
    && value.collections.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string')

const isProductsResponse = (value: unknown): value is { products: ProductRow[] } =>
  isRecord(value) && Array.isArray(value.products)
    && value.products.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string')

const { data: collectionsData } = await useAsyncData(
  `tenant-page-collections-${props.siteId}`,
  () => dashboardApi<{ collections: CollectionRow[] }>(`/api/editor/sites/${props.siteId}/collections`, { validate: isCollectionsResponse }),
  { server: false, immediate: needsProducts.value },
)
const { data: productsData } = await useAsyncData(
  `tenant-page-products-${props.siteId}`,
  () => dashboardApi<{ products: ProductRow[] }>(`/api/editor/sites/${props.siteId}/products`, { validate: isProductsResponse }),
  { server: false, immediate: needsProducts.value },
)

const collectionOptions = computed(() => (collectionsData.value?.collections ?? []).map(row => ({ label: row.name, value: row.id })))
const productOptions = computed(() => (productsData.value?.products ?? []).map(row => ({ label: row.name, value: row.id })))
const locationOptions = computed(() => dashboard.locations.value.map(location => ({ label: location.title, value: location.id })))

/**
 * The server accepts a collection or named products and refuses both, so the
 * editor offers one question with two answers instead of two boxes that can
 * contradict each other.
 */
const productMode = ref<'collection' | 'products'>(strList('product_ids').length ? 'products' : 'collection')
// Choosing "Products I choose" empties the collection; choosing a collection
// empties the products. The mode itself is the tenant's answer, held here —
// deriving it from `product_ids` meant an empty product list read as
// "collection" and the product picker could never be reached.
watch(productMode, (value) => {
  if (value === 'collection') block.value.data.product_ids = []
  else block.value.data.collection_id = ''
})

function setCollection(value: unknown) {
  block.value.data.collection_id = value == null ? '' : String(value)
  block.value.data.product_ids = []
}

function setProducts(value: unknown) {
  setStringList('product_ids', value)
  block.value.data.collection_id = ''
}

// ── Calculator ──────────────────────────────────────────
function calculatorConfig(): Record<string, unknown> {
  const value = block.value.data.calculator
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const calculatorRows = computed(() => {
  const rows = calculatorConfig().rows
  return Array.isArray(rows) ? rows.filter((row): row is unknown[] => Array.isArray(row)).map(row => [...row]) : []
})
const calculatorNote = computed(() => String(calculatorConfig().note ?? ''))

function setCalculator(rows: unknown[][], note = calculatorNote.value) {
  block.value.data.calculator = { ...calculatorConfig(), note, rows }
}

function setCalculatorNote(value: unknown) {
  setCalculator(calculatorRows.value, String(value ?? ''))
}

function cellValue(row: unknown[], index: number): string {
  return row[index] == null ? '' : String(row[index])
}

function setCalculatorCell(rowIndex: number, cellIndex: number, value: unknown) {
  const rows = calculatorRows.value
  const row = rows[rowIndex] ?? []
  while (row.length <= cellIndex) row.push('')
  row[cellIndex] = value == null ? '' : String(value)
  rows[rowIndex] = row
  setCalculator(rows)
}

function addCalculatorRow() {
  setCalculator([...calculatorRows.value, [calculatorRows.value.length + 1, '', '', '']])
}

function removeCalculatorRow(index: number) {
  setCalculator(calculatorRows.value.filter((_, rowIndex) => rowIndex !== index))
}

// ── Gallery ─────────────────────────────────────────────
// `content_block:gallery` is an ordered collection: once this block is
// persisted its membership only ever changes through the generic
// attach/remove/reorder routes, never a local array mutation bundled into the
// page's own save. Before that there is nothing to attach to, so edits stay
// local until the first save creates the row.
const pendingNewGallerySlot = ref(false)
const galleryBusy = ref(false)
const galleryError = ref<string | null>(null)
const galleryPlacement = computed(() => ({ owner_type: 'content_block', owner_id: block.value.id, slot: 'gallery' }))

interface GalleryMediaItem {
  asset_id: string
  sort_order?: number
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  alt_text?: string | null
}

const isMediaMutationResponse = (value: unknown): value is { media: GalleryMediaItem[] } =>
  isRecord(value) && Array.isArray(value.media)

function applyCanonicalGalleryMedia(media: GalleryMediaItem[]) {
  block.value.media = [
    ...block.value.media.filter(item => item.slot !== 'gallery'),
    ...media.map((item, index) => ({
      asset_id: item.asset_id,
      slot: 'gallery',
      sort_order: item.sort_order ?? index,
      public_url: item.public_url ?? null,
      thumbnail_url: item.thumbnail_url ?? null,
      kind: item.kind ?? null,
      alt_text: item.alt_text ?? null,
    })),
  ]
}

async function commitGalleryAsset(index: number | 'new', assetId: string | null | undefined) {
  if (!isPersisted.value) {
    if (index === 'new') {
      if (assetId) setMediaAt('gallery', mediaForSlot('gallery').length, assetId)
      pendingNewGallerySlot.value = false
      return
    }
    setMediaAt('gallery', index, assetId ?? null)
    return
  }

  const current = mediaForSlot('gallery')
  galleryBusy.value = true
  galleryError.value = null
  try {
    if (index === 'new') {
      if (!assetId) { pendingNewGallerySlot.value = false; return }
      const result = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/attach`, {
        method: 'POST',
        body: { placement: galleryPlacement.value, asset_id: assetId },
        validate: isMediaMutationResponse,
      })
      applyCanonicalGalleryMedia(result.media)
      pendingNewGallerySlot.value = false
      return
    }

    const existing = current[index]
    if (!existing) return
    if (!assetId) {
      const result = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/remove`, {
        method: 'POST',
        body: { placement: galleryPlacement.value, asset_id: existing.asset_id },
        validate: isMediaMutationResponse,
      })
      applyCanonicalGalleryMedia(result.media)
      return
    }
    if (assetId === existing.asset_id) return

    // Replace the asset at this position without disturbing anything else:
    // attach the new one (it lands at the end), remove the old one, then
    // reorder the new asset back to this exact position. Each step's response
    // is applied immediately — if a later step throws, whatever already
    // committed server-side stays reflected here instead of going stale.
    const attachResult = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/attach`, {
      method: 'POST',
      body: { placement: galleryPlacement.value, asset_id: assetId },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(attachResult.media)
    // The replacement is put in place before the image it replaces is taken
    // out. Removing first meant a failed reorder left the gallery a picture
    // short, with the new one appended at the end: the editor had lost an
    // image and gained a misplaced one. This order fails towards two images in
    // the right order, which the editor can finish by hand.
    const anchor = current[index + 1]
    const reordered = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/reorder`, {
      method: 'POST',
      body: {
        placement: galleryPlacement.value,
        moves: anchor ? [{ asset_id: assetId, before_asset_id: anchor.asset_id }] : [{ asset_id: assetId }],
      },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(reordered.media)
    const removeResult = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/remove`, {
      method: 'POST',
      body: { placement: galleryPlacement.value, asset_id: existing.asset_id },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(removeResult.media)
  } catch (error) {
    galleryError.value = error instanceof Error ? error.message : 'Failed to update gallery image'
  } finally {
    galleryBusy.value = false
  }
}
</script>
