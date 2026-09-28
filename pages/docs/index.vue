<template>
  <ArticleIndex collection="docs" />
</template>

<script setup lang="ts">
import ArticleIndex from '~/components/blog/ArticleIndex.vue'

definePageMeta({ layout: 'articles', articleCollection: 'docs' })
</script>
