<template>
  <!--
    A category on an index or a category page: its name linking to its page,
    its own articles, then each subcategory's, one heading level down. The
    index and a category page draw the same section, so a subcategory reads
    the same wherever it appears.
  -->
  <section v-if="posts.length || children.length" :id="category.slug" class="scroll-mt-28" :class="compact ? 'space-y-3' : 'space-y-6'">
    <component :is="`h${Math.min(level, 6)}`" class="font-bold text-default" :class="compact ? 'text-base leading-6' : level === 2 ? 'border-b border-default pb-3 text-2xl' : 'text-xl'">
      <NuxtLink :to="category.path" class="text-inherit no-underline hover:text-primary">{{ category.name }}</NuxtLink>
    </component>
    <div v-if="posts.length" :class="compact ? 'space-y-0.5' : 'grid gap-6 md:grid-cols-2'">
      <ArticleCard v-for="article in posts" :key="article.id" :article="article" :compact="compact" />
    </div>
    <ArticleCategorySection v-for="child in children" :key="child.id" :category="child" :level="level + 1" :exclude="exclude" :compact="compact" />
  </section>
</template>

<script setup lang="ts">
import ArticleCard from '~/components/blog/ArticleCard.vue'
import { categorySubtree, type PublishedArticleCategory } from '~/composables/usePublishedArticles'

const props = withDefaults(defineProps<{
  compact?: boolean
  category: PublishedArticleCategory
  /** The heading level of this category's name. */
  level?: number
  /** An article shown elsewhere on the page — the index's lead — that is not repeated. */
  exclude?: string | null
}>(), { level: 2, exclude: null, compact: false })

const posts = computed(() => props.category.posts.filter(post => post.id !== props.exclude))
const children = computed(() => props.category.children.filter(child =>
  categorySubtree(child).some(category => category.posts.some(post => post.id !== props.exclude))))
</script>
