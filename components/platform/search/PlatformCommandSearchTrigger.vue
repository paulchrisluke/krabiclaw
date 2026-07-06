<template>
  <button
    type="button"
    :class="[
      'group flex w-full items-center gap-3 rounded-xl border border-default bg-default/80 px-3 py-2.5 text-left transition hover:border-muted hover:bg-elevated',
      compact ? 'justify-center px-2.5' : '',
    ]"
    :aria-label="ariaLabel"
    @click="open"
  >
    <PlatformSearchGlyph name="search" class="size-4 shrink-0 text-muted transition group-hover:text-default" />
    <template v-if="!compact">
      <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ label }}</span>
      <span class="hidden shrink-0 items-center gap-1 text-[11px] text-dimmed md:flex">
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 font-medium">⌘</kbd>
        <kbd class="rounded border border-default bg-default px-1.5 py-0.5 font-medium">K</kbd>
      </span>
    </template>
  </button>
</template>

<script setup lang="ts">
import PlatformSearchGlyph from '~/components/platform/search/PlatformSearchGlyph.vue'
import type { PlatformSearchPaletteSurface } from '~/composables/usePlatformSearchPalette'

const props = withDefaults(defineProps<{
  surface: PlatformSearchPaletteSurface
  compact?: boolean
  label?: string
  ariaLabel?: string
}>(), {
  compact: false,
  label: 'Search',
  ariaLabel: 'Open search',
})

const { open } = usePlatformSearchPalette(props.surface)
</script>
