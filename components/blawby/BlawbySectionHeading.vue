<template>
  <div :class="centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'">
    <p v-if="eyebrow" class="mb-3 text-sm font-semibold uppercase text-[var(--blawby-accent-strong)]">{{ eyebrow }}</p>
    <component :is="tag" class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">
      {{ title }}{{ accent ? ' ' : '' }}<span v-if="accent" class="text-[var(--blawby-accent)]">{{ accent }}</span>
    </component>
    <p v-if="description" class="mt-4 text-lg leading-8 text-[var(--blawby-primary)]">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  accent?: string | null
  description?: string | null
  eyebrow?: string | null
  centered?: boolean
  tag?: 'h1' | 'h2' | 'h3'
}>(), {
  accent: null,
  description: null,
  eyebrow: null,
  centered: false,
  tag: 'h2',
})
</script>
