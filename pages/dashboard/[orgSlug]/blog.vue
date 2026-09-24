<template>
  <DashboardIndexPanel id="organization-blog" title="Blog">
    <BlogPostList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import BlogPostList from '~/components/dashboard/BlogPostList.vue'

// Blog is a row on Menu, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-settings' })

</script>
