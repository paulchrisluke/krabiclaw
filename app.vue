<template>
  <UApp>
    <NuxtLoadingIndicator :color="loadingColor" :height="2" :throttle="150" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { calculateThemeColors } from '~/utils/color-utils'

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

// Inject brand color CSS variables from site config. Must run inside a
// component (not a Nuxt plugin) — useBootstrap() depends on useI18n(),
// which requires an active component instance.
if (import.meta.client) {
  const { config } = useBootstrap()
  watchEffect(() => {
    const brandColor = config.value.brand_color
    if (!brandColor) return
    const themeColors = calculateThemeColors(brandColor)
    const root = document.documentElement
    root.style.setProperty('--brand-color', themeColors.brandColor)
    root.style.setProperty('--brand-color-foreground', themeColors.brandColorForeground)
    root.style.setProperty('--brand-color-dark', themeColors.brandColorDark)
    root.style.setProperty('--brand-color-foreground-dark', themeColors.brandColorForegroundDark)
  })
}
</script>
