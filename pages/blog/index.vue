<template>
  <PlatformBlogIndex v-if="isPlatform" />
  <SayaBlogIndex v-else />
</template>

<script setup lang="ts">
const { isPlatform } = useTenantSite()
definePageMeta({ layout: false })
setPageLayout(isPlatform ? 'blog' : 'saya')
</script>
