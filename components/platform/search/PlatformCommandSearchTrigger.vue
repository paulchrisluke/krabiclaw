<template>
  <button
    type="button"
    :class="[
      'group flex w-full items-center gap-3 rounded-xl border py-2.5 text-left transition',
      themeClass,
      compact ? 'justify-center px-2.5' : 'px-3',
    ]"
    :aria-label="ariaLabel"
    @click="open"
  >
    <PlatformSearchGlyph name="search" :class="`size-4 shrink-0 transition ${glyphClass}`" />
    <template v-if="!compact">
      <span class="min-w-0 flex-1 truncate text-sm" :class="labelClass">{{ label }}</span>
      <span class="hidden shrink-0 items-center gap-1 text-[11px] md:flex" :class="kbdWrapClass">
        <kbd class="rounded border px-1.5 py-0.5 font-medium" :class="kbdClass">⌘</kbd>
        <kbd class="rounded border px-1.5 py-0.5 font-medium" :class="kbdClass">K</kbd>
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
  variant?: 'platform' | 'blawby' | 'saya'
}>(), {
  compact: false,
  label: 'Search',
  ariaLabel: 'Open search',
  variant: 'platform',
})

const { open } = usePlatformSearchPalette(props.surface)

const themeClass = computed(() => {
  if (props.variant === 'blawby') return 'border-[var(--blawby-border)] bg-white hover:border-[var(--blawby-primary)] hover:bg-[var(--blawby-accent-100)]'
  if (props.variant === 'saya') return 'border-default bg-default/80 hover:border-muted hover:bg-elevated'
  return 'border-default bg-default/80 hover:border-muted hover:bg-elevated'
})
const glyphClass = computed(() => props.variant === 'blawby' ? 'text-gray-500 group-hover:text-[var(--blawby-primary)]' : 'text-muted group-hover:text-default')
const labelClass = computed(() => props.variant === 'blawby' ? 'text-gray-500' : 'text-muted')
const kbdWrapClass = computed(() => props.variant === 'blawby' ? 'text-gray-400' : 'text-dimmed')
const kbdClass = computed(() => props.variant === 'blawby' ? 'border-[var(--blawby-border)] bg-white' : 'border-default bg-default')
</script>
