<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
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
      :menu="menu"
      :has-menu="shell.hasMenu.value"
      :has-experiences="showExperiences"
      :experience-cta-path="locationExperienceCtaPath"
    />
    <main class="grow" :data-route-shell="routeLoadState.path || route.path">
      <div
        v-if="publicPending"
        class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
        data-testid="public-route-loading"
      >
        <div class="h-7 w-44 animate-pulse rounded bg-elevated" />
        <div class="mt-5 h-12 max-w-2xl animate-pulse rounded bg-elevated" />
        <div class="mt-10 grid gap-6 md:grid-cols-2">
          <div v-for="index in 2" :key="index" class="h-56 animate-pulse rounded bg-elevated" />
        </div>
      </div>
      <div
        v-else-if="publicError"
        class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6"
        data-testid="public-route-error"
      >
        <h1 class="saya-display-md text-default">{{ $t('error.page_not_loaded') }}</h1>
        <p class="mt-4 text-sm text-muted">{{ $t('error.generic_message') }}</p>
        <button type="button" class="mt-8 border border-default px-5 py-3 text-sm" @click="retryPublicData">
          {{ $t('action.try_again') }}
        </button>
      </div>
      <slot v-else />
    </main>
    <LazySayaFooter
      :site="resolvedSite"
      :is-platform="isPlatform"
      :locations="locations"
      :locales="locales"
      :error="bootstrapError"
      :config="config"
      :menu="menu"
      :has-menu="shell.hasMenu.value"
      :has-experiences="showExperiences"
    />
    <ConsentBanner v-if="!isDemoHost" />
  </div>
</template>

<script setup lang="ts">
import ConsentBanner from '~/components/ConsentBanner.vue'
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'

if (import.meta.dev) useDebugLCP()

// Persistent chrome uses the minimal shell contract. Route-specific menu and
// experience data comes from the keyed page loader and changes independently.
const shell = useSiteShellState()
const { config, locations, hasExperiences, locales, error: bootstrapError, site: shellSite } = shell
const routeLoadState = usePublicRouteLoadState()
const publicPending = computed(() => shell.pending.value || routeLoadState.value.pending)
const publicError = computed(() => shell.error.value || routeLoadState.value.error)
const retryPublicData = async () => {
  if (shell.error.value) {
    await shell.refresh()
    return
  }
  if (routeLoadState.value.error && routeLoadState.value.key) {
    await refreshNuxtData(routeLoadState.value.key)
  }
}
const activePageKey = computed(() => routeLoadState.value.key)
const nuxtApp = useNuxtApp()
const pagePayload = computed(() =>
  (nuxtApp.payload.data[activePageKey.value] as ApiRecord | undefined)
  ?? (nuxtApp.static.data[activePageKey.value] as ApiRecord | undefined)
  ?? null,
)
const menu = computed(() => (pagePayload.value?.menu as ApiRecord | null | undefined) ?? null)
const experiencesList = computed(() =>
  Array.isArray(pagePayload.value?.experiencesList)
    ? pagePayload.value.experiencesList as ApiRecord[]
    : [],
)
const showExperiences = computed(() => hasExperiences.value || experiencesList.value.length > 0)
const { isPlatform, site } = useTenantSite()
const resolvedSite = computed(() => shellSite.value || site)
const route = useRoute()
// Called for its side effect: keeps the consent ref in sync and lets the
// head markup emit the default signal ahead of any analytics config.
useCookieConsent()

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

const ogTitle = computed(() => config.value?.seo_title || config.value?.brand_name || null)
const ogDescription = computed(() => truncateForSeo(config.value?.seo_description || config.value?.brand_description, 160) || null)
const ogImage = computed(() =>
  config.value?.og_image_url ||
  locations.value[0]?.hero_image_public_url ||
  config.value?.logo_url ||
  null
)

// Request-scoped URL state must be captured eagerly during setup. Tenant routing
// already 301s alternate subdomains to the configured custom domain, so the
// rendered request origin is the canonical origin for every indexable tenant page.
const requestURL = useRequestURL()
const requestHostname = requestURL.hostname
const canonicalUrl = computed(() => new URL(route.path, requestURL.origin).toString())
const routeLocationSlug = computed(() => {
  const match = route.path.match(/^\/locations\/([^/]+)/)
  return match?.[1] ?? null
})
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
// when they have one; this is the fallback for pages that don't.
const siteRobots = computed(() => {
  if (isDemoHost) {
    return 'noindex, nofollow'
  }
  return config.value?.robots || null
})

useHead(() => {
  const meta = []

  meta.push({ property: 'og:type', content: 'website' })
  meta.push({ name: 'twitter:card', content: 'summary_large_image' })
  if (ogTitle.value) {
    meta.push({ property: 'og:title', content: ogTitle.value })
    meta.push({ name: 'twitter:title', content: ogTitle.value })
    meta.push({ property: 'og:site_name', content: ogTitle.value })
  }
  if (ogDescription.value) {
    meta.push({ property: 'og:description', content: ogDescription.value })
    meta.push({ name: 'twitter:description', content: ogDescription.value })
  }
  if (ogImage.value) meta.push({ property: 'og:image', content: ogImage.value })
  if (siteRobots.value) meta.push({ name: 'robots', content: siteRobots.value })

  if (googleSiteVerification.value) {
    meta.push({
      name: 'google-site-verification',
      content: googleSiteVerification.value
    })
  }
  return {
    meta,
    link: [{ rel: 'canonical', href: canonicalUrl.value }],
  }
})
</script>

<style>
/* Saya theme CSS variables */
.saya-theme {
  --brand-color: #16a34a;
}
</style>
