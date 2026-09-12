<template>
  <section v-if="features.length" class="relative bg-[var(--blawby-accent-200)] pb-16 pt-4 sm:pb-16 sm:pt-4 lg:pb-16" data-parity-section="features">
    <div class="blawby-container">
      <div class="relative z-20 mt-4 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="feature in features" :key="feature.title" class="relative h-full rounded-2xl bg-white p-6 shadow-xl shadow-slate-900/10">
          <div v-if="feature.media[0]?.public_url" class="size-16 rounded-lg">
            <img :src="feature.media[0].public_url!" :alt="feature.title" width="64" height="64" loading="lazy" class="size-16 rounded object-cover">
          </div>
          <h3 class="mt-4 blawby-display text-xl font-bold uppercase text-[var(--blawby-primary)]">{{ feature.title }}</h3>
          <p v-if="feature.description" class="mt-4 text-sm text-[var(--blawby-primary)]">{{ feature.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// The cards a Blawby page shows for a feature_grid: what the firm does, on the
// About page and on each practice area. One markup, because it is one thing —
// the practice-area version was deleted with the offering model and its
// features went unrendered until this replaced it.
defineProps<{
  features: Array<{
    title: string
    description: string
    media: Array<{ public_url?: string | null }>
  }>
}>()
</script>
