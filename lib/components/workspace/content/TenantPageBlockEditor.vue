<template>
  <div class="space-y-4">
    <div v-if="block.type === 'heading'" class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
      <UFormField label="Heading text"><UInput :model-value="stringField('text')" @update:model-value="setString('text', $event)" /></UFormField>
      <UFormField label="Heading level"><USelect :model-value="numberField('level', 2)" :items="headingLevels" @update:model-value="setNumber('level', $event)" /></UFormField>
    </div>

    <UFormField v-else-if="block.type === 'markdown'" label="Text">
      <UTextarea :model-value="stringField('markdown')" :rows="10" autoresize @update:model-value="setString('markdown', $event)" />
    </UFormField>

    <template v-else-if="block.type === 'image'">
      <UFormField label="Media asset">
        <MediaPicker :site-id="siteId" :model-value="mediaAt('media', 0)?.asset_id" accept="image" @change="setAsset" />
      </UFormField>
      <UFormField label="Caption"><UInput :model-value="stringField('caption')" @update:model-value="setString('caption', $event)" /></UFormField>
    </template>

    <template v-else-if="block.type === 'gallery'">
      <div class="space-y-3">
        <div v-for="(media, index) in mediaForSlot('gallery')" :key="`${media.asset_id}-${index}`" class="flex items-center gap-3">
          <span class="w-6 text-center text-xs text-muted">{{ index + 1 }}</span>
          <MediaPicker class="min-w-0 flex-1" :site-id="siteId" :model-value="media.asset_id" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset(index, $event)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove gallery image" :loading="galleryBusy" :disabled="galleryBusy" @click="commitGalleryAsset(index, null)" />
        </div>
        <div v-if="pendingNewGallerySlot" class="flex items-center gap-3">
          <span class="w-6 text-center text-xs text-muted">{{ mediaForSlot('gallery').length + 1 }}</span>
          <MediaPicker class="min-w-0 flex-1" :site-id="siteId" :model-value="null" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset('new', $event)" />
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Cancel adding image" :disabled="galleryBusy" @click="pendingNewGallerySlot = false" />
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :disabled="pendingNewGallerySlot || galleryBusy" @click="pendingNewGallerySlot = true">Add image</UButton>
      </div>
    </template>

    <template v-else-if="block.type === 'faq'">
      <UFormField label="Section title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
      <UFormField label="Data source">
        <USelect :model-value="faqSourceValue" :items="faqSourceOptions" @update:model-value="setString('source', $event)" />
        <p class="mt-1 text-xs text-muted">Use the site's published Q&amp;A records, or manage questions manually on this page.</p>
      </UFormField>
      <UAlert v-if="faqSourceValue === 'page_qa'" color="neutral" variant="soft" title="Live Q&amp;A source" description="Questions and answers come from the site's Q&amp;A manager and are shown in the preview after publishing." />
      <div v-else class="space-y-3">
        <div v-for="(item, index) in objectArray('items')" :key="itemKey(item, index)" class="rounded-lg border border-default p-3">
          <div class="mb-3 flex items-center justify-between gap-3"><p class="text-sm font-medium text-highlighted">Question {{ index + 1 }}</p><UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove FAQ item" @click="removeObjectItem('items', index)" /></div>
          <div class="space-y-3">
            <UFormField label="Question"><UInput :model-value="faqField(index, 'title')" @update:model-value="setFaqField(index, 'title', $event)" /></UFormField>
            <UFormField label="Answer"><UTextarea :model-value="faqField(index, 'description')" :rows="3" autoresize @update:model-value="setFaqField(index, 'description', $event)" /></UFormField>
          </div>
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addObjectItem('items', { title: '', description: '' })">Add question</UButton>
      </div>
    </template>

    <template v-else-if="isCtaBlock">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
        <UFormField label="Button label"><UInput :model-value="stringField('label')" @update:model-value="setString('label', $event)" /></UFormField>
        <UFormField class="sm:col-span-2" label="Description"><UTextarea :model-value="stringField('description')" :rows="3" autoresize @update:model-value="setString('description', $event)" /></UFormField>
        <UFormField class="sm:col-span-2" label="Button URL"><UInput :model-value="stringField('url')" placeholder="/contact or https://..." @update:model-value="setString('url', $event)" /></UFormField>
      </div>
    </template>

    <template v-else-if="block.type === 'callout'">
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <UFormField label="Title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
        <UFormField label="Tone"><USelect :model-value="stringField('tone') || 'neutral'" :items="toneOptions" @update:model-value="setString('tone', $event)" /></UFormField>
      </div>
      <UFormField label="Body"><UTextarea :model-value="stringField('body')" :rows="5" autoresize @update:model-value="setString('body', $event)" /></UFormField>
      <ButtonListEditor v-if="objectArray('buttons').length || block.type === 'callout'" :buttons="objectArray('buttons')" label="Callout buttons" @update="setObjectArray('buttons', $event)" />
    </template>

    <template v-else-if="block.type === 'hero'">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Eyebrow"><UInput :model-value="stringField('eyebrow')" @update:model-value="setString('eyebrow', $event)" /></UFormField>
        <UFormField label="Title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
        <UFormField class="sm:col-span-2" label="Subtitle"><UTextarea :model-value="stringField('subtitle')" :rows="3" autoresize @update:model-value="setString('subtitle', $event)" /></UFormField>
      </div>
      <UFormField label="Hero image">
        <MediaPicker :site-id="siteId" :model-value="mediaAt('media', 0)?.asset_id" accept="image" @change="setAsset" />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="CTA label"><UInput :model-value="stringField('cta_label')" @update:model-value="setString('cta_label', $event)" /></UFormField>
        <UFormField label="CTA URL"><UInput :model-value="stringField('cta_url')" placeholder="/contact or https://..." @update:model-value="setString('cta_url', $event)" /></UFormField>
      </div>
    </template>

    <template v-else-if="block.type === 'button_group'">
      <ButtonListEditor :buttons="objectArray('buttons')" label="Buttons" @update="setObjectArray('buttons', $event)" />
    </template>

    <template v-else-if="isGridBlock">
      <UFormField label="Section title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
      <UFormField v-if="sourceOptions.length" label="Data source">
        <USelect :model-value="sourceValue" :items="sourceOptions" @update:model-value="setString('source', $event)" />
        <p class="mt-1 text-xs text-muted">Canonical sources populate the preview from the site's live records.</p>
      </UFormField>

      <template v-if="sourceValue === 'calculator'">
        <UFormField label="Calculator note"><UInput :model-value="calculatorNote" @update:model-value="setCalculatorNote($event)" /></UFormField>
        <div class="space-y-3">
          <div v-for="(row, rowIndex) in calculatorRows" :key="rowIndex" class="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <UInput :model-value="cellValue(row, 0)" type="number" min="1" max="8" aria-label="Household size" @update:model-value="setCalculatorCell(rowIndex, 0, $event)" />
            <UInput :model-value="cellValue(row, 1)" type="number" aria-label="250 percent limit" placeholder="250%" @update:model-value="setCalculatorCell(rowIndex, 1, $event)" />
            <UInput :model-value="cellValue(row, 2)" type="number" aria-label="350 percent limit" placeholder="350%" @update:model-value="setCalculatorCell(rowIndex, 2, $event)" />
            <UInput :model-value="cellValue(row, 3)" type="number" aria-label="400 percent limit" placeholder="400%" @update:model-value="setCalculatorCell(rowIndex, 3, $event)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove calculator row" @click="removeCalculatorRow(rowIndex)" />
          </div>
          <div class="grid grid-cols-4 gap-2 text-xs text-muted"><span>Household size</span><span>250% limit</span><span>350% limit</span><span>400% limit</span></div>
          <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addCalculatorRow">Add calculator row</UButton>
        </div>
      </template>

      <template v-else-if="sourceValue === 'manual' || !sourceValue">
        <div class="space-y-3">
          <div v-for="(item, index) in objectArray('items')" :key="itemKey(item, index)" class="rounded-lg border border-default p-3">
            <div class="mb-3 flex items-center justify-between gap-3"><p class="text-sm font-medium text-highlighted">Item {{ index + 1 }}</p><UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove grid item" @click="removeObjectItem('items', index)" /></div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Title"><UInput :model-value="objectField(index, 'items', 'title', ['name'])" @update:model-value="setObjectField('items', index, 'title', $event)" /></UFormField>
              <UFormField label="Value"><UInput :model-value="objectField(index, 'items', 'value')" @update:model-value="setObjectField('items', index, 'value', $event)" /></UFormField>
              <UFormField class="sm:col-span-2" label="Description"><UTextarea :model-value="objectField(index, 'items', 'description', ['summary', 'body'])" :rows="2" autoresize @update:model-value="setObjectField('items', index, 'description', $event)" /></UFormField>
              <UFormField label="Image"><MediaPicker :site-id="siteId" :model-value="mediaAt(`items.${index}.image`, 0)?.asset_id" accept="image" @update:model-value="setMediaAt(`items.${index}.image`, 0, $event)" /></UFormField>
              <UFormField label="Link URL"><UInput :model-value="objectField(index, 'items', 'url', ['cta_url'])" @update:model-value="setObjectField('items', index, 'url', $event)" /></UFormField>
              <UFormField label="Link label"><UInput :model-value="objectField(index, 'items', 'label', ['cta_label'])" @update:model-value="setObjectField('items', index, 'label', $event)" /></UFormField>
            </div>
          </div>
          <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addObjectItem('items', { title: '', description: '', value: '', label: '', url: '' })">Add item</UButton>
        </div>
      </template>

      <template v-if="block.type === 'offering_grid'">
        <UFormField label="Offering references"><UTextarea :model-value="stringArray('offering_ids').join('\n')" :rows="3" placeholder="One offering ID per line" @update:model-value="setStringList('offering_ids', $event)" /></UFormField>
      </template>
      <template v-else-if="block.type === 'location_grid'">
        <UFormField label="Location references"><UTextarea :model-value="stringArray('location_ids').join('\n')" :rows="3" placeholder="One location ID per line" @update:model-value="setStringList('location_ids', $event)" /></UFormField>
      </template>
    </template>

    <template v-else-if="block.type === 'donation_choices'">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Section title"><UInput :model-value="stringField('title')" @update:model-value="setString('title', $event)" /></UFormField>
        <UFormField label="Donation destination"><UInput :model-value="stringField('destination')" placeholder="https://..." @update:model-value="setString('destination', $event)" /></UFormField>
        <UFormField class="sm:col-span-2" label="Description"><UTextarea :model-value="stringField('description')" :rows="3" autoresize @update:model-value="setString('description', $event)" /></UFormField>
      </div>
      <div class="space-y-3">
        <div v-for="(item, index) in objectArray('tiers')" :key="itemKey(item, index)" class="rounded-lg border border-default p-3">
          <div class="mb-3 flex items-center justify-between gap-3"><p class="text-sm font-medium text-highlighted">Tier {{ index + 1 }}</p><UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove donation tier" @click="removeObjectItem('tiers', index)" /></div>
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="Amount"><UInput :model-value="objectField(index, 'tiers', 'amount')" @update:model-value="setObjectField('tiers', index, 'amount', $event)" /></UFormField>
            <UFormField label="Title"><UInput :model-value="objectField(index, 'tiers', 'title')" @update:model-value="setObjectField('tiers', index, 'title', $event)" /></UFormField>
            <UFormField label="Description"><UInput :model-value="objectField(index, 'tiers', 'description')" @update:model-value="setObjectField('tiers', index, 'description', $event)" /></UFormField>
          </div>
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addObjectItem('tiers', { amount: '', title: '', description: '' })">Add tier</UButton>
      </div>
    </template>

    <UAlert v-else-if="block.type === 'divider'" color="neutral" variant="soft" title="Divider block" description="This block renders a visual separator and has no content fields." />

    <UAlert v-if="validationErrors.length" color="warning" variant="soft" title="Needs attention" :description="validationErrors.join(' ')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { TenantPageBlock, TenantPageType } from '~/utils/tenant-page-blocks'
import { validateTenantPageBlock } from '~/utils/tenant-page-editor'

const props = defineProps<{ block: TenantPageBlock; siteId: string; isPersisted: boolean; pageRecipe?: string | null; pageType: TenantPageType }>()
const emit = defineEmits<{ 'update:block': [block: TenantPageBlock] }>()
const dashboardApi = useDashboardApi()
const toast = useToast()
const pendingNewGallerySlot = ref(false)
const galleryBusy = ref(false)

const headingLevels = [1, 2, 3, 4, 5, 6].map(level => ({ label: `H${level}`, value: level }))
const toneOptions = ['neutral', 'info', 'success', 'warning', 'error'].map(value => ({ label: value[0]!.toUpperCase() + value.slice(1), value }))
const faqSourceOptions = [{ label: 'Manual questions', value: 'manual' }, { label: 'Published site Q&A', value: 'page_qa' }]

const validationErrors = computed(() => validateTenantPageBlock(props.block))
const isCtaBlock = computed(() => ['cta', 'contact_cta', 'booking_cta'].includes(props.block.type))
const isGridBlock = computed(() => ['feature_grid', 'testimonial_grid', 'offering_grid', 'location_grid'].includes(props.block.type))
const faqSourceValue = computed(() => stringField('source') || 'manual')
const sourceOptions = computed(() => {
  switch (props.block.type) {
    case 'feature_grid': return [{ label: 'Manual items', value: 'manual' }, { label: 'Published posts', value: 'site_posts' }, { label: 'Pricing calculator', value: 'calculator' }]
    case 'testimonial_grid': return [{ label: 'Manual items', value: 'manual' }, { label: 'Published reviews', value: 'site_reviews' }]
    case 'offering_grid': return [{ label: 'Manual items', value: 'manual' }, { label: 'Published offerings', value: 'site_offerings' }]
    case 'location_grid': return [{ label: 'Manual items', value: 'manual' }]
    default: return []
  }
})
const sourceValue = computed(() => stringField('source') || 'manual')

function emitBlock(block: TenantPageBlock) {
  emit('update:block', block)
}

function stringField(key: string): string {
  const value = props.block.data[key]
  return value == null ? '' : String(value)
}

function numberField(key: string, fallback: number): number {
  const value = Number(props.block.data[key])
  return Number.isFinite(value) ? value : fallback
}

function setString(key: string, value: unknown) {
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: value == null ? '' : String(value) } })
}

function setAsset(asset: { asset_id: string; alt_text?: string } | null) {
  emitBlock({
    ...props.block,
    data: { ...props.block.data, alt: asset?.alt_text ?? '' },
    media: asset ? [{ asset_id: asset.asset_id, slot: 'media', sort_order: 0 }, ...props.block.media.filter(item => item.slot !== 'media')] : props.block.media.filter(item => item.slot !== 'media'),
  })
}

function mediaForSlot(slot: string) {
  return props.block.media.filter(item => item.slot === slot).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function mediaAt(slot: string, index: number) {
  return mediaForSlot(slot)[index]
}

function setMediaAt(slot: string, index: number, assetId: string | null | undefined) {
  const slotMedia = mediaForSlot(slot)
  if (assetId) slotMedia[index] = { asset_id: assetId, slot, sort_order: index }
  else slotMedia.splice(index, 1)
  emitBlock({ ...props.block, media: [...props.block.media.filter(item => item.slot !== slot), ...slotMedia.map((item, sort_order) => ({ ...item, sort_order }))] })
}

// content_block:gallery is an ordered collection — once this block is
// persisted (has a real content_blocks row), its membership only ever
// changes through the generic attach/remove/reorder routes, never a local
// array mutation bundled into the page's own save. Before persistence there
// is nothing to attach to yet, so edits stay purely local until the first
// save creates the row (see TenantPageEditor.vue's savedBlockIds).
const galleryPlacement = computed(() => ({ owner_type: 'content_block', owner_id: props.block.id, slot: 'gallery' }))

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
  emitBlock({
    ...props.block,
    media: [
      ...props.block.media.filter(item => item.slot !== 'gallery'),
      ...media.map((item, index) => ({
        asset_id: item.asset_id,
        slot: 'gallery',
        sort_order: item.sort_order ?? index,
        public_url: item.public_url ?? null,
        thumbnail_url: item.thumbnail_url ?? null,
        kind: item.kind ?? null,
        alt_text: item.alt_text ?? null,
      })),
    ],
  })
}

async function commitGalleryAsset(index: number | 'new', assetId: string | null | undefined) {
  if (!props.isPersisted) {
    if (index === 'new') {
      if (assetId) setMediaAt('gallery', mediaForSlot('gallery').length, assetId)
      pendingNewGallerySlot.value = false
    } else if (assetId) {
      setMediaAt('gallery', index, assetId)
    } else {
      setMediaAt('gallery', index, null)
    }
    return
  }

  const current = mediaForSlot('gallery')
  galleryBusy.value = true
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
    // committed server-side stays reflected in local state instead of going stale.
    const attachResult = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/attach`, {
      method: 'POST',
      body: { placement: galleryPlacement.value, asset_id: assetId },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(attachResult.media)
    const removeResult = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/remove`, {
      method: 'POST',
      body: { placement: galleryPlacement.value, asset_id: existing.asset_id },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(removeResult.media)
    const anchor = current[index + 1]
    const result = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/reorder`, {
      method: 'POST',
      body: {
        placement: galleryPlacement.value,
        moves: anchor ? [{ asset_id: assetId, before_asset_id: anchor.asset_id }] : [{ asset_id: assetId }],
      },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(result.media)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update gallery image', color: 'error' })
  } finally {
    galleryBusy.value = false
  }
}

function setNumber(key: string, value: unknown) {
  const number = Number(value)
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: Number.isFinite(number) ? number : null } })
}

function stringArray(key: string): string[] {
  const value = props.block.data[key]
  return Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : '') : []
}

function setStringList(key: string, value: unknown) {
  const list = String(value ?? '').split('\n').map(item => item.trim()).filter(Boolean)
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: list } })
}

function objectArray(key: string): Array<Record<string, unknown>> {
  const value = props.block.data[key]
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []
}

function itemKey(item: Record<string, unknown>, index: number): string {
  return typeof item.id === 'string' && item.id ? item.id : `${props.block.id}-${index}`
}

function objectField(index: number, key: string, field: string, aliases: string[] = []): string {
  const item = objectArray(key)[index]
  if (!item) return ''
  for (const candidate of [field, ...aliases]) if (item[candidate] != null) return String(item[candidate])
  return ''
}

function setObjectField(key: string, index: number, field: string, value: unknown) {
  const items = objectArray(key)
  const item = items[index]
  if (!item) return
  items[index] = { ...item, [field]: value == null ? '' : String(value) }
  setObjectArray(key, items)
}

function faqField(index: number, field: 'title' | 'description'): string {
  const aliases = field === 'title' ? ['question'] : ['answer']
  return objectField(index, 'items', field, aliases)
}

function setFaqField(index: number, field: 'title' | 'description', value: unknown) {
  const items = objectArray('items')
  const item = items[index]
  if (!item) return
  const canonicalValue = value == null ? '' : String(value)
  const alias = field === 'title' ? 'question' : 'answer'
  items[index] = { ...item, [field]: canonicalValue, ...(item[alias] !== undefined ? { [alias]: canonicalValue } : {}) }
  setObjectArray('items', items)
}

function addObjectItem(key: string, item: Record<string, unknown>) {
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: [...objectArray(key), { ...item }] } })
}

function removeObjectItem(key: string, index: number) {
  const media = key === 'items'
    ? props.block.media.flatMap((item) => {
        const match = /^items\.(\d+)\.image$/.exec(item.slot)
        if (!match) return [item]
        const itemIndex = Number(match[1])
        if (itemIndex === index) return []
        return [{ ...item, slot: itemIndex > index ? `items.${itemIndex - 1}.image` : item.slot }]
      })
    : props.block.media
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: objectArray(key).filter((_, itemIndex) => itemIndex !== index) }, media })
}

function setObjectArray(key: string, items: Array<Record<string, unknown>>) {
  emitBlock({ ...props.block, data: { ...props.block.data, [key]: items } })
}

function calculatorConfig(): Record<string, unknown> {
  const value = props.block.data.calculator
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const calculatorRows = computed(() => {
  const rows = calculatorConfig().rows
  return Array.isArray(rows) ? rows.filter((row): row is unknown[] => Array.isArray(row)).map(row => [...row]) : []
})
const calculatorNote = computed(() => String(calculatorConfig().note ?? ''))

function setCalculator(rows: unknown[][], note = calculatorNote.value) {
  emitBlock({ ...props.block, data: { ...props.block.data, calculator: { ...calculatorConfig(), note, rows } } })
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
</script>
