<template>
  <DashboardIndexPanel id="organization-blog" title="Blog">
    <BlogPostList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import BlogPostList from '~/components/dashboard/BlogPostList.vue'

// A row on Menu, nested under it so Menu is both its pane and its Back; the URL stays `/blog`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/blog' })

</script>
