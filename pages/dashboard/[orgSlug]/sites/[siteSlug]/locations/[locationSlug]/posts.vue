<template>
  <DashboardIndexPanel id="location-posts" title="Posts">
    <PostList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import PostList from '~/components/dashboard/PostList.vue'

definePageMeta({ layout: 'dashboard' })
</script>
