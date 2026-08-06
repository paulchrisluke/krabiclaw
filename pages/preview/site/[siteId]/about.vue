<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage path="/about" :preview-token="previewToken" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { isBlawby } = usePublicTemplate()
const previewToken = computed(() => typeof route.query.token === 'string' ? route.query.token : null)
</script>
