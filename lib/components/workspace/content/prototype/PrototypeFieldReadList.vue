<template>
  <div class="space-y-3 lg:divide-y lg:divide-default lg:space-y-0 lg:border-y lg:border-default">
    <div v-for="field in fields" :key="field.key" class="lg:py-6">
      <button
        v-if="field.kind !== 'readonly'"
        type="button"
        class="w-full rounded-[1.25rem] bg-white p-5 text-left shadow-[0_4px_20px_rgba(15,23,42,0.07)] transition hover:shadow-[0_6px_24px_rgba(15,23,42,0.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:hover:shadow-none dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10 lg:dark:bg-transparent lg:dark:ring-0"
        @click="emit('edit', field)"
      >
        <span class="block text-sm font-semibold text-highlighted lg:text-muted">{{ field.label }}</span>
        <span class="mt-2 line-clamp-4 block text-lg leading-7 text-toned lg:text-highlighted">{{ field.value || 'Not set' }}</span>
      </button>

      <div v-else class="rounded-[1.25rem] bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.07)] lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10 lg:dark:bg-transparent lg:dark:ring-0">
        <p class="text-sm font-semibold text-highlighted lg:text-muted">{{ field.label }}</p>
        <p class="mt-2 text-lg leading-7 text-toned lg:text-highlighted">{{ field.value || 'Not set' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PrototypeEditorField } from './prototype-model'

defineProps<{
  fields: readonly PrototypeEditorField[]
}>()

const emit = defineEmits<{
  edit: [field: PrototypeEditorField]
}>()
</script>
