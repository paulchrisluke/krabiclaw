<template>
  <span :class="glyphClass" aria-hidden="true">
    <UIcon :name="iconName" class="size-full" />
  </span>
</template>

<script lang="ts">
export const PLATFORM_SEARCH_GLYPHS = {
  search: 'i-lucide-search',
  book: 'i-lucide-book-open',
  newspaper: 'i-lucide-newspaper',
  'circle-help': 'i-lucide-circle-help',
  'credit-card': 'i-lucide-credit-card',
  'layout-dashboard': 'i-lucide-layout-dashboard',
  settings: 'i-lucide-settings',
  globe: 'i-lucide-globe',
  users: 'i-lucide-users',
  'chart-bar': 'i-lucide-chart-column',
  sparkles: 'i-lucide-sparkles',
  star: 'i-lucide-star',
  'layout-template': 'i-lucide-layout-template',
  'log-in': 'i-lucide-log-in',
  calendar: 'i-lucide-calendar',
  inbox: 'i-lucide-inbox',
  camera: 'i-lucide-camera',
  images: 'i-lucide-images',
  'messages-square': 'i-lucide-messages-square',
  'file-pen': 'i-lucide-file-pen',
  'file-stack': 'i-lucide-files',
  ticket: 'i-lucide-ticket',
  'utensils-crossed': 'i-lucide-utensils-crossed',
} as const

export type PlatformSearchGlyphName = keyof typeof PLATFORM_SEARCH_GLYPHS
</script>

<script setup lang="ts">

const props = withDefaults(defineProps<{
  name: PlatformSearchGlyphName
  class?: string
}>(), {
  class: 'size-4',
})

const glyphClass = computed(() => props.class)
const iconName = computed(() => PLATFORM_SEARCH_GLYPHS[props.name] ?? PLATFORM_SEARCH_GLYPHS.search)
</script>
