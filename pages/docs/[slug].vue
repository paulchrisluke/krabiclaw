<template>
  <ArticlePage collection="docs" />
</template>

<script setup lang="ts">
import ArticlePage from '~/components/blog/ArticlePage.vue'

definePageMeta({ layout: 'articles', articleCollection: 'docs' })
</script>
