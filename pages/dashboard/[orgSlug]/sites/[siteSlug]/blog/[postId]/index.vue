<template>
  <BlogPostEditorPage />
</template>

<script setup lang="ts">
import BlogPostEditorPage from '~/components/dashboard/BlogPostEditorPage.vue'

definePageMeta({ layout: 'dashboard', ownsChrome: true })
</script>
