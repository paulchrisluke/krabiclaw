<template>
  <div class="relative z-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
    <NuxtLink
      v-for="offering in offerings"
      :key="offering.id"
      :to="offering.canonical_path"
      class="relative h-full rounded-2xl bg-gray-100 p-6 no-underline shadow-xl shadow-slate-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)] focus-visible:ring-offset-4"
    >
      <div class="w-18 rounded-lg">
        <img
          v-if="offering.thumbnail_url"
          :src="offering.thumbnail_url"
          :alt="offering.name"
          width="72"
          height="72"
          loading="lazy"
          class="h-18 w-18 object-cover"
        >
      </div>
      <span class="mt-6 inline-block rounded bg-[var(--blawby-primary)] px-2 text-sm font-semibold uppercase text-white">
        {{ offering.label || offering.name }}
      </span>
      <h3 class="mt-2 blawby-display text-xl font-bold text-[var(--blawby-primary)]">
        {{ offering.summary || offering.name }}
      </h3>
      <p v-if="offering.short_description" class="mt-4 text-sm leading-6 text-[var(--blawby-primary)]">
        {{ offering.short_description }}
      </p>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { PublicOfferingSummary } from '~/types/blawby'

defineProps<{ offerings: PublicOfferingSummary[] }>()
</script>
