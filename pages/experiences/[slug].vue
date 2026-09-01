<template>
  <NuxtLayout name="saya">
    <ExperienceDetailPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ key: (route) => route.fullPath })
</script>
