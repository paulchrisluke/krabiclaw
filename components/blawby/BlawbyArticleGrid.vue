<template>
  <div class="grid auto-rows-fr grid-cols-1 lg:grid-cols-3" :class="compact ? 'gap-4' : 'gap-8'">
    <article
      v-for="post in posts"
      :key="post.id"
      class="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
    >
      <img v-if="post.featured_image" :src="post.featured_image.public_url" :alt="post.title" loading="lazy" class="absolute inset-0 -z-20 size-full object-cover">
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
      <div class="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />
      <div class="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
        <time v-if="post.published_at" :datetime="post.published_at" class="mr-8">{{ formatDate(post.published_at) }}</time>
        <div v-if="post.author_name" class="-ml-4 flex items-center gap-x-4">
          <svg viewBox="0 0 2 2" class="-ml-0.5 size-0.5 flex-none fill-white/50" aria-hidden="true"><circle cx="1" cy="1" r="1" /></svg>
          <span class="flex items-center gap-x-2.5">
            <img v-if="post.author_image" :src="post.author_image" :alt="post.author_name" width="24" height="24" class="size-6 flex-none rounded-full bg-white/10 object-cover">
            {{ post.author_name }}
          </span>
        </div>
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
import type { PublicBlogSummary } from '~/types/blawby'

withDefaults(defineProps<{ posts: PublicBlogSummary[], compact?: boolean }>(), { compact: false })

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value))
}
</script>
