<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <SiteLinksPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
const { isBlawby } = usePublicTemplate()
</script>
