<template>
  <div class="grid gap-3">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      :aria-pressed="choice.value === modelValue"
      class="flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-colors"
      :class="choice.value === modelValue
        ? 'border-inverted bg-elevated'
        : 'border-default hover:border-accented'"
      @click="emit('update:modelValue', choice.value)"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-base font-medium text-highlighted">{{ choice.label }}</span>
        <span v-if="choice.description" class="mt-1 block text-sm text-muted">{{ choice.description }}</span>
      </span>
      <UIcon :name="choice.icon" class="mt-0.5 size-6 shrink-0 text-highlighted" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Full-width rows: a label, a line saying what it means, and an icon on the
 * right. For a choice the owner has to weigh rather than recognise.
 */
export interface OnboardingChoiceRow {
  value: string
  label: string
  description?: string
  icon: string
}

defineProps<{ choices: OnboardingChoiceRow[]; modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
