<template>
  <NuxtLoadingIndicator :color="loadingColor" :height="2" :throttle="150" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { KrabiAnalyticsEvent } from '~/composables/useAnalytics'
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
const runtimeConfig = useRuntimeConfig()
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
const PLATFORM_GA_MEASUREMENT_ID = 'G-NJ1BSP9BYG'

declare global {
  interface Window {
    krabiLayer?: KrabiAnalyticsEvent[]
  }
}

// Google Analytics: only the platform/dashboard surface uses KrabiClaw's own
// GA4 property here. Tenant/Saya pages keep their own pageview-only GA tag in
// layouts/saya.vue and must never inherit the platform product-event bridge.
//
// Deferred loading: platform GA4 is loaded on first interaction (or a long
// passive fallback) to avoid blocking LCP/FCP/TTI. See the note below for why
// requestIdleCallback was removed.
if (import.meta.client) {
  const installKrabiLayerBridge = () => {
    const queue = window.krabiLayer || []
    const currentPush = queue.push.bind(queue)
    queue.push = (...events: KrabiAnalyticsEvent[]) => {
      const result = currentPush(...events)
      for (const event of events) {
        window.gtag?.('event', event.name, event.params)
      }
      return result
    }
    window.krabiLayer = queue
  }

  const flushKrabiLayer = () => {
    if (!window.gtag || !window.krabiLayer?.length) return
    for (const event of window.krabiLayer) {
      window.gtag('event', event.name, event.params)
    }
  }

  const loadGa4 = () => {
    if (runtimeConfig.public.perfNoGa4) return
    if (!isPlatform) return

    const normalizedMeasurementId = PLATFORM_GA_MEASUREMENT_ID
    if (!GA4_MEASUREMENT_ID_RE.test(normalizedMeasurementId)) return

    // Load gtag script
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${normalizedMeasurementId}`
    document.head.appendChild(script)

    // Initialize gtag
    const dataLayer = window.dataLayer || []
    window.dataLayer = dataLayer
    window.gtag = function gtag(...args: unknown[]) { dataLayer.push(args) }
    window.gtag('js', new Date())
    window.gtag('config', normalizedMeasurementId)

    installKrabiLayerBridge()
    flushKrabiLayer()
  }

  // Load GA4 on first real user interaction, so it never competes with
  // Lighthouse's TTI quiet-window on a page nobody is touching.
  // `requestIdleCallback` was tried here previously and made things worse:
  // it fires almost immediately on a content-light/quiet page, injecting the
  // 166KB gtag.js fetch right into the TTI measurement window it was meant to
  // protect (confirmed via interleaved A/B, see HANDOFF-page-speed-2026-07-02.md).
  // A passive-visit fallback still exists, but as a fixed timeout well past
  // any realistic TTI window so it can't preempt the measurement either.
  let loaded = false

  const loadOnInteraction = () => {
    if (!loaded) {
      loaded = true
      loadGa4()
      // Remove event listeners after loading
      document.removeEventListener('click', loadOnInteraction)
      document.removeEventListener('scroll', loadOnInteraction)
      document.removeEventListener('keydown', loadOnInteraction)
    }
  }

  // Passive fallback for visits with zero interaction (e.g. someone just
  // reads the page and leaves). 15s is well past any TTI window.
  setTimeout(() => {
    if (!loaded) {
      loaded = true
      loadGa4()
    }
  }, 15000)

  // Set up interaction listeners
  if (isPlatform) {
    document.addEventListener('click', loadOnInteraction, { once: true, passive: true })
    document.addEventListener('scroll', loadOnInteraction, { once: true, passive: true })
    document.addEventListener('keydown', loadOnInteraction, { once: true, passive: true })
  }
}

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
