<template>
  <div class="inline-flex gap-1 bg-muted border border-default rounded-lg p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      @click="selectOption(option.value)"
      class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
      :class="isActive(option.value) ? 'bg-elevated text-default shadow-sm' : 'text-muted hover:text-default'"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface FilterOption {
  label: string
  value: string
}

const props = defineProps<{
  options: FilterOption[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function selectOption(value: string) {
  emit('update:modelValue', value)
}

function isActive(value: string) {
  return props.modelValue === value
}
</script>
