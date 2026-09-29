<template>
  <ArticleCategoryPage collection="docs" />
</template>

<script setup lang="ts">
import ArticleCategoryPage from '~/components/blog/ArticleCategoryPage.vue'

definePageMeta({ layout: 'articles', articleCollection: 'docs' })
</script>
