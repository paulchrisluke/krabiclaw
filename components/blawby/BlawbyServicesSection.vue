<template>
  <section class="relative bg-white pb-14 pt-14 sm:pb-20 sm:pt-14 lg:pb-14" :data-parity-section="paritySection">
    <div class="relative z-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <BlawbySectionHeading
        :title="title"
        :accent="accent"
        :description="description"
        centered
      />
      <BlawbyServiceGrid :offerings="offerings" class="mt-20" />
    </div>
    <img v-if="decorationUrl" :src="decorationUrl" alt="" width="1920" height="400" loading="lazy" class="absolute bottom-0 w-full object-contain object-center">
  </section>
</template>

<script setup lang="ts">
import type { PublicOfferingSummary } from '~/types/blawby'

withDefaults(defineProps<{
  offerings: PublicOfferingSummary[]
  title?: string
  accent?: string
  description?: string
  decorationUrl?: string | null
  paritySection?: string
}>(), {
  title: 'Our',
  accent: 'Services',
  description: '',
  decorationUrl: null,
  paritySection: 'services',
})
</script>
