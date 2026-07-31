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
      :has-experiences="showExperiences"
      :experience-cta-path="locationExperienceCtaPath"
    />
    <main class="grow">
      <slot />
    </main>
    <LazySayaFooter
      :site="resolvedSite"
      :is-platform="isPlatform"
      :locations="locations"
      :locales="locales"
      :error="bootstrapError"
      :config="config"
      :menu="menu"
      :has-experiences="showExperiences"
    />
    <ConsentBanner v-if="!isDemoHost" />
  </div>
</template>

<script setup lang="ts">
import ConsentBanner from '~/components/ConsentBanner.vue'
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

type BrandConfigResponse = { config: Record<string, unknown> }

const hasRecordConfig = (value: unknown): value is BrandConfigResponse =>
  isRecord(value) && isRecord(value.config)

if (import.meta.dev) useDebugLCP()

// Persistent chrome uses the minimal shell contract. Route-specific menu and
// experience data comes from the keyed page loader and changes independently.
const { config, locations, hasExperiences, locales, error: bootstrapError, site: shellSite } = useSiteShellState()
const { menu, experiencesList } = await useBootstrap()
const showExperiences = computed(() => hasExperiences.value || experiencesList.value.length > 0)
const { siteId, draftId, isTenant, isPlatform, site, organizationId } = useTenantSite()
const resolvedSite = computed(() => shellSite.value || site)
const route = useRoute()
// Called for its side effect: keeps the consent ref in sync and lets the
// head markup emit the default signal ahead of any analytics config.
useCookieConsent()

// Brand config is kept as a dedicated, narrowly scoped query so theme tokens
// are known before first paint without coupling them to route-specific data.
const draftPreviewToken = typeof route.query.token === 'string' ? route.query.token : ''
const brandConfigUrl = draftId && draftPreviewToken
  ? `/api/public/drafts/${draftId}/bootstrap?preview=true&token=${encodeURIComponent(draftPreviewToken)}&menu=1`
  : siteId
    ? `/api/public/sites/${siteId}/config`
    : ''
const requestEvent = useRequestEvent()
const requestFetch = useRequestFetch()
const { data: brandConfigData } = isTenant && brandConfigUrl
  ? await useAsyncData(
      draftId ? `draft-brand-config-${draftId}-${draftPreviewToken}` : `site-brand-config-${siteId}`,
      async () => {
        if (import.meta.server && siteId && organizationId && requestEvent) {
          const [{ cloudflareEnv }, { getConfig }] = await Promise.all([
            import('~/server/utils/api-response'),
            import('~/server/utils/site-config'),
          ])
          const env = cloudflareEnv(requestEvent)
          if (!env.DB) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
          return { config: await getConfig(env.DB, organizationId, siteId) }
        }
        if (import.meta.server) return await requestFetch(brandConfigUrl)
        return await publicApiRequest<BrandConfigResponse>(brandConfigUrl, {
          coalesceKey: `brand-config:${siteId || draftId}`,
          validate: hasRecordConfig,
        })
      },
      { server: true },
    )
  : { data: ref(null) }

const brandConfig = computed(() => hasRecordConfig(brandConfigData.value) ? brandConfigData.value.config : {})
const brandColor = computed(
  () => typeof brandConfig.value.brand_color === 'string' ? brandConfig.value.brand_color : config.value?.brand_color || null
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
