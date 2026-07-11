<template>
  <section v-if="statistics.length" :class="compact ? 'mb-16' : 'bg-white py-16'" :data-parity-section="paritySection">
    <div class="blawby-container">
      <div class="mx-auto max-w-4xl">
        <div class="mb-12 text-center">
          <h2 class="blawby-display mb-6 text-3xl font-bold text-[var(--blawby-primary-dark)] sm:text-4xl">{{ title }}</h2>
          <p v-if="description" class="mb-4 text-lg leading-8 text-gray-600">{{ description }}</p>
          <p v-if="additionalDescription" class="text-lg leading-8 text-gray-600">{{ additionalDescription }}</p>
        </div>
        <div class="rounded-lg bg-[var(--blawby-primary-100)] shadow-lg sm:grid sm:grid-cols-3 sm:gap-8 sm:px-8 sm:py-8">
          <div v-for="statistic in statistics" :key="statistic.label" class="p-6 text-center sm:p-8">
            <p class="text-5xl font-bold text-[var(--blawby-primary-dark)]">{{ statistic.value }}</p>
            <p class="mt-2 text-sm font-medium text-gray-600">{{ statistic.label }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string | null
  additionalDescription?: string | null
  statistics: Array<{ value: string; label: string }>
  paritySection?: string | null
  compact?: boolean
}>(), {
  paritySection: 'impact',
  compact: false,
})
</script>
