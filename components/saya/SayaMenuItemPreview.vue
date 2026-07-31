<template>
  <div
    v-if="previewUrl"
    class="relative shrink-0 overflow-hidden rounded-xl bg-muted"
    :class="disabled ? 'opacity-50 grayscale' : ''"
  >
    <video
      v-if="isVideo && item.public_url"
      :src="item.public_url"
      :poster="item.thumbnail_url || undefined"
      class="size-24 object-cover"
      muted
      playsinline
      preload="metadata"
    />
    <img
      v-else
      :src="previewUrl"
      :alt="item.name"
      class="size-24 object-cover"
      loading="lazy"
    />
    <span
      v-if="isVideo && item.public_url"
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white"
      aria-hidden="true"
    >
      <span class="flex size-8 items-center justify-center rounded-full bg-black/50">
        <SayaIcon name="play" class="ml-0.5 size-3.5" />
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
type PreviewItem = {
  name: string
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
}

const props = withDefaults(defineProps<{
  item: PreviewItem
  disabled?: boolean
}>(), {
  disabled: false,
})

const isVideo = computed(() => props.item.kind === 'video')
const previewUrl = computed(() => {
  if (isVideo.value) return props.item.thumbnail_url || props.item.public_url || null
  return props.item.public_url || null
})
</script>
