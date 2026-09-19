<template>
  <div
    class="grid grid-cols-1 lg:grid-cols-3"
    :class="compact ? 'gap-4 md:grid-cols-2' : 'auto-rows-fr gap-8'"
  >
    <article
      v-for="post in posts"
      :key="post.id"
      class="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
    >
      <img v-if="coverImage(post)" :src="coverImage(post) ?? undefined" :alt="post.cover?.alt_text ?? post.title" loading="lazy" class="absolute inset-0 -z-20 size-full object-cover">
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
      <div class="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />
      <div class="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
        <time v-if="post.published_at" :datetime="post.published_at" class="mr-8">{{ formatDate(post.published_at) }}</time>
      </div>
      <h3 class="mt-3 text-lg font-semibold leading-6 text-white">
        <NuxtLink :to="post.canonical_url" class="text-white no-underline focus-visible:outline-none">
          <span class="absolute inset-0" />
          {{ post.title }}
        </NuxtLink>
      </h3>
    </article>
  </div>
</template>

<script setup lang="ts">
// A video cover renders its thumbnail; the grid is image-only.
function coverImage(post: { cover?: { kind?: string | null; public_url?: string | null; thumbnail_url?: string | null } | null }) {
  const cover = post.cover
  if (!cover) return null
  return mediaStillUrl(cover)
}
import type { PublicBlogSummary } from '~/types/blawby'
import { mediaStillUrl } from '~/shared/media-placement-contract'

withDefaults(defineProps<{ posts: PublicBlogSummary[], compact?: boolean }>(), { compact: false })
const { formatDate } = useLocaleDate()
</script>
