<template>
  <div class="group block overflow-hidden bg-elevated text-default" :class="cardClass">
    <div :class="['overflow-hidden bg-muted flex items-center justify-center', mediaClass]">
      <UIcon :name="icon" class="size-8 text-muted" />
    </div>
    <div :class="textClass">
      <p class="saya-display saya-italic text-base text-muted leading-snug">{{ item.title }}</p>
      <p v-if="item.subtitle" class="mt-1 text-xs text-muted">{{ item.subtitle }}</p>
      <p v-if="item.meta" class="mt-0.5 text-xs tabular-nums text-muted">{{ item.meta }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SayaEmptyExampleItem } from '~/config/saya-empty-states'

const props = withDefaults(defineProps<{
  item: SayaEmptyExampleItem
  icon?: string
  aspect?: 'square' | 'video' | '4/5'
  dashed?: boolean
}>(), {
  icon: 'i-heroicons-sparkles',
  aspect: 'square',
  dashed: false
})

const cardClass = computed(() => props.dashed ? 'border border-dashed border-default' : '')
const mediaClass = computed(() => ({
  square: 'aspect-square',
  video: 'aspect-video',
  '4/5': 'aspect-4/5'
})[props.aspect])
const textClass = computed(() => props.aspect === 'video' ? 'p-8 pb-9' : 'p-3 pt-2')
</script>
