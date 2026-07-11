<template>
  <section v-if="reviews.length" class="bg-slate-50 py-20 sm:py-32" data-parity-section="reviews">
    <div class="blawby-container">
      <BlawbySectionHeading
        title="What Clients"
        accent="Say"
        :description="description"
        centered
      />
      <ul class="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3" role="list">
        <li v-for="(column, columnIndex) in columns" :key="columnIndex">
          <ul class="flex flex-col gap-y-6 sm:gap-y-8" role="list">
            <li v-for="review in column" :key="review.id">
              <figure class="relative rounded-2xl bg-white p-6 shadow-xl shadow-[color:rgb(37_53_108_/_0.1)]">
                <svg class="absolute left-6 top-6 size-12 fill-slate-100" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M14 10H4v14h8c0 6-2 10-7 14l4 4c8-6 11-13 11-23V10h-6Zm24 0H28v14h8c0 6-2 10-7 14l4 4c8-6 11-13 11-23V10h-6Z" />
                </svg>
                <blockquote class="relative">
                  <p class="text-lg text-[var(--blawby-primary)]">{{ review.content }}</p>
                </blockquote>
                <figcaption class="relative mt-6 flex items-center justify-between border-t border-slate-100 pt-6">
                  <div>
                    <p class="blawby-display text-base font-bold text-[var(--blawby-primary)]">{{ review.author_name }}</p>
                    <p v-if="review.title" class="mt-1 text-sm text-slate-500">{{ review.title }}</p>
                  </div>
                  <div class="overflow-hidden rounded-full bg-slate-50">
                    <img v-if="review.reviewer_photo_url" :src="review.reviewer_photo_url" :alt="review.author_name" width="56" height="56" loading="lazy" class="size-14 object-cover">
                  </div>
                </figcaption>
              </figure>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicSiteReview } from '~/types/blawby'

const props = withDefaults(defineProps<{
  reviews: PublicSiteReview[]
  description?: string
}>(), {
  description: 'We believe access to quality professional help should not be limited by income.',
})

const columns = computed(() => {
  const size = Math.ceil(props.reviews.length / 3)
  return Array.from({ length: 3 }, (_, index) => props.reviews.slice(index * size, (index + 1) * size))
})
</script>
