<template>
  <NuxtLayout :name="isPlatform ? 'blog' : 'saya'">
    <PlatformBlogIndex v-if="isPlatform" />
    <SayaBlogIndex v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isPlatform } = useTenantSite()
definePageMeta({ layout: false })
</script>
