<template>
  <section v-if="items.length" id="faq" class="relative overflow-hidden bg-[var(--blawby-accent-200)] py-20 sm:py-32" data-parity-section="qa">
    <div class="blawby-container relative z-20">
      <BlawbySectionHeading :title="heading" accent="questions" />
      <ul class="mx-auto mb-auto mt-16 grid max-w-2xl grid-cols-1 content-start gap-8 lg:max-w-none lg:grid-cols-3" role="list">
        <li v-for="(column, columnIndex) in columns" :key="columnIndex">
          <ul class="flex flex-col gap-y-8" role="list">
            <li v-for="item in column" :key="item.id">
              <article class="rounded-2xl bg-white p-6 shadow-xl shadow-slate-900/10">
                <h3 class="blawby-display text-lg font-bold leading-7 text-[var(--blawby-primary)]">{{ item.question }}</h3>
                <BlawbyRichText
                  :content="item.answer"
                  unstyled
                  class="blawby-faq-answer prose prose-sm mt-4 max-w-none border-l-2 border-[var(--blawby-accent)] pl-6 text-sm text-[var(--blawby-primary)] prose-p:my-1 prose-ul:my-1 prose-li:my-0"
                />
              </article>
            </li>
          </ul>
        </li>
      </ul>
    </div>
    <img v-if="decorationUrl" :src="decorationUrl" alt="" width="800" height="800" loading="lazy" class="absolute right-0 top-0 z-10 w-2/6 object-contain object-center">
  </section>
</template>

<script setup lang="ts">
import type { PublicSiteQa } from '~/types/blawby'

const props = withDefaults(defineProps<{
  items: PublicSiteQa[]
  heading?: string
  decorationUrl?: string | null
}>(), {
  heading: 'Frequently asked',
  decorationUrl: null,
})

const columns = computed(() => {
  const size = Math.ceil(props.items.length / 3)
  return Array.from({ length: 3 }, (_, index) => props.items.slice(index * size, (index + 1) * size))
})
</script>

<style>
.blawby-faq-answer p,
.blawby-faq-answer li {
  color: var(--blawby-primary) !important;
  font-size: 0.875rem !important;
  line-height: 1.5rem !important;
}

.blawby-faq-answer p,
.blawby-faq-answer ul {
  margin-block: 0.25rem !important;
}

.blawby-faq-answer li {
  margin-block: 0 !important;
}
</style>
