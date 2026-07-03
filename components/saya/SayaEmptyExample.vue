<template>
  <div class="group block overflow-hidden rounded-lg border border-default bg-elevated text-default" :class="cardClass">
    <div :class="['overflow-hidden bg-muted flex items-center justify-center', mediaClass]">
      <svg v-if="icon === 'map-pin'" viewBox="0 0 24 24" class="size-8 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g><path d="M15 10.5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0"/></g></svg>
      <svg v-else viewBox="0 0 24 24" class="size-8 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09m8.445-7.188L18 9.75l-.259-1.035a3.38 3.38 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.38 3.38 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.38 3.38 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.38 3.38 0 0 0-2.456 2.456m-1.365 11.852L16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183l.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394l-1.183.394a2.25 2.25 0 0 0-1.423 1.423"/></svg>
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
  icon?: 'sparkles' | 'map-pin'
  aspect?: 'square' | 'video' | '4/5'
  dashed?: boolean
}>(), {
  icon: 'sparkles',
  aspect: 'square',
  dashed: false
})

// Warn if an unsupported icon value is passed
if (import.meta.client && props.icon !== 'sparkles' && props.icon !== 'map-pin') {
  console.warn(`SayaEmptyExample: unsupported icon value "${props.icon}". Supported values are "sparkles" and "map-pin".`)
}

const cardClass = computed(() => props.dashed ? 'border border-dashed border-default' : '')
const mediaClass = computed(() => ({
  square: 'aspect-square',
  video: 'aspect-video',
  '4/5': 'aspect-4/5'
})[props.aspect])
const textClass = computed(() => props.aspect === 'video' ? 'p-8 pb-9' : 'p-3 pt-2')
</script>
