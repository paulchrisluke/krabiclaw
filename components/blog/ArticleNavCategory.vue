<template>
  <!--
    One category of the collection's navigation: its name links to its page,
    the chevron opens its articles and subcategories. Only the branch holding
    the page being read starts open, so the list reads as a tree and not as
    every article at once. Native <details>, so it opens without JavaScript.
  -->
  <details class="group/category" :open="open">
    <summary
      class="flex cursor-pointer list-none items-center gap-1 rounded-md py-1 pe-2.5 [&::-webkit-details-marker]:hidden"
      :class="category.depth === 1 ? 'ps-1' : 'ps-1.5'"
    >
      <PlatformIcon name="chevron-right" class="size-3.5 shrink-0 opacity-50 transition-transform group-open/category:rotate-90" />
      <NuxtLink
        :to="category.path"
        class="min-w-0 flex-1 no-underline transition"
        :class="[
          category.depth === 1 && !isDocs ? 'text-xs font-semibold uppercase tracking-wide' : 'font-semibold',
          route.path === category.path ? 'opacity-100' : 'opacity-60 hover:opacity-100',
        ]"
        @click="emit('navigate')"
      >{{ category.name }}</NuxtLink>
    </summary>
    <ul class="mb-2 ms-3 flex flex-col gap-0.5 border-s border-current/10 ps-2">
      <li v-for="article in category.posts" :key="article.id">
        <NuxtLink
          :to="article.path"
          :title="article.title"
          class="block rounded-md px-2 py-1.5 leading-snug no-underline transition"
          :class="route.path === article.path ? 'bg-primary/10 text-primary font-semibold' : 'opacity-70 hover:bg-current/5 hover:opacity-100'"
          @click="emit('navigate')"
        >
          <span>{{ article.title }}</span>
        </NuxtLink>
      </li>
      <li v-for="child in category.children" :key="child.id">
        <ArticleNavCategory :category="child" @navigate="emit('navigate')" />
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { categorySubtree, type PublishedArticleCategory } from '~/composables/usePublishedArticles'

const props = defineProps<{ category: PublishedArticleCategory }>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()
// Open where the reader is: on this category's page, a subcategory's, or an article anywhere under it.
const isDocs = computed(() => route.meta.articleCollection === 'docs')
const open = computed(() => isDocs.value || categorySubtree(props.category).some(category =>
  category.path === route.path || category.posts.some(article => article.path === route.path)))
</script>
