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
const { config } = useBootstrap()
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

// GA4 measurement ID format ("G-XXXXXXXXXX") — validated before interpolation
// since the init script below renders with sanitizers disabled.
const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/i

// Google Analytics: platform uses KrabiClaw's own GA4 property. Tenant (Saya)
// pages use the site's own connected GA4 property (server/utils/google-analytics.ts),
// surfaced via site_config → bootstrap config.google_analytics_measurement_id.
// Sites without a GA connection get no tag at all.
useHead(() => {
  const measurementId = isPlatform
    ? 'G-NJ1BSP9BYG'
    : config.value.google_analytics_measurement_id

  if (!measurementId || !GA4_MEASUREMENT_ID_RE.test(measurementId)) return {}

  return {
    script: [
      {
        src: `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
        async: true
      },
      {
        key: 'krabiclaw-ga-init',
        innerHTML: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${measurementId}');`
      }
    ],
    __dangerouslyDisableSanitizersByTagID: {
      'krabiclaw-ga-init': ['innerHTML']
    }
  }
})

const loadingColor = computed(() => {
  if (isPlatform) return 'var(--kc-loading-rainbow)'
  return 'var(--saya-primary, var(--kc-coral))'
})

// Inject brand color CSS variables from site config. Must run inside a
// component (not a Nuxt plugin) — useBootstrap() depends on useI18n(),
// which requires an active component instance.
if (import.meta.client) {
  watchEffect(() => {
    const brandColor = config.value.brand_color
    if (!brandColor) return
    try {
      const themeColors = calculateThemeColors(brandColor)
      const root = document.documentElement
      root.style.setProperty('--brand-color', themeColors.brandColor)
      root.style.setProperty('--brand-color-foreground', themeColors.brandColorForeground)
      root.style.setProperty('--brand-color-dark', themeColors.brandColorDark)
      root.style.setProperty('--brand-color-foreground-dark', themeColors.brandColorForegroundDark)
    } catch (error) {
      console.error('Failed to apply brand color theme:', error)
    }
  })
}
</script>
