<template>
  <nav :aria-label="nav.indexLabel" class="text-sm">
    <ArticleNavCategory v-for="category in nav.categories" :key="category.id" :category="category" class="mb-1" @navigate="emit('navigate')" />
  </nav>
</template>

<script setup lang="ts">
import ArticleNavCategory from '~/components/blog/ArticleNavCategory.vue'
import type { ArticleNav } from '~/composables/useArticleNav'

defineProps<{ nav: ArticleNav }>()
const emit = defineEmits<{ navigate: [] }>()
</script>
