<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
    :data-hydrated="hydrated ? 'true' : 'false'"
    :data-public-critical-shell="isHome ? 'true' : undefined"
  >
    <!-- Teleport target for Saya components (e.g. BookingModal) that need to escape
         page overflow/stacking contexts but still must render inside this div to
         inherit the --ui-*/--brand-color tokens .saya-theme and themeStyles set here.
         Teleporting straight to <body> puts them outside this scope entirely, which
         reads as the modal falling back to the platform's default (non-Saya) theme.
         Placed before the page content (rather than after) so it precedes any
         Teleport source in document order during SSR — Teleport targets that only
         appear later in the same render caused a hydration child-count mismatch. -->
    <div id="saya-portal-root" />

    <SayaHeader
      :site="resolvedSite"
      :locations="locations"
      :has-products="shell.hasProducts.value"
      :has-experiences="showExperiences"
      :experience-cta-path="locationExperienceCtaPath"
    />
    <main class="grow" :data-route-shell="route.path">
      <slot />
    </main>
    <LazySayaFooter
      :site="resolvedSite"
      :is-platform="isPlatform"
      :locations="locations"
      :locales="locales"
      :error="bootstrapError"
      :config="config"
      :has-products="shell.hasProducts.value"
      :has-experiences="showExperiences"
    />
  </div>
</template>

<script setup lang="ts">
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'
import { getPreviewSubpath } from '~/composables/usePublicPageRequest'
import sayaCriticalCss from '~/assets/css/saya-critical.css?raw'
import '~/assets/css/saya-entry.css'

const route = useRoute()
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const { locale: activeLocale } = useI18n()
const isHome = computed(() => route.path === '/'
  || (activeLocale.value !== 'en' && route.path === `/${activeLocale.value}`)
  || getPreviewSubpath(route.path) === '/')
const sayaStylesheetHref = '/_nuxt/surfaces/saya.css'
const sayaStylesheetForRoute = computed(() => {
  return sayaStylesheetHref
})

useHead(() => {
  return {
    htmlAttrs: { lang: activeLocale.value },
    link: [
      { rel: 'preconnect', href: 'https://imagedelivery.net' },
      { rel: 'preconnect', href: 'https://media.krabiclaw.com' },
      {
        key: isHome.value ? 'saya-home-stylesheet' : 'saya-surface-stylesheet',
        rel: 'stylesheet',
        href: sayaStylesheetForRoute.value,
      },
    ],
    style: isHome.value ? [{ innerHTML: sayaCriticalCss, tagPriority: 'critical' }] : [],
  }
})

declare global {
  interface Window {
    toggleSayaDark?: () => void
  }
}

if (import.meta.dev) useDebugLCP()

// Persistent chrome uses the minimal shell contract. Route-specific Product and
// experience data comes from the keyed page loader and changes independently.
const shell = useSiteShellState()
if (import.meta.server && isHome.value) await shell.ready
const { config, locations, hasExperiences, locales, error: bootstrapError, site: shellSite } = shell
const { isPlatform, siteId, draftId, site } = useTenantSite()
const pageParams = usePublicPageRequest()
const activePageKey = computed(() => usePublicPageKey(siteId || draftId || null, pageParams.value))
const nuxtApp = useNuxtApp()
const pagePayload = computed(() =>
  (nuxtApp.payload.data[activePageKey.value] as ApiRecord | undefined)
  ?? (nuxtApp.static.data[activePageKey.value] as ApiRecord | undefined)
  ?? null,
)
const experiencesList = computed(() =>
  Array.isArray(pagePayload.value?.experiencesList)
    ? pagePayload.value.experiencesList as ApiRecord[]
    : [],
)
const showExperiences = computed(() => hasExperiences.value || experiencesList.value.length > 0)
const resolvedSite = computed(() => shellSite.value || site)
const brandColor = computed(
  () => config.value?.brand_color || null
)
const brandTextColor = computed(() => getContrastColor(brandColor.value))

const themeStyles = computed(() => {
  if (!brandColor.value) return {}
  return {
    '--brand-color': brandColor.value,
    '--brand-color-foreground': brandTextColor.value,
  }
})

const googleSiteVerification = computed(() => config.value?.google_site_verification || null)

// Request-scoped URL state must be captured eagerly during setup. Tenant routing
// already 301s alternate subdomains to the configured custom domain, so the
// rendered request origin is the canonical origin for every indexable tenant page.
const requestURL = useRequestURL()
const requestHostname = requestURL.hostname
const routeLocationSlug = computed(() => {
  const match = route.path.match(/^\/locations\/([^/]+)/)
  return match?.[1] ?? null
})

if (import.meta.client) {
  const sayaTheme = usePlatformTheme()
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemThemeChange = () => sayaTheme.sync()

  onMounted(() => sayaTheme.restore())
  prefersDark.addEventListener('change', onSystemThemeChange)
  window.toggleSayaDark = () => {
    const isDark = !document.documentElement.classList.contains('dark')
    sayaTheme.setPreference(isDark ? 'dark' : 'light')
  }

  onBeforeUnmount(() => {
    prefersDark.removeEventListener('change', onSystemThemeChange)
    delete window.toggleSayaDark
  })
}
const locationExperienceCtaPath = computed(() => {
  if (!routeLocationSlug.value) return undefined
  return resolveLocationExperienceHref(routeLocationSlug.value, experiencesList.value)
})

// Shared demo-host check: the synthetic "Ember & Slice" showcase site isn't a
// real business collecting real visitor data, so it's excluded from search
// (see siteRobots below) and skips the cookie-consent banner entirely rather
// than asking demo visitors to accept/reject tracking that isn't happening.
// Matches these exact hosts (see seed-definitions/demo.ts siteDomains) rather
// than a "demo." prefix — a real tenant's own custom domain (e.g.
// demo.example.com) can legitimately start with "demo." and must not be
// treated as our internal showcase site.
const DEMO_HOSTS = new Set(['demo.krabiclaw.com', 'demo.localhost'])
const isDemoHost = DEMO_HOSTS.has(requestHostname)

// Site-wide default only — individual pages set their own robots directive
// when they have one; this covers pages without a page-specific directive.
const siteRobots = computed(() => {
  if (isDemoHost) {
    return 'noindex, nofollow'
  }
  return config.value?.robots || null
})

useSocialMetadata(() => ({
  path: route.path,
  title: config.value?.seo_title || config.value?.brand_name || resolvedSite.value?.brand_name || '',
  description: config.value?.seo_description || config.value?.brand_description || '',
  brand: {
    siteName: config.value?.brand_name || resolvedSite.value?.brand_name || '',
  },
  robots: siteRobots.value,
}))

useHead(() => {
  return {
    meta: googleSiteVerification.value
      ? [{ name: 'google-site-verification', content: googleSiteVerification.value }]
      : [],
  }
})
</script>

<style>
/* Saya theme CSS variables */
.saya-theme {
  --brand-color: #16a34a;
}
</style>
