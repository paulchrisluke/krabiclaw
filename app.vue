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
  if (isPlatform) {
    return {
      link: [
        { key: 'app-icon-96', rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { key: 'app-icon-shortcut', rel: 'shortcut icon', href: '/favicon.ico' },
        { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { key: 'app-manifest', rel: 'manifest', href: '/site.webmanifest' }
      ]
    }
  }

  if (tenantLogoUrl.value) {
    return {
      link: [
        { key: 'app-icon-96', rel: 'icon', href: tenantLogoUrl.value, sizes: '96x96' },
        { key: 'app-icon-default', rel: 'icon', href: tenantLogoUrl.value },
        { key: 'app-icon-shortcut', rel: 'shortcut icon', href: tenantLogoUrl.value },
        { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: tenantLogoUrl.value },
        { key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' }
      ]
    }
  }

  const trimmedName = tenantBrandName.value.trim()
  const letter = trimmedName.charAt(0).toUpperCase() || 'K'
  const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const safeLetter = letter.replace(/[&<>"']/g, (c: string) => escapeMap[c])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%231F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${safeLetter}</text></svg>`
  const fallback = `data:image/svg+xml,${encodeURIComponent(svg)}`

  return {
    link: [
      { key: 'app-icon-svg', rel: 'icon', type: 'image/svg+xml', href: fallback },
      { key: 'app-icon-shortcut', rel: 'shortcut icon', href: fallback },
      { key: 'app-icon-apple', rel: 'apple-touch-icon', sizes: '180x180', href: fallback },
      { key: 'app-manifest', rel: 'manifest', href: '/tenant.webmanifest' }
    ]
  }
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
