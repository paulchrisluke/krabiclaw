<template>
  <nav aria-label="Blog posts by category" class="text-sm" data-blog-category-nav>
    <div v-for="group in categories" :key="group.categorySlug" class="mb-5 last:mb-0">
      <p class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{{ group.category }}</p>
      <NuxtLink
        v-for="post in group.posts"
        :key="post.id"
        :to="`${basePath}/${post.slug}`"
        class="group relative block max-w-full rounded px-2.5 py-1.5 no-underline"
        :class="post.slug === activeSlug ? 'font-semibold text-gray-900 bg-gray-100' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'"
        data-blog-nav-link
      >
        <span class="max-w-full break-words line-clamp-2 leading-snug" data-blog-nav-title>{{ post.title }}</span>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-2.5 top-full z-10 mt-1 hidden max-w-72 rounded bg-gray-900 px-2 py-1 text-xs font-normal leading-snug text-white shadow-lg group-hover:block group-focus-visible:block"
          data-blog-nav-tooltip
        >
          {{ post.title }}
        </span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { TenantBlogNavGroup, TenantBlogNavPost } from '~/composables/useTenantBlogNav'

withDefaults(defineProps<{
  categories: TenantBlogNavGroup<TenantBlogNavPost>[]
  basePath: string
  activeSlug?: string | null
}>(), {
  activeSlug: null,
})
</script>
