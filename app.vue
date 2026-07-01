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
import { buildTenantHeadLinks } from '~/utils/tenant-head'
import { TENANT_TYPES } from '~/utils/tenant-routing'

const { tenantType, isPlatform, site } = useTenantSite()
if (tenantType === TENANT_TYPES.TENANT_404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site Not Found',
  })
}

const { config } = useBootstrap()
const route = useRoute()
const defaultOgImage = useSharedOgImage()
const defaultPageUrl = useSeoUrl(() => route.path)
const defaultSiteName = isPlatform ? 'KrabiClaw' : (site?.brand_name || 'KrabiClaw')
const tenantLogoUrl = computed(() => config.value.logo_url || site?.logo_url || null)
const tenantBrandName = computed(() => config.value.brand_name || site?.brand_name || '')

useSeoMeta({
  ogImage: defaultOgImage,
  ogUrl: defaultPageUrl,
  ogType: 'website',
  ogSiteName: defaultSiteName,
  twitterCard: 'summary_large_image',
  twitterImage: defaultOgImage
})

useHead(() => {
  return {
    link: buildTenantHeadLinks({
      isPlatform,
      tenantLogoUrl: tenantLogoUrl.value,
      tenantBrandName: tenantBrandName.value,
      isDraftPreview: route.path.startsWith('/preview/draft/'),
    })
  }
})

// Site settings / OAuth-linked GA values are the source of truth. We
// intentionally accept any normalized G-prefixed token instead of hard-coding
// a fixed length, to avoid rejecting future-compatible GA4-style IDs.
const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/

// Google Analytics: platform uses KrabiClaw's own GA4 property. Tenant (Saya)
// pages use the site's own connected GA4 property (server/utils/google-analytics.ts),
// surfaced via site_config → bootstrap config.google_analytics_measurement_id.
// Sites without a GA connection get no tag at all.
useHead(() => {
  const measurementId = isPlatform
    ? 'G-NJ1BSP9BYG'
    : config.value.google_analytics_measurement_id

  const normalizedMeasurementId = String(measurementId || '').trim().toUpperCase()
  if (!normalizedMeasurementId || !GA4_MEASUREMENT_ID_RE.test(normalizedMeasurementId)) return {}

  return {
    script: [
      {
        src: `https://www.googletagmanager.com/gtag/js?id=${normalizedMeasurementId}`,
        async: true
      },
      {
        key: 'krabiclaw-ga-init',
        innerHTML: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${normalizedMeasurementId}');`
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
