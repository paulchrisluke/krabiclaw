<template>
  <section class="relative bg-white pb-14 pt-14 sm:pb-20 sm:pt-14 lg:pb-14" :data-parity-section="paritySection">
    <div class="blawby-container relative z-20">
      <BlawbySectionHeading
        :title="title"
        :accent="accent"
        :description="description"
        centered
      />
      <BlawbyPageGrid :items="items" class="mt-20" />
    </div>
    <img v-if="decorationUrl" :src="decorationUrl" alt="" width="1920" height="400" loading="lazy" class="absolute bottom-0 w-full object-contain object-center">
  </section>
</template>

<script setup lang="ts">
/** The pages this section shows, resolved by the page's own page_grid block. */
interface PageGridItem { id: string; title: string; description?: string; url: string; media?: Array<{ slot: string; public_url: string }> }

withDefaults(defineProps<{
  items: PageGridItem[]
  title: string
  accent: string
  description?: string
  decorationUrl?: string | null
  paritySection?: string
}>(), {
  description: '',
  decorationUrl: null,
  paritySection: 'services',
})
</script>
