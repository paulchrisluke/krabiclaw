<template>
  <MediaPicker
    :site-id="siteId"
    :location-id="locationId"
    :model-value="modelValue"
    :accept="accept"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
    @change="emit('change', $event)"
  >
    <!--
      The picture leads: it is the thing the item is recognised by, so it is
      shown at the size it will be seen at rather than as a filename in a row.
    -->
    <div class="group relative overflow-hidden rounded-xl" :data-testid="testid">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        :alt="previewAlt"
        class="aspect-[4/3] w-full bg-elevated object-cover"
      >
      <div
        v-else
        class="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-default bg-elevated text-center"
      >
        <div>
          <UIcon name="i-lucide-images" class="mx-auto size-8 text-muted" />
          <p class="mt-2 text-sm font-medium text-highlighted">{{ emptyLabel }}</p>
          <p class="mt-1 text-xs text-muted">Browse your media library</p>
        </div>
      </div>
      <span
        v-if="previewUrl"
        class="absolute bottom-3 right-3 rounded-full bg-default/90 px-3 py-1.5 text-xs font-medium text-highlighted shadow-sm"
      >Change</span>
    </div>
  </MediaPicker>

  <UButton
    v-if="previewUrl"
    label="Remove photo"
    color="neutral"
    variant="ghost"
    size="xs"
    class="mt-2"
    :data-testid="testid ? `${testid}-remove` : undefined"
    @click="clear"
  />
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'

export interface CoverPhotoAsset {
  asset_id: string
  public_url: string | null
  thumbnail_url: string | null
  kind?: string | null
  alt_text?: string
}

withDefaults(defineProps<{
  siteId: string
  modelValue: string | null
  /** Rendered large, so this is the full asset URL rather than a thumbnail. */
  previewUrl?: string | null
  previewAlt?: string
  locationId?: string | null
  accept?: 'image' | 'video' | 'any'
  title?: string
  emptyLabel?: string
  testid?: string
}>(), {
  previewUrl: null,
  previewAlt: '',
  locationId: null,
  accept: 'image',
  title: 'Select a photo',
  emptyLabel: 'Add a photo',
  testid: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [assetId: string | null]
  change: [asset: CoverPhotoAsset | null]
}>()

function clear() {
  emit('update:modelValue', null)
  emit('change', null)
}
</script>
