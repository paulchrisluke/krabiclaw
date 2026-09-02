<template>
  <div>
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-muted">Page content</p>
        <h2 class="mt-1 truncate text-xl font-bold tracking-tight text-highlighted">{{ page.title }}</h2>
      </div>
      <span class="mt-1 shrink-0 text-xs font-medium" :class="dirty ? 'text-warning' : 'text-success'">
        {{ dirty ? 'Unsaved' : 'Saved' }}
      </span>
    </div>

    <button
      type="button"
      class="mt-6 w-full rounded-2xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="selectedId === 'details'
        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
        : 'border-default/70 bg-transparent hover:border-accented'"
      @click="emit('select', 'details')"
    >
      <span class="block text-xs font-semibold text-muted">Page details</span>
      <span class="mt-3 block truncate text-lg font-semibold text-highlighted">{{ page.title }}</span>
      <span class="mt-1 block truncate text-sm text-muted">{{ page.path }} · {{ page.locale.toUpperCase() }}</span>
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
  dirty: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>
