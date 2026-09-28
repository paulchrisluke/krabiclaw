<template>
  <ArticleIndex collection="blog" />
</template>

<script setup lang="ts">
import ArticleIndex from '~/components/blog/ArticleIndex.vue'

definePageMeta({ layout: 'articles', articleCollection: 'blog' })
</script>
