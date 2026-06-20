<template>
  <UApp>
    <NuxtLoadingIndicator :color="loadingColor" :height="2" :throttle="150" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
const { isPlatform, site } = useTenantSite()
const route = useRoute()
const defaultOgImage = useSharedOgImage()
const defaultPageUrl = useSeoUrl(() => route.path)
const defaultSiteName = isPlatform ? 'KrabiClaw' : (site?.brand_name || 'KrabiClaw')

useSeoMeta({
  ogImage: defaultOgImage,
  ogUrl: defaultPageUrl,
  ogType: 'website',
  ogSiteName: defaultSiteName,
  twitterCard: 'summary_large_image',
  twitterImage: defaultOgImage
})

const loadingColor = computed(() => {
  if (isPlatform) return 'var(--kc-loading-rainbow)'
  return 'var(--saya-primary, var(--kc-coral))'
})
</script>
