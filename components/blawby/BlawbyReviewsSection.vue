<template>
  <section v-if="reviews.length" class="bg-muted py-20 sm:py-32" data-parity-section="reviews">
    <div class="blawby-container">
      <div class="mx-auto max-w-2xl md:text-center">
        <h2 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">
          What Clients <span class="text-[var(--blawby-accent)]">Say</span>
        </h2>
        <p v-if="description" class="mt-4 text-lg text-toned">{{ description }}</p>
      </div>
      <ul class="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3" role="list">
        <li v-for="(column, columnIndex) in columns" :key="columnIndex">
          <ul class="flex flex-col gap-y-6 sm:gap-y-8" role="list">
            <li v-for="review in column" :key="review.id">
              <figure class="relative rounded-2xl bg-elevated p-6 shadow-xl shadow-[color:rgb(37_53_108_/_0.1)]">
                <svg class="absolute left-6 top-6 size-12 fill-(--ui-bg-muted)" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M14 10H4v14h8c0 6-2 10-7 14l4 4c8-6 11-13 11-23V10h-6Zm24 0H28v14h8c0 6-2 10-7 14l4 4c8-6 11-13 11-23V10h-6Z" />
                </svg>
                <blockquote class="relative">
                  <p class="text-lg text-[var(--blawby-primary)]">{{ review.content }}</p>
                </blockquote>
                <figcaption class="relative mt-6 flex items-center justify-between border-t border-default pt-6">
                  <div>
                    <p class="blawby-display text-base font-bold text-[var(--blawby-primary)]">{{ review.author_name }}</p>
                    <p v-if="review.title" class="mt-1 text-sm text-muted">{{ review.title }}</p>
                  </div>
                  <div class="overflow-hidden rounded-full bg-muted">
                    <img v-if="portrait(review)" :src="portrait(review)!.public_url" :alt="review.author_name" width="56" height="56" loading="lazy" class="size-14 object-cover">
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
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords } from '~/utils/tenant-page-block-data'
import type { PublicOrganizationReview } from '~/types/blawby'

const portrait = (review: PublicOrganizationReview) => review.media.find(asset => asset.slot === 'portrait') ?? null

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const description = computed(() => blockText(props.block.data.description) || undefined)
const reviews = computed(() => blockRecords(props.block.data.items).map(item => ({
  id: blockText(item.id),
  author_name: blockText(item.title),
  media: blockRecords(item.media).map(asset => ({
    asset_id: blockText(asset.asset_id),
    slot: blockText(asset.slot),
    public_url: blockText(asset.public_url),
    thumbnail_url: blockText(asset.thumbnail_url) || null,
    kind: blockText(asset.kind),
    alt_text: blockText(asset.alt_text) || null,
  })),
  rating: Number(item.value) || 5,
  title: null,
  content: blockText(item.description),
  original_review_date: null,
  verified: false,
  source: null,
  original_reference: null,
  google_review_metadata: null,
})).filter(item => item.id && item.author_name))

const columns = computed(() => {
  const size = Math.ceil(reviews.value.length / 3)
  return Array.from({ length: 3 }, (_, index) => reviews.value.slice(index * size, (index + 1) * size))
})
</script>
