<template>
  <NuxtLayout :name="isPlatform ? 'blog' : isBlawby ? 'blawby' : 'saya'">
    <PlatformBlogIndex v-if="isPlatform" />
    <BlawbyBlogIndex v-else-if="isBlawby" />
    <SayaBlogIndex v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
definePageMeta({ layout: false })
</script>
