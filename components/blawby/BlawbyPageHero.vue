<template>
  <section :class="backgroundClass" class="relative overflow-hidden" data-parity-section="route-hero">
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="px-2 pb-4 pt-16 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-4xl text-center">
          <p v-if="eyebrow" class="mb-4 text-sm font-semibold uppercase text-[var(--blawby-accent-strong)]">
            {{ eyebrow }}
          </p>
          <h1 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">
            {{ title }}
          </h1>
          <p v-if="description" class="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[var(--blawby-primary)]">
            {{ description }}
          </p>
          <div v-if="$slots.default" class="mt-8">
            <slot />
          </div>
        </div>
      </div>
    </div>
  </section>
  <BlawbyShieldDivider :variant="variant" />
</template>

<script setup lang="ts">
import type { BlawbyShieldVariant } from '~/types/blawby'

const props = withDefaults(defineProps<{
  title: string
  description?: string | null
  eyebrow?: string | null
  variant: BlawbyShieldVariant
}>(), {
  description: null,
  eyebrow: null,
})

const backgroundClass = computed(() => {
  if (props.variant === 'schedule') return 'bg-[var(--blawby-primary-800)] [&_h1]:text-white [&_p]:text-gray-200'
  if (props.variant === 'about' || props.variant === 'contact') return 'bg-[var(--blawby-accent-200)]'
  return 'bg-[var(--blawby-primary-100)]'
})
</script>
