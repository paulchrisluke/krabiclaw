<template>
  <div class="mx-auto w-full max-w-sm lg:max-w-[22rem]">
    <button
      type="button"
      class="w-full rounded-[1.25rem] border-2 p-6 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="selectedId === 'details'
        ? 'border-primary bg-white shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:bg-white/[0.06]'
        : 'border-transparent bg-white shadow-[0_4px_20px_rgba(15,23,42,0.07)] hover:shadow-[0_6px_24px_rgba(15,23,42,0.11)] dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10'"
      @click="emit('select', 'details')"
    >
      <span class="block text-base font-semibold text-highlighted">Page details</span>
      <span class="mt-3 block truncate text-xl font-semibold leading-tight text-toned">{{ page.title }}</span>
      <span class="mt-2 block truncate text-sm text-muted">{{ page.path }} · {{ page.locale.toUpperCase() }}</span>
    </button>

    <div class="mt-4 space-y-4">
      <PrototypeSectionPreviewCard
        v-for="section in page.sections"
        :key="section.id"
        :section="section"
        :selected="selectedId === section.id"
        @select="emit('select', section.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import PrototypeSectionPreviewCard from './PrototypeSectionPreviewCard.vue'
import type { PrototypePageView } from './prototype-model'

defineProps<{
  page: PrototypePageView
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>
