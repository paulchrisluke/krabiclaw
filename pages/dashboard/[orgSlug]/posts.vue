<template>
  <DashboardIndexPanel id="organization-posts" title="Posts">
    <PostList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import PostList from '~/components/dashboard/PostList.vue'

// A row on Menu: Menu is both its pane and its Back. A location's Posts row
// opens this same list, scoped by `?location_id=`.
definePageMeta({ layout: 'dashboard', tab: 'menu', back: 'dashboard-orgSlug-menu' })
</script>
