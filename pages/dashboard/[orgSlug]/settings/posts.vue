<template>
  <DashboardIndexPanel id="organization-posts" title="Posts">
    <PostList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import PostList from '~/components/dashboard/PostList.vue'

// A row on Menu, nested under it so Menu is both its pane and its Back; the URL
// is `/posts`. A location's Posts row opens this same list, scoped by `?location_id=`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/posts' })
</script>
