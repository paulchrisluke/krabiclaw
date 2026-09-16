<template>
  <details v-for="group in groups" :key="group.label" class="group/dis">
    <summary class="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 py-2.75 text-[15px] font-medium text-muted transition-colors hover:bg-muted hover:text-default [&::-webkit-details-marker]:hidden">
      {{ group.label }}
      <PlatformIcon name="chevron-down" class="ml-auto size-4 transition-transform duration-200 group-open/dis:rotate-180" />
    </summary>
    <div class="my-1 ml-3 flex flex-col gap-0.5 border-l border-default pl-3">
      <NuxtLink
        v-for="item in group.items"
        :key="item.to"
        :to="item.to"
        class="truncate rounded-lg px-3 py-2.25 text-[14px] text-dimmed no-underline transition-colors hover:bg-muted hover:text-default"
        @click="emit('navigate')"
      >
        {{ item.label }}
      </NuxtLink>
    </div>
  </details>
</template>

<script setup lang="ts">
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { PLATFORM_TEMPLATE } from '~/utils/template-registry'

/**
 * The Docs and Blog disclosures in the shared collapsed navigation. Their
 * children are the real published articles, read through the same composables
 * the docs and blog sidebars use — this component exists so the header can
 * mount them lazily on first open instead of fetching both collections on
 * every public page render.
 */
const emit = defineEmits<{ navigate: [] }>()

const { categories: docsCategories } = await useDocsArticles()
const { categories: blogCategories } = useBlogNav()

const docsItems = computed(() => [
  { label: 'Docs home', to: '/docs' },
  ...docsCategories.value.flatMap(section => section.articles.map(article => ({
    label: article.title,
    to: article.path,
  }))),
])

const blogItems = computed(() => [
  { label: 'All posts', to: '/blog' },
  ...blogCategories.value.flatMap(({ posts }) => posts.map(post => ({
    label: post.label,
    to: tenantBlogPostPath(PLATFORM_TEMPLATE, post.slug),
  }))),
])

const groups = computed(() => [
  { label: 'Docs', items: docsItems.value },
  { label: 'Blog', items: blogItems.value },
])
</script>
