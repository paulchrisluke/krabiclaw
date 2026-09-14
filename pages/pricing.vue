<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'platform'">
    <LazyBlawbyTenantPage v-if="isBlawby" :path="documentPath" />
    <LazyPlatformPricingPage v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
const documentPath = useTenantPageDocumentPath('pricing')

definePageMeta({ layout: false })
</script>
