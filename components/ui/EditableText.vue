<script setup lang="ts">
const props = defineProps<{
  fieldKey: string
  modelValue: string
  tag?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

import { useEditMode } from '@/composables/useEditMode'
import DOMPurify from 'dompurify'

const { editMode, queueChange } = useEditMode()

const sanitizedValue = computed(() => DOMPurify.sanitize(props.modelValue))

const updateValue = (event: Event) => {
  const value = (event.target as HTMLElement).innerText

  emit('update:modelValue', value)
  queueChange(props.fieldKey, value)
}
</script>

<template>
  <component
    :is="tag || 'span'"
    v-if="editMode"
    contenteditable="true"
    class="outline outline-blue-500/30 hover:outline-blue-500 rounded px-1 cursor-text transition-all bg-blue-500/5 focus:bg-white focus:outline-blue-600 focus:shadow-lg focus:ring-4 focus:ring-blue-500/10"
    @blur="updateValue"
    v-html="sanitizedValue"
  />

  <component :is="tag || 'span'" v-else>
    <slot>{{ modelValue }}</slot>
  </component>
</template>
