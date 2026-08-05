<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawbyPage ? 'blawby' : 'saya'">
    <LazyPlatformHomePage v-if="isPlatform" />
    <TenantPublicPage v-else path="/" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform, siteId, draftId } = useTenantSite()
const { isBlawby: isBlawbyPage } = usePublicTemplate()

if (!isPlatform && !siteId && !draftId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}
</script>
