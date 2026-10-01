<template>
  <!--
    A rule guests are held to, answered ✕ or ✓ — Airbnb's house rules
    (goal/airbnb/…/details/house-rules). The pair is the control: no checkbox,
    no box around it, a hairline under the row.
  -->
  <div class="border-b border-default py-6 last:border-b-0">
    <div class="flex items-start gap-4">
      <div :id="labelId" class="min-w-0 flex-1">
        <p class="text-base text-highlighted">{{ label }}</p>
        <p v-if="description || $slots.description" class="mt-1 text-sm text-muted">
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
      <div role="radiogroup" :aria-labelledby="labelId" class="flex shrink-0 gap-2">
        <UButton
          v-for="answer in answers"
          :key="String(answer.value)"
          role="radio"
          :aria-checked="model === answer.value"
          :aria-label="answer.label"
          :icon="answer.icon"
          color="neutral"
          :variant="model === answer.value ? 'solid' : 'outline'"
          size="md"
          square
          class="rounded-full"
          @click="model = answer.value"
        />
      </div>
    </div>
    <!-- A rule that carries a number states it underneath, once it applies. -->
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  /** One line under the label. */
  description?: string
}>()

const model = defineModel<boolean>({ required: true })
const labelId = useId()
const answers = [
  { value: false, label: 'No', icon: 'i-lucide-x' },
  { value: true, label: 'Yes', icon: 'i-lucide-check' },
] as const
</script>
