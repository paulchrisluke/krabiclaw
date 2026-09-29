<template>
  <ArticleCategoryPage collection="blog" />
</template>

<script setup lang="ts">
import ArticleCategoryPage from '~/components/blog/ArticleCategoryPage.vue'

definePageMeta({ layout: 'articles', articleCollection: 'blog' })
</script>
