<template>
  <div v-if="field.kind === 'readonly'" class="border-b border-default py-6">
    <p class="text-sm font-semibold text-muted">{{ field.label }}</p>
    <p class="mt-2 text-lg text-highlighted">{{ displayValue }}</p>
  </div>

  <label v-else class="block border-b border-default py-6 transition-colors focus-within:border-primary">
    <span class="block text-sm font-semibold text-muted">{{ field.label }}</span>
    <textarea
      v-if="field.kind === 'textarea'"
      :value="field.value"
      rows="7"
      class="mt-3 w-full resize-none border-0 bg-transparent p-0 text-lg leading-8 text-highlighted outline-none"
      @input="onInput"
    />
    <input
      v-else
      :value="field.value"
      type="text"
      class="mt-3 h-10 w-full border-0 bg-transparent p-0 text-xl text-highlighted outline-none"
      @input="onInput"
    >
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PrototypeEditorField } from './prototype-model'

const props = defineProps<{
  field: PrototypeEditorField
}>()

const emit = defineEmits<{
  input: [key: string, value: string]
}>()

const displayValue = computed(() => props.field.value || 'Not set')

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
  emit('input', props.field.key, target.value)
}
</script>
