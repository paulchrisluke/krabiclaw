<template>
  <UApp v-if="!skipUApp">
    <NuxtLoadingIndicator v-if="!skipLoadingIndicator" :color="loadingColor" :height="2" :throttle="150" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
  <template v-else>
    <NuxtLoadingIndicator v-if="!skipLoadingIndicator" :color="loadingColor" :height="2" :throttle="150" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </template>
</template>

<script setup lang="ts">
import { calculateThemeColors } from '~/utils/color-utils'
import { buildTenantHeadLinks } from '~/utils/tenant-head'
import { TENANT_TYPES } from '~/utils/tenant-routing'

// --- PERF DEBUG PATCH (temporary — remove after the app-shell isolation test) ---
// Query-flag-gated bypasses for /dev/perf-text only, to find which global
// app-shell layer is responsible for the ~1.15MB / 35-modulepreload payload
// that shows up even on the `text-no-icons` mode. Strictly scoped to this
// one path so no other route's behavior can change:
//   ?shell=no-uapp              — drop the <UApp> provider wrapper
//   ?shell=no-loading-indicator — drop <NuxtLoadingIndicator>
//   ?shell=no-bootstrap         — skip useBootstrap()/tenant head/SEO/GA
//   ?shell=none                 — all three at once
const route = useRoute()
const isPerfTextShellTest = route.path === '/dev/perf-text'
const shellFlag = isPerfTextShellTest
  ? (Array.isArray(route.query.shell) ? route.query.shell[0] : route.query.shell)
  : undefined
const skipUApp = shellFlag === 'no-uapp' || shellFlag === 'none'
const skipLoadingIndicator = shellFlag === 'no-loading-indicator' || shellFlag === 'none'
const skipBootstrap = shellFlag === 'no-bootstrap' || shellFlag === 'none'
// --- END PERF DEBUG PATCH (flags declared; effects below are also marked) ---

const { tenantType, isPlatform, site } = useTenantSite()
if (tenantType === TENANT_TYPES.TENANT_404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site Not Found',
  })
}

// PERF DEBUG PATCH: real useBootstrap() is skipped under ?shell=no-bootstrap
// / ?shell=none so its fetch/config plumbing isn't part of the SSR render.
const { config } = skipBootstrap ? { config: ref<Record<string, unknown>>({}) } : useBootstrap()
const defaultOgImage = useSharedOgImage()
const defaultPageUrl = useSeoUrl(() => route.path)
const defaultSiteName = isPlatform ? 'KrabiClaw' : (site?.brand_name || 'KrabiClaw')
const tenantLogoUrl = computed(() => (config.value as Record<string, unknown>).logo_url || site?.logo_url || null)
const tenantBrandName = computed(() => (config.value as Record<string, unknown>).brand_name || site?.brand_name || '')

// PERF DEBUG PATCH: SEO meta / tenant head links / GA script all skipped
// under the same flag — these are exactly the "tenant head/SEO/GA" pieces
// called out in the isolation test.
if (!skipBootstrap) {
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
        tenantLogoUrl: tenantLogoUrl.value as string | null,
        tenantBrandName: tenantBrandName.value as string,
        isDraftPreview: route.path.startsWith('/preview/draft/'),
      })
    }
  })
}

// Site settings / OAuth-linked GA values are the source of truth. We
// intentionally accept any normalized G-prefixed token instead of hard-coding
// a fixed length, to avoid rejecting future-compatible GA4-style IDs.
const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/

// Google Analytics: platform uses KrabiClaw's own GA4 property. Tenant (Saya)
// pages use the site's own connected GA4 property (server/utils/google-analytics.ts),
// surfaced via site_config → bootstrap config.google_analytics_measurement_id.
// Sites without a GA connection get no tag at all.
if (!skipBootstrap) {
  useHead(() => {
    const measurementId = isPlatform
      ? 'G-NJ1BSP9BYG'
      : (config.value as Record<string, unknown>).google_analytics_measurement_id

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
}

const loadingColor = computed(() => {
  if (isPlatform) return 'var(--kc-loading-rainbow)'
  return 'var(--saya-primary, var(--kc-coral))'
})

// Inject brand color CSS variables from site config. Must run inside a
// component (not a Nuxt plugin) — useBootstrap() depends on useI18n(),
// which requires an active component instance.
if (import.meta.client && !skipBootstrap) {
  watchEffect(() => {
    const brandColor = (config.value as Record<string, unknown>).brand_color as string | undefined
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
