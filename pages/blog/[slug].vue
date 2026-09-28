<template>
  <!-- A template that serves its blog articles at another prefix (/article) redirects there first. -->
  <ArticlePage collection="blog" />
</template>

<script setup lang="ts">
import ArticlePage from '~/components/blog/ArticlePage.vue'

definePageMeta({ layout: 'articles', articleCollection: 'blog', middleware: 'tenant-blog-canonical' })
</script>
