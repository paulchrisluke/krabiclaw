<template>
  <button
    type="button"
    class="w-full overflow-hidden rounded-[1.25rem] border-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="selected
      ? 'border-primary bg-white shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:bg-white/[0.06]'
      : 'border-transparent bg-white shadow-[0_4px_20px_rgba(15,23,42,0.07)] hover:shadow-[0_6px_24px_rgba(15,23,42,0.11)] dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10'"
    @click="emit('select')"
  >
    <span v-if="section.type === 'hero'" class="relative block min-h-40 overflow-hidden">
      <img v-if="section.mediaUrl" :src="section.mediaUrl" :alt="section.mediaAlt" class="absolute inset-0 size-full object-cover" />
      <span v-if="section.mediaUrl" class="absolute inset-0 bg-black/55" />
      <span class="relative flex min-h-40 flex-col justify-end p-6" :class="section.mediaUrl ? 'text-white' : 'text-highlighted'">
        <span class="text-[10px] font-bold uppercase tracking-[0.16em]" :class="section.mediaUrl ? 'text-white/65' : 'text-muted'">Hero</span>
        <span class="mt-3 font-display text-2xl font-bold leading-tight">{{ section.summary }}</span>
        <span v-if="section.body && section.body !== section.summary" class="mt-2 line-clamp-2 text-sm leading-5" :class="section.mediaUrl ? 'text-white/75' : 'text-muted'">{{ section.body }}</span>
      </span>
    </span>

    <span v-else-if="isCallToAction" class="block p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ section.label }}</span>
      <span class="mt-5 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">
        {{ section.summary }}
      </span>
    </span>

    <span v-else-if="isMedia" class="block">
      <img v-if="section.mediaUrl" :src="section.mediaUrl" :alt="section.mediaAlt" class="aspect-[16/9] w-full object-cover" />
      <span v-else class="grid aspect-[16/9] w-full place-items-center bg-muted text-sm text-muted">No image selected</span>
      <span class="flex items-center justify-between gap-4 px-4 py-3">
        <span class="text-sm font-semibold text-highlighted">{{ section.label }}</span>
        <span v-if="section.type === 'gallery'" class="text-xs text-muted">Gallery</span>
      </span>
    </span>

    <span v-else-if="isRichText" class="block p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ section.label }}</span>
      <span v-if="section.type === 'heading'" class="mt-4 block font-display text-2xl font-bold leading-tight text-highlighted">{{ section.summary }}</span>
      <span v-else class="mt-4 line-clamp-4 block text-sm leading-6 text-toned">{{ section.body || section.summary }}</span>
    </span>

    <span v-else-if="isGrid" class="block p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ section.label }}</span>
      <span class="mt-4 grid grid-cols-2 gap-2">
        <span v-for="position in 4" :key="position" class="h-12 rounded-lg border border-default bg-transparent" />
      </span>
      <span class="mt-3 block truncate text-sm font-medium text-highlighted">{{ section.summary }}</span>
    </span>

    <span v-else-if="section.type === 'divider'" class="block px-5 py-8">
      <span class="mb-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Divider</span>
      <span class="block border-t border-accented" />
    </span>

    <span v-else class="block p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ section.label }}</span>
      <span class="mt-4 block font-display text-xl font-semibold leading-tight text-highlighted">{{ section.summary }}</span>
      <span v-if="section.body" class="mt-2 line-clamp-3 block text-sm leading-6 text-muted">{{ section.body }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PrototypeSection } from './prototype-model'

const props = defineProps<{
  section: PrototypeSection
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const isCallToAction = computed(() => ['cta', 'contact_cta', 'booking_cta', 'donation_choices', 'button_group'].includes(props.section.type))
const isMedia = computed(() => ['image', 'gallery'].includes(props.section.type))
const isRichText = computed(() => ['markdown', 'heading', 'callout', 'faq', 'testimonial_grid'].includes(props.section.type))
const isGrid = computed(() => ['feature_grid', 'offering_grid', 'location_grid'].includes(props.section.type))
</script>
