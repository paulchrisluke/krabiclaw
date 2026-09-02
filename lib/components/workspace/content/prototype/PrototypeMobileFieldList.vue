<template>
  <dl class="divide-y divide-default border-y border-default">
    <div v-for="field in fields" :key="field.key" class="py-5">
      <button
        v-if="field.kind !== 'readonly'"
        type="button"
        class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        @click="emit('edit', field)"
      >
        <span class="min-w-0">
          <span class="block text-sm font-semibold text-muted">{{ field.label }}</span>
          <span class="mt-2 line-clamp-3 block text-base leading-6 text-highlighted">{{ field.value || 'Not set' }}</span>
        </span>
        <span class="pt-1 text-sm font-semibold text-primary">Edit</span>
      </button>

      <div v-else>
        <dt class="text-sm font-semibold text-muted">{{ field.label }}</dt>
        <dd class="mt-2 text-base leading-6 text-highlighted">{{ field.value || 'Not set' }}</dd>
      </div>
    </div>
  </dl>
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
