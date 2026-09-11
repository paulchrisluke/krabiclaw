<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawbyPage ? 'blawby' : 'saya'">
    <LazyPlatformHomePage v-if="isPlatform" />
    <LazyBlawbyHome v-else-if="isBlawbyPage" />
    <LazySayaHomePage v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()
const { isBlawby: isBlawbyPage } = usePublicTemplate()

if (!isPlatform && !siteId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// A signed-in owner has no use for the platform's own sales pitch, and showing
// it to them is how a returning owner ends up clicking "Start free" and opening
// a second account. The marketing homepage is for people who do not have an
// account yet; everyone else goes to their dashboard. Anonymous visitors and
// crawlers are untouched, so the cached public page is unchanged.
if (isPlatform) {
  const { user } = await useAuthSession()
  if (user.value) await navigateTo('/api/post-login', { external: true, redirectCode: 302 })
}
</script>
