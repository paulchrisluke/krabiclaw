<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'platform'">
    <LazyBlawbyTenantPage v-if="isBlawby" path="/pricing" />
    <LazyPlatformPricingPage v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()

definePageMeta({ layout: false })
</script>
