<template>
  <div
    v-if="showSwitcher"
    class="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-[#11152d] p-1.5 text-white shadow-2xl lg:bottom-6"
    role="group"
    aria-label="CMS visual prototype variation"
  >
    <button
      type="button"
      class="grid size-9 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      aria-label="Previous prototype variation"
      @click="cycle(-1)"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" />
    </button>
    <div class="min-w-44 px-3 text-center">
      <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Throwaway prototype</p>
      <p class="mt-0.5 text-sm font-semibold">{{ current.key }} · {{ current.name }}</p>
    </div>
    <button
      type="button"
      class="grid size-9 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      aria-label="Next prototype variation"
      @click="cycle(1)"
    >
      <UIcon name="i-lucide-arrow-right" class="size-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { PrototypeVariant, PrototypeVariantKey } from './prototype-model'

const props = defineProps<{
  variants: readonly PrototypeVariant[]
  currentKey: PrototypeVariantKey
}>()

const emit = defineEmits<{
  select: [key: PrototypeVariantKey]
}>()

const showSwitcher = import.meta.dev || import.meta.env.VITE_KC_CMS_VISUAL_PROTOTYPE === '1'
const current = computed(() => props.variants.find(variant => variant.key === props.currentKey) ?? props.variants[0] ?? { key: 'A', name: 'Focused fields' })

function cycle(direction: -1 | 1) {
  const currentIndex = props.variants.findIndex(variant => variant.key === props.currentKey)
  const startIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (startIndex + direction + props.variants.length) % props.variants.length
  const next = props.variants[nextIndex]
  if (next) emit('select', next.key)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) return
  event.preventDefault()
  cycle(event.key === 'ArrowLeft' ? -1 : 1)
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>
