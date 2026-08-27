<template>
  <img
    v-if="!hasError"
    ref="imageEl"
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
    @load="handleLoad"
    @error="handleError"
  >
  <div
    v-else
    class="flex items-center justify-center bg-elevated text-muted"
    role="img"
    :aria-label="props.alt"
  >
    <svg viewBox="0 0 24 24" class="size-1/4 min-size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.5 10.5a1.5 1.5 0 1 0 2.12-2.12" />
      <path d="M21 15.5V6a3 3 0 0 0-3-3H8.5M3 8.5V18a3 3 0 0 0 3 3h9.5" />
      <path d="m3 16 5-5 4 4 2-2 7 7" />
    </svg>
  </div>
</template>

<script setup lang="ts">
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
const imageEl = ref<HTMLImageElement | null>(null)
const mounted = ref(false)

function handleLoad() {
  if (mounted.value) isLoaded.value = true
}

function handleError() {
  if (mounted.value) hasError.value = true
}

onMounted(() => {
  mounted.value = true
  if (imageEl.value?.complete) {
    if (imageEl.value.naturalWidth > 0) isLoaded.value = true
    else hasError.value = true
  }
})

watch(() => props.src, () => {
  isLoaded.value = false
  hasError.value = false
})
</script>
