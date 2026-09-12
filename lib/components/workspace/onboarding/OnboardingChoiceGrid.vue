<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      :aria-pressed="choice.value === modelValue"
      class="flex flex-col gap-6 rounded-xl border-2 p-5 text-left transition-colors"
      :class="choice.value === modelValue
        ? 'border-inverted bg-elevated'
        : 'border-default hover:border-accented'"
      @click="emit('update:modelValue', choice.value)"
    >
      <UIcon :name="choice.icon" class="size-7 text-highlighted" />
      <span class="text-base font-medium text-highlighted">{{ choice.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * A grid of equal cards: an icon above a label, nothing else. For a choice
 * whose options need no explaining — a property type, a business type.
 * Selection is a ring, not a fill, so the cards read the same whether one is
 * chosen or not.
 */
export interface OnboardingChoice {
  value: string
  label: string
  icon: string
}

defineProps<{ choices: OnboardingChoice[]; modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
