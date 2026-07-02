<template>
  <img
    :src="cfImageVariant(props.src, { width: props.displayWidth }) ?? undefined"
    :srcset="cfImageSrcset(props.src, props.widths) ?? undefined"
    :sizes="props.sizes"
    :alt="props.alt"
    :loading="props.loading"
  >
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
  sizes?: string
  widths?: number[]
  displayWidth?: number
}>(), {
  src: null,
  alt: '',
  loading: 'lazy',
  sizes: undefined,
  widths: () => [400, 800, 1200],
  displayWidth: 800,
})
</script>
