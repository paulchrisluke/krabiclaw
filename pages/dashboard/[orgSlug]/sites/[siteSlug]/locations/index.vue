<template><div /></template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
await navigateTo(
  `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`,
  { redirectCode: 302, replace: true },
)
</script>
