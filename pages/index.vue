<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawbyPage ? 'blawby' : 'saya'">
    <!--
      A Blawby home is its page document, drawn block by block like every other
      page on the site. It was a component that found each block by a `section`
      string and composed a fixed list, so reordering the page changed nothing.
    -->
    <TenantPublicPage v-if="isPlatform" :path="platformHomePath" />
    <TenantPublicPage v-else-if="isBlawbyPage" path="/" />
    <LazySayaHomePage v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()
const { isBlawby: isBlawbyPage } = usePublicTemplate()
// KrabiClaw's own homepage is an ordinary published page document on the
// platform site now, read by the same loader every customer site uses (#903).
const platformHomePath = useTenantPageDocumentPath('home')

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
