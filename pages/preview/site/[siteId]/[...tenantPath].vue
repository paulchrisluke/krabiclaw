<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="pagePath" :preview-token="previewToken" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { isBlawby } = usePublicTemplate()
const previewToken = computed(() => typeof route.query.token === 'string' ? route.query.token : null)
const rawSegments = route.params.tenantPath
const pagePath = computed(() => {
  const values = Array.isArray(rawSegments) ? rawSegments : [String(rawSegments || '')]
  return '/' + values.filter(Boolean).join('/')
})
</script>
