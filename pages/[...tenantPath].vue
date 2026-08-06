<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="pagePath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { isPlatform, isTenant, siteId } = useTenantSite()
const { isBlawby } = usePublicTemplate()
if (isPlatform || !isTenant || !siteId) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const segments = route.params.tenantPath
const pagePath = computed(() => {
  const values = Array.isArray(segments) ? segments : [String(segments || '')]
  return '/' + values.filter(Boolean).join('/')
})
</script>
