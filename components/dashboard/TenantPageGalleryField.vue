<template>
  <div class="space-y-3">
    <div v-for="(media, index) in slotMedia" :key="`${media.asset_id}-${index}`" class="flex items-center gap-3">
      <span class="w-6 shrink-0 text-center text-xs text-muted">{{ index + 1 }}</span>
      <MediaPicker class="min-w-0 flex-1" :organization-id="organizationId" :model-value="media.asset_id" :selected-summary="media" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset(index, $event)" />
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" square aria-label="Remove gallery image" :loading="galleryBusy" :disabled="galleryBusy" @click="commitGalleryAsset(index, null)" />
    </div>
    <div v-if="pendingNewGallerySlot" class="flex items-center gap-3">
      <span class="w-6 shrink-0 text-center text-xs text-muted">{{ slotMedia.length + 1 }}</span>
      <MediaPicker class="min-w-0 flex-1" :organization-id="organizationId" :model-value="null" accept="image" :disabled="galleryBusy" @update:model-value="commitGalleryAsset('new', $event)" />
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" square aria-label="Cancel adding image" :disabled="galleryBusy" @click="pendingNewGallerySlot = false" />
    </div>
    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :disabled="pendingNewGallerySlot || galleryBusy" @click="pendingNewGallerySlot = true">Add image</UButton>
    <UAlert v-if="galleryError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="galleryError" />
  </div>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import { isRecord } from '~/utils/api-clients'
import { useTenantPageDraft, useTenantPageBlock } from '~/composables/useTenantPageDraft'

/**
 * An ordered gallery, which is the one media field whose edits are writes.
 *
 * A saved block's gallery lives in media placements, so reordering or
 * replacing an image is a call to the placement API rather than a change to
 * the draft — and each response is applied as it arrives, so a failure part
 * way through leaves the editor showing what the server actually holds. An
 * unsaved block has no placements yet and edits its draft directly.
 */
const props = defineProps<{ organizationId: string; pageId: string; blockId: string }>()

const dashboardApi = useDashboardApi()
const { savedBlockIds } = useTenantPageDraft(props.organizationId, props.pageId)

const block = useTenantPageBlock(props.organizationId, props.pageId, () => props.blockId)
const isPersisted = computed(() => savedBlockIds.value.has(block.value.id))
const slotMedia = computed(() => mediaForSlot('gallery'))

function mediaForSlot(slot: string) {
  return block.value.media.filter(item => item.slot === slot).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function setMediaAt(slot: string, index: number, assetId: string | null | undefined) {
  const items = mediaForSlot(slot)
  if (assetId) items[index] = { asset_id: assetId, slot, sort_order: index }
  else items.splice(index, 1)
  block.value.media = [
    ...block.value.media.filter(item => item.slot !== slot),
    ...items.map((item, sort_order) => ({ ...item, sort_order })),
  ]
}

const pendingNewGallerySlot = ref(false)
const galleryBusy = ref(false)
/** A failed placement write says so here, beside the images it did not change. */
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

/**
 * The placement API's answer, checked row by row. `Array.isArray` alone let a
 * row with no `asset_id` through, and the gallery then rendered a picture with
 * no asset behind it — an editor showing something the server does not hold.
 */
const isGalleryMediaItem = (value: unknown): value is GalleryMediaItem =>
  isRecord(value)
  && typeof value.asset_id === 'string' && value.asset_id !== ''
  && (value.sort_order === undefined || typeof value.sort_order === 'number')
  && (['public_url', 'thumbnail_url', 'kind', 'alt_text'] as const)
    .every(key => value[key] === undefined || value[key] === null || typeof value[key] === 'string')

const isMediaMutationResponse = (value: unknown): value is { media: GalleryMediaItem[] } =>
  isRecord(value) && Array.isArray(value.media) && value.media.every(isGalleryMediaItem)

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
      const result = await dashboardApi(`/api/editor/organizations/${props.organizationId}/media/placements/attach`, {
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
      const result = await dashboardApi(`/api/editor/organizations/${props.organizationId}/media/placements/remove`, {
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
    const attachResult = await dashboardApi(`/api/editor/organizations/${props.organizationId}/media/placements/attach`, {
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
    const reordered = await dashboardApi(`/api/editor/organizations/${props.organizationId}/media/placements/reorder`, {
      method: 'POST',
      body: {
        placement: galleryPlacement.value,
        moves: anchor ? [{ asset_id: assetId, before_asset_id: anchor.asset_id }] : [{ asset_id: assetId }],
      },
      validate: isMediaMutationResponse,
    })
    applyCanonicalGalleryMedia(reordered.media)
    const removeResult = await dashboardApi(`/api/editor/organizations/${props.organizationId}/media/placements/remove`, {
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
