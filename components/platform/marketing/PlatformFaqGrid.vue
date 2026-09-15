<template>
  <div v-if="items.length" class="max-w-4xl mx-auto" :class="spacing" data-parity-section="faq">
    <h2 class="text-3xl font-extrabold text-default text-center mb-12">{{ title }}</h2>
    <div class="grid sm:grid-cols-2 gap-6">
      <div v-for="item in items" :key="item.question" class="bg-elevated/40 border border-default p-6 rounded-2xl flex flex-col gap-2">
        <h4 class="text-base font-bold text-default m-0 flex items-center gap-2">
          <PlatformIcon name="question-circle" class="size-5 text-primary shrink-0" />
          {{ item.question }}
        </h4>
        <p class="text-[13.5px] leading-relaxed text-muted m-0">{{ item.answer }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Questions as a two-column grid of cards — the FAQ shape on the vertical pages
 * and on Features. Features places it after a band with `mt-20`; the vertical
 * pages space it with `mb-24` like the rest of their sections.
 */
withDefaults(defineProps<{
  title: string
  items: Array<{ question: string; answer: string }>
  spacing?: string
}>(), {
  spacing: 'mb-24',
})
</script>
