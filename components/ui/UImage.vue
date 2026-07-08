<template>
  <img
    v-if="!hasError"
    :src="cfImageVariant(props.src, { width: props.displayWidth }) ?? undefined"
    :srcset="cfImageSrcset(props.src, props.widths) ?? undefined"
    :sizes="props.sizes"
    :alt="props.alt"
    :loading="props.loading"
    :fetchpriority="props.fetchpriority"
    :width="props.width"
    :height="props.height"
    decoding="async"
    :class="{ 'animate-pulse bg-elevated': !isLoaded }"
    @load="isLoaded = true"
    @error="hasError = true"
  >
  <div
    v-else
    class="flex items-center justify-center bg-elevated text-muted"
    role="img"
    :aria-label="props.alt"
  >
    <UIcon name="i-lucide-image-off" class="size-1/4 min-size-4" />
  </div>
</template>

<script setup lang="ts">
// A real `<UImage>` component — it was referenced across 13+ files
// (SayaLocationsGrid, SayaBrandStory, MenuItemCard, media pickers, etc.) as if
// it existed, but no such component was ever defined anywhere in this
// codebase or in @nuxt/ui (which has no Image component). Every one of those
// call sites was silently rendering an unresolved custom element — no image,
// no error, just a blank box. This makes `<UImage>` real, backed by the same
// cfImageVariant/cfImageSrcset flexible-variant transform already proven in
// SayaHomeHero.vue, so every existing call site is fixed without editing them.
import { cfImageSrcset, cfImageVariant } from '~/utils/cf-image'

const props = withDefaults(defineProps<{
  src?: string | null
  alt?: string
  loading?: 'lazy' | 'eager'
  fetchpriority?: 'high' | 'low' | 'auto'
  sizes?: string
  widths?: number[]
  displayWidth?: number
  /** Intrinsic width/height attrs — reserve layout space to prevent CLS. Display size is still controlled by CSS. */
  width?: number
  height?: number
}>(), {
  src: null,
  alt: '',
  loading: 'lazy',
  fetchpriority: undefined,
  sizes: undefined,
  widths: () => [400, 800, 1200],
  displayWidth: 800,
  width: undefined,
  height: undefined,
})

// Pulses a themed skeleton background until the image paints; swaps to a
// broken-image glyph on load failure instead of a native broken-img icon.
const isLoaded = ref(false)
const hasError = ref(false)

watch(() => props.src, () => {
  isLoaded.value = false
  hasError.value = false
})
</script>
